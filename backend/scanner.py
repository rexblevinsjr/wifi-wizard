import platform, subprocess, json, re, time, argparse
from pathlib import Path

try:
    import speedtest
except ImportError:
    speedtest = None

OUTFILE = "wifi_scan.json"

def run_cmd(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout

def parse_signal_noise(s):
    # expected like "-56 dBm / -91 dBm"
    m = re.findall(r"(-?\d+)\s*dBm", s or "")
    if len(m) >= 2:
        return int(m[0]), int(m[1])
    if len(m) == 1:
        return int(m[0]), None
    return None, None

def scan_macos():
    out = run_cmd("system_profiler SPAirPortDataType -json")
    data = json.loads(out)
    nets = []
    iface = data["SPAirPortDataType"][0]["spairport_airport_interfaces"][0]
    others = iface.get("spairport_airport_other_local_wireless_networks", [])
    for n in others:
        rssi, noise = parse_signal_noise(n.get("spairport_signal_noise", ""))
        nets.append({
            "ssid": n.get("_name"),
            "channel": n.get("spairport_network_channel"),
            "phymode": n.get("spairport_network_phymode"),
            "security": n.get("spairport_security_mode"),
            "rssi_dbm": rssi,
            "noise_dbm": noise
        })
    return nets

def scan_linux():
    out = run_cmd("nmcli -f SSID,BSSID,SIGNAL,CHAN dev wifi list")
    nets = []
    for line in out.splitlines()[1:]:
        parts = [p for p in line.strip().split() if p]
        if len(parts) < 3: 
            continue
        ssid = parts[0]
        signal = parts[-2]
        chan = parts[-1]
        nets.append({
            "ssid": ssid,
            "signal_pct": int(signal) if signal.isdigit() else None,
            "channel": chan
        })
    return nets

def run_speedtest():
    if speedtest is None:
        return {"method": "none", "error": "speedtest module not installed"}
    try:
        st = speedtest.Speedtest()
        st.get_best_server()
        down = st.download() / 1e6
        up = st.upload() / 1e6
        ping = st.results.ping
        return {
            "download_mbps": round(down, 2),
            "upload_mbps": round(up, 2),
            "ping_ms": round(ping, 2),
            "method": "python-speedtest"
        }
    except Exception as e:
        return {"method": "python-speedtest", "error": str(e)}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--speedtest", action="store_true", help="Force run speedtest")
    parser.add_argument("--no-speedtest", action="store_true", help="Skip speedtest")
    args = parser.parse_args()

    system = platform.system().lower()
    if "darwin" in system:
        nets = scan_macos()
    else:
        nets = scan_linux()

    payload = {
        "ts": time.time(),
        "platform": system,
        "networks": nets,
    }

    do_speedtest = False
    if args.speedtest:
        do_speedtest = True
    elif args.no_speedtest:
        do_speedtest = False
    else:
        do_speedtest = True  # default when you run manually

    if do_speedtest:
        print("Running speedtest...")
        payload["speedtest"] = run_speedtest()

    Path(OUTFILE).write_text(json.dumps(payload, indent=2))
    print(f"Saved {OUTFILE} with {len(nets)} networks.")

    if do_speedtest and "speedtest" in payload:
        print("Speedtest results:", payload["speedtest"])

if __name__ == "__main__":
    print("scanner.py starting...")
    main()
