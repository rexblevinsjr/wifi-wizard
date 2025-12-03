from pathlib import Path
from datetime import datetime
import json
import time

BASE_DIR = Path(__file__).resolve().parent

HISTORY_FILE = BASE_DIR / "agent_history.jsonl"
HISTORY_DIR = BASE_DIR / "history"

SCAN_FILE = BASE_DIR / "wifi_scan.json"
REPORT_FILE = BASE_DIR / "latest_report.json"

def append_history(scan_path=None, report_path=None, tag="manual"):
    """
    Compatible with:
        append_history(tag="speedtest")
    and
        append_history(scan_path, report_path, tag)

    Fixes:
    1) Writes per-record JSON containing "latest_report" so Monitor graphs populate.
    2) Also writes wifi_scan_*.json snapshots so compare_scans -> trend_summary stays accurate.
    """
    if scan_path is None:
        scan_path = SCAN_FILE
    if report_path is None:
        report_path = REPORT_FILE

    try:
        scan_data = json.loads(scan_path.read_text()) if scan_path.exists() else {}
    except Exception:
        scan_data = {}

    try:
        report_data = json.loads(report_path.read_text()) if report_path.exists() else {}
    except Exception:
        report_data = {}

    ts_iso = datetime.utcnow().isoformat() + "Z"
    ts_ms = int(time.time() * 1000)

    # -------- record for series builder --------
    # history_to_series.py expects latest_report at top-level or in "latest_report"
    record = {
        "ts": ts_iso,
        "ts_ms": ts_ms,
        "tag": tag,
        "latest_report": report_data,   # ✅ makes charts work
        "wifi_scan": scan_data          # keeps scan attached for debugging
    }

    # 1) Append jsonl (legacy)
    HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    with HISTORY_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record) + "\n")

    # 2) Write per-record JSON for charts
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    out_path = HISTORY_DIR / f"{ts_ms}_{tag}.json"
    out_path.write_text(json.dumps(record, indent=2))

    # 3) ALSO write wifi_scan_*.json snapshots for compare_scans / trend_summary
    if scan_data:
        safe_ts = datetime.utcnow().strftime("%Y-%m-%d_%H-%M-%S")
        scan_snap = HISTORY_DIR / f"wifi_scan_{safe_ts}.json"
        scan_snap.write_text(json.dumps(scan_data, indent=2))
