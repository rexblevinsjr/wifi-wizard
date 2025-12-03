from flask import Flask, jsonify, request
from flask_cors import CORS
import sys, subprocess, json
from pathlib import Path
from agent_scheduler import scheduler, RUN_LOCK, update_series_files, copy_to_history

BASE_DIR = Path(__file__).resolve().parent
PY = sys.executable

WIFI_SCAN = BASE_DIR / "wifi_scan.json"
LATEST_REPORT = BASE_DIR / "latest_report.json"
HISTORY_SERIES = BASE_DIR / "history_series.json"
HISTORY_DAILY = BASE_DIR / "history_daily.json"

app = Flask(__name__)
CORS(app)

def run(cmd_list):
    subprocess.run(cmd_list, check=True)

def safe_read_json(path: Path, fallback):
    try:
        if path.exists():
            return json.loads(path.read_text())
    except Exception:
        pass
    return fallback

@app.route("/health")
def health():
    return jsonify({"ok": True})

# ---- JSON FEEDS FOR REACT ----
@app.route("/latest-report")
def latest_report():
    data = safe_read_json(LATEST_REPORT, {})
    return jsonify(data)

@app.route("/history-series")
def history_series():
    data = safe_read_json(HISTORY_SERIES, {
        "score_series": [],
        "perf_series": [],
        "outage_events": []
    })
    return jsonify(data)

@app.route("/history-daily")
def history_daily():
    data = safe_read_json(HISTORY_DAILY, {})
    return jsonify(data)

# ---- ACTION ENDPOINTS ----
@app.route("/monitor-tick")
def monitor_tick():
    # light passive scan for live charts
    if RUN_LOCK.locked():
        return jsonify({"ok": False, "skipped": True})

    with RUN_LOCK:
        run([PY, "scanner.py", "--no-speedtest"])
        copy_to_history(tag="passive")
        update_series_files()
    return jsonify({"ok": True})

@app.route("/refresh-now")
def refresh_now():
    # full refresh: speedtest + AI report
    if RUN_LOCK.locked():
        return jsonify({"ok": False, "skipped": True})

    with RUN_LOCK:
        run([PY, "scanner.py", "--speedtest"])
        copy_to_history(tag="speedtest")
        run([PY, "optimizer.py"])   # writes latest_report.json
        update_series_files()
    return jsonify({"ok": True})

@app.route("/troubleshoot-now")
def troubleshoot_now():
    # deep dive uses same full refresh for now
    if RUN_LOCK.locked():
        return jsonify({"ok": False, "skipped": True})

    with RUN_LOCK:
        run([PY, "scanner.py", "--speedtest"])
        copy_to_history(tag="speedtest")
        run([PY, "optimizer.py"])
        update_series_files()
    return jsonify({"ok": True})
import os

def basic_fallback_chat(message, profile=None, latest_report=None):
    m = (message or "").lower()
    profile = profile or {}
    latest_report = latest_report or {}

    if "slow" in m:
        return ("For slow speeds:\n"
                "1) Check you're on 5GHz/6GHz if close to router.\n"
                "2) Reboot modem + router.\n"
                "3) Re-run deep diagnostic and compare to plan.\n"
                "What download/upload do you see?")

    fixes = latest_report.get("fixes") or []
    if fixes:
        top = fixes[:3]
        top_txt = "\n• ".join([
            f if isinstance(f, str) else f.get("recommendation") or f.get("action","")
            for f in top
        ])
        return "Based on your scan, start here:\n• " + top_txt

    return ("Tell me more about the issue:\n"
            "• all devices or one?\n"
            "• how far from router?\n"
            "• what speeds you pay for?")

@app.route("/chat", methods=["POST"])
def chat():
    data = request.get_json(force=True, silent=True) or {}
    message = data.get("message", "")
    profile = data.get("profile", {})
    latest_report = data.get("latestReport", {})
    history = data.get("history", [])

    # If no API key, use fallback
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return jsonify({"reply": basic_fallback_chat(message, profile, latest_report)})

    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)

        system = (
            "You are a Wi-Fi troubleshooting assistant. "
            "Use the user's ISP/router info and latest diagnostics. "
            "Be concise, step-by-step, and ask 1 clarifying question at a time. "
            "Never invent metrics; if missing, ask for them."
        )

        # Build input for Responses API
        convo = [{"role": "system", "content": system}]

        # Add profile/report context
        convo.append({
            "role": "user",
            "content": (
                f"User profile: {profile}\n"
                f"Latest report: {latest_report}\n"
                f"Recent chat: {history}\n"
                f"User message: {message}"
            )
        })

        resp = client.responses.create(
            model="gpt-4.1-mini",
            input=convo,
        )

        reply = resp.output_text or "Sorry — I couldn't generate a reply."
        return jsonify({"reply": reply})

    except Exception as e:
        print("Chat error:", e)
        return jsonify({"reply": basic_fallback_chat(message, profile, latest_report)})

if __name__ == "__main__":
    print("Starting Wi-Fi Agent Server on port 8787...")
    scheduler.start()
    app.run(host="0.0.0.0", port=8787, debug=True)
