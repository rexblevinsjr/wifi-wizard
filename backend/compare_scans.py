import json
from pathlib import Path


def load_latest_two(history_dir="history"):
    """
    Load the two most recent wifi_scan_*.json files from the given history_dir.

    Returns:
        (prev_scan_dict, curr_scan_dict) or (None, None) if not enough history.
    """
    files = sorted(Path(history_dir).glob("wifi_scan_*.json"))
    if len(files) < 2:
        return None, None
    with open(files[-2], "r") as f_prev, open(files[-1], "r") as f_curr:
        return json.load(f_prev), json.load(f_curr)


def _get_speedtest_fields(scan):
    """
    Extracts download_mbps, upload_mbps, ping_ms from a scan object,
    falling back to 0 if missing.
    """
    if not isinstance(scan, dict):
        return 0.0, 0.0, 0.0
    sp = scan.get("speedtest") or {}
    try:
        down = float(sp.get("download_mbps") or 0.0)
    except (TypeError, ValueError):
        down = 0.0
    try:
        up = float(sp.get("upload_mbps") or 0.0)
    except (TypeError, ValueError):
        up = 0.0
    try:
        ping = float(sp.get("ping_ms") or 0.0)
    except (TypeError, ValueError):
        ping = 0.0
    return down, up, ping


def compare(prev, curr):
    """
    Compare two scan dicts and return numeric deltas.

    All deltas are CURRENT minus PREVIOUS so a positive download/upload delta
    means the new scan is faster, while a positive ping delta means latency
    is higher (worse) than before.
    """
    if not prev or not curr:
        return {"note": "No previous scan to compare"}

    # Extract speedtest metrics from each scan
    prev_down, prev_up, prev_ping = _get_speedtest_fields(prev)
    curr_down, curr_up, curr_ping = _get_speedtest_fields(curr)

    # Count visible Wi-Fi networks, if present
    prev_nets = prev.get("networks") or []
    curr_nets = curr.get("networks") or []

    return {
        "download_delta_mbps": round(curr_down - prev_down, 2),
        "upload_delta_mbps": round(curr_up - prev_up, 2),
        "ping_delta_ms": round(curr_ping - prev_ping, 2),
        "networks_delta": len(curr_nets) - len(prev_nets),
        "prev_speedtest": prev.get("speedtest") or {},
        "curr_speedtest": curr.get("speedtest") or {},
    }
