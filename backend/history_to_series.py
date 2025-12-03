import json, glob, os, sys
from pathlib import Path
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parent
HISTORY_DIR = BASE_DIR / "history"
OUT_SERIES = BASE_DIR / "history_series.json"
OUT_DAILY = BASE_DIR / "history_daily.json"

def parse_ts(obj):
    # accepts unix seconds, ms, or ISO string
    ts = obj.get("ts") or obj.get("timestamp") or obj.get("time")
    if ts is None:
        return None
    if isinstance(ts, (int, float)):
        # if seconds, convert to ms
        return int(ts * 1000) if ts < 1e12 else int(ts)
    if isinstance(ts, str):
        try:
            return int(datetime.fromisoformat(ts.replace("Z","")).timestamp() * 1000)
        except Exception:
            return None
    return None

def load_history():
    files = sorted(glob.glob(str(HISTORY_DIR / "*.json")))
    items = []
    for f in files:
        try:
            data = json.loads(Path(f).read_text())
            ts = parse_ts(data) or int(Path(f).stat().st_mtime * 1000)
            items.append((ts, data))
        except Exception:
            continue
    items.sort(key=lambda x: x[0])
    return items

def build_series(items):
    score_series = []
    perf_series = []
    outage_events = []

    for ts, data in items:
        report = data.get("latest_report") or data

        score = (
            report.get("score", {}).get("wifi_health_score")
            or report.get("wifi_health_score")
        )
        perf = report.get("performance", {})

        if score is not None:
            score_series.append({
                "ts": ts,
                "score": score
            })

        if perf:
            perf_series.append({
                "ts": ts,
                "download_mbps": perf.get("download_mbps"),
                "upload_mbps": perf.get("upload_mbps"),
                "ping_ms": perf.get("ping_ms")
            })

        # outage detection if saved that way later
        if report.get("outage_detected"):
            outage_events.append({"ts": ts, "reason": report.get("outage_reason","unknown")})

    return score_series, perf_series, outage_events

def build_daily(items):
    daily = {}
    for ts, data in items:
        day = datetime.fromtimestamp(ts/1000).strftime("%Y-%m-%d")
        report = data.get("latest_report") or data
        daily.setdefault(day, {"count":0, "avg_score":0})

        score = (
            report.get("score", {}).get("wifi_health_score")
            or report.get("wifi_health_score")
        )

        if score is not None:
            daily[day]["count"] += 1
            daily[day]["avg_score"] += score

    for day, v in daily.items():
        if v["count"]:
            v["avg_score"] = round(v["avg_score"] / v["count"], 2)

    return daily

def main():
    items = load_history()
    score_series, perf_series, outage_events = build_series(items)
    daily = build_daily(items)

    OUT_SERIES.write_text(json.dumps({
        "score_series": score_series,
        "perf_series": perf_series,
        "outage_events": outage_events
    }, indent=2))

    OUT_DAILY.write_text(json.dumps(daily, indent=2))

    print("Saved history_series.json with:")
    print("  score_series points:", len(score_series))
    print("  perf_series points: ", len(perf_series))
    print("  outage_events:      ", len(outage_events))
    print("Saved history_daily.json (daily aggregates).")

if __name__ == "__main__":
    main()
