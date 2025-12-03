import json
import time
import random
import urllib.request

API_BASE = "http://127.0.0.1:8787"
AGENT_ID = "demo-agent-1"  # later we'll generate per-device IDs


def send_sample():
    # For now we just simulate some metrics. Later we'll plug in real ping/jitter/RSSI.
    metrics = {
        "ping_ms": round(random.uniform(10, 40), 1),
        "jitter_ms": round(random.uniform(1, 8), 1),
        "packet_loss_pct": round(random.uniform(0, 2), 2),
        "download_mbps_est": round(random.uniform(50, 300), 1),
        "upload_mbps_est": round(random.uniform(10, 50), 1),
        "wifi_rssi_dbm": random.randint(-80, -50),
        "ssid": "demo-network",
        "notes": "synthetic demo sample",
    }

    payload = {
        "agent_id": AGENT_ID,
        "timestamp": time.time(),
        "metrics": metrics,
    }

    data = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(
        f"{API_BASE}/agent/submit",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=5) as resp:
        body = resp.read().decode("utf-8")
        print("Server response:", body)


if __name__ == "__main__":
    print("Sending one demo agent sample to backend...")
    send_sample()
    print("Done.")
