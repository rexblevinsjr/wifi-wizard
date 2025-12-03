import os, json, time, subprocess, threading, signal
from datetime import datetime, timezone, timedelta
from pathlib import Path

# -------- CONFIG YOU CAN TUNE --------
SCAN_INTERVAL_MIN = 5          # run scanner every N minutes
OPTIMIZE_INTERVAL_HR = 6       # run AI optimizer every N hours
PING_INTERVAL_SEC = 5          # ping check frequency
OUTAGE_START_SEC = 15          # continuous ping fail before counting outage
OUTAGE_MIN_DURATION_SEC = 10   # ignore super short blips
HISTORY_FILE = Path("agent_history.jsonl")
LATEST_REPORT_FILE = Path("latest_report.json")

PING_TARGETS = ["1.1.1.1", "8.8.8.8"]
MAX_PING_TIMEOUT_MS = 1500

# ------------------------------------

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def run_cmd(cmd):
    try:
        out = subprocess.check_output(cmd, shell=True, stderr=subprocess.STDOUT, text=True)
        return out.strip()
    except subprocess.CalledProcessError as e:
        return e.output.strip()

def safe_append_jsonl(path: Path, obj: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a") as f:
        f.write(json.dumps(obj) + "\n")

def load_last_event(path: Path, event_type: str):
    if not path.exists():
        return None
    try:
        lines = path.read_text().strip().splitlines()
        for line in reversed(lines):
            try:
                obj = json.loads(line)
                if obj.get("type") == event_type:
                    return obj
            except:
                continue
    except:
        return None
    return None

# ---------------- PING / OUTAGE MONITOR ----------------

class OutageMonitor:
    def __init__(self):
        self.current_outage_start = None
        self.last_ok_time = time.time()
        self.last_wifi_ssid = None
        self.running = True

    def ping_once(self):
        # try targets. if any success => OK
        for target in PING_TARGETS:
            cmd = f"ping -c 1 -W {MAX_PING_TIMEOUT_MS//1000} {target}"
            out = run_cmd(cmd)
            if "1 packets transmitted, 1 packets received" in out or "1 received" in out:
                return True
        return False

    def get_current_ssid_mac(self):
        # macOS: reads current SSID (if connected)
        cmd = "networksetup -getairportnetwork en0"
        out = run_cmd(cmd)
        if "Current Wi-Fi Network" in out:
            return out.split(":")[-1].strip()
        return None

    def loop(self):
        print("OutageMonitor running...")
        while self.running:
            ok = self.ping_once()
            ssid = self.get_current_ssid_mac()
            self.last_wifi_ssid = ssid if ssid else self.last_wifi_ssid

            ts = now_iso()

            if ok:
                self.last_ok_time = time.time()
                if self.current_outage_start:
                    # close outage
                    duration = time.time() - self.current_outage_start
                    if duration >= OUTAGE_MIN_DURATION_SEC:
                        event = {
                            "type": "outage",
                            "ts_start": datetime.fromtimestamp(self.current_outage_start, tz=timezone.utc).isoformat(),
                            "ts_end": ts,
                            "duration_sec": round(duration, 2),
                            "ssid_at_time": self.last_wifi_ssid,
                            "kind": "internet_down"
                        }
                        safe_append_jsonl(HISTORY_FILE, event)
                        print(f"[OUTAGE END] {event}")
                    self.current_outage_start = None

                # log heartbeat (lightweight)
                safe_append_jsonl(HISTORY_FILE, {
                    "type": "ping_heartbeat",
                    "ts": ts,
                    "ok": True,
                    "ssid": ssid
                })

            else:
                # failing
                if not self.current_outage_start:
                    # only start if continuous fail > OUTAGE_START_SEC
                    if (time.time() - self.last_ok_time) >= OUTAGE_START_SEC:
                        self.current_outage_start = time.time()
                        print(f"[OUTAGE START] {ts}")
                safe_append_jsonl(HISTORY_FILE, {
                    "type": "ping_heartbeat",
                    "ts": ts,
                    "ok": False,
                    "ssid": ssid
                })

            time.sleep(PING_INTERVAL_SEC)

    def stop(self):
        self.running = False

# ---------------- SCAN / ANALYZE / OPTIMIZE ----------------

def run_scanner():
    print("Running scanner.py...")
    out = run_cmd("python3 scanner.py")
    print(out)

def run_optimizer():
    print("Running optimizer.py...")
    out = run_cmd("python3 optimizer.py")
    print(out)

def read_json_file(path):
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except:
        return None

def snapshot_event():
    scan = read_json_file(Path("wifi_scan.json"))
    report = read_json_file(LATEST_REPORT_FILE)

    event = {
        "type": "snapshot",
        "ts": now_iso(),
        "scan": scan,
        "report": report
    }
    safe_append_jsonl(HISTORY_FILE, event)
    print("[SNAPSHOT SAVED]")

# ---------------- SCHEDULER ----------------

class Scheduler:
    def __init__(self):
        self.next_scan = time.time()
        self.next_optimize = time.time()
        self.running = True

    def loop(self):
        print("Scheduler running...")
        while self.running:
            now = time.time()

            if now >= self.next_scan:
                run_scanner()
                snapshot_event()
                self.next_scan = now + (SCAN_INTERVAL_MIN * 60)

            if now >= self.next_optimize:
                # optimize less frequently
                run_optimizer()
                snapshot_event()
                self.next_optimize = now + (OPTIMIZE_INTERVAL_HR * 3600)

            time.sleep(2)

    def stop(self):
        self.running = False

# ---------------- MAIN ----------------

def main():
    print("agent_core.py starting...")

    monitor = OutageMonitor()
    scheduler = Scheduler()

    # Threads so ping monitoring doesn't block scheduled scans
    t1 = threading.Thread(target=monitor.loop, daemon=True)
    t2 = threading.Thread(target=scheduler.loop, daemon=True)
    t1.start()
    t2.start()

    def shutdown(signum, frame):
        print("\nShutting down agent_core...")
        monitor.stop()
        scheduler.stop()
        time.sleep(1)
        raise SystemExit

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    # Keep alive
    while True:
        time.sleep(1)

if __name__ == "__main__":
    main()
