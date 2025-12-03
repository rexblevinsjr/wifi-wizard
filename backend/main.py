from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pathlib import Path
from datetime import datetime
import sys, subprocess, json, time

from typing import Optional, Dict, Any
from pydantic import BaseModel

from agent_scheduler import scheduler, RUN_LOCK, update_series_files, copy_to_history

BASE_DIR = Path(__file__).resolve().parent
PY = sys.executable

WIFI_SCAN = BASE_DIR / "wifi_scan.json"
LATEST_REPORT = BASE_DIR / "latest_report.json"
HISTORY_SERIES = BASE_DIR / "history_series.json"
HISTORY_DAILY = BASE_DIR / "history_daily.json"

AGENT_HISTORY_FILE = BASE_DIR / "agent_history.jsonl"
EARLY_ACCESS_FILE = BASE_DIR / "early_access_signups.jsonl"


def run(cmd_list):
  subprocess.run(cmd_list, check=True)


def safe_read_json(path: Path, fallback):
  try:
    if path.exists():
      return json.loads(path.read_text())
  except Exception:
    pass
  return fallback


# ============================================================
# Data Models
# ============================================================

class AgentSample(BaseModel):
  agent_id: str
  timestamp: Optional[float] = None
  metrics: Dict[str, Any]


class EarlyAccessSignup(BaseModel):
  email: str
  source: Optional[str] = None
  created_at: Optional[float] = None


# ============================================================
# FastAPI App
# ============================================================

app = FastAPI(title="Wi-Fi AI MVP Backend (FastAPI)")

app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)


@app.on_event("startup")
def start_scheduler():
  if not scheduler.running:
    scheduler.start()


@app.get("/health")
def health():
  return {"ok": True, "ts": datetime.utcnow().isoformat() + "Z"}


# ============================================================
# Existing Endpoints
# ============================================================

@app.get("/latest-report")
def latest_report():
  data = safe_read_json(LATEST_REPORT, {})
  return JSONResponse(data)


@app.get("/history-series")
def history_series():
  data = safe_read_json(HISTORY_SERIES, {
    "score_series": [],
    "perf_series": [],
    "outage_events": []
  })
  return JSONResponse(data)


@app.get("/history-daily")
def history_daily():
  data = safe_read_json(HISTORY_DAILY, {})
  return JSONResponse(data)


@app.get("/monitor-tick")
@app.post("/monitor-tick")
def monitor_tick():
  if RUN_LOCK.locked():
    return {"ok": False, "skipped": True}

  with RUN_LOCK:
    run([PY, "scanner.py", "--no-speedtest"])
    copy_to_history(tag="passive")
    update_series_files()

  return {"ok": True}


@app.get("/refresh-now")
@app.post("/refresh-now")
def refresh_now():
  if RUN_LOCK.locked():
    return {"ok": False, "skipped": True}

  with RUN_LOCK:
    run([PY, "scanner.py", "--speedtest"])
    copy_to_history(tag="speedtest")
    run([PY, "optimizer.py"])
    update_series_files()

  return {"ok": True}


@app.get("/troubleshoot-now")
@app.post("/troubleshoot-now")
def troubleshoot_now():
  if RUN_LOCK.locked():
    return {"ok": False, "skipped": True}

  with RUN_LOCK:
    run([PY, "scanner.py", "--speedtest"])
    copy_to_history(tag="speedtest")
    run([PY, "optimizer.py"])
    update_series_files()

  return {"ok": True}


@app.get("/speedtest/download")
def speedtest_download(size_mb: float = 5.0):
  """
  Stream 'size_mb' megabytes of data for the browser to download.
  Used only to measure download speed from the user's browser.
  """
  size_bytes = int(size_mb * 1024 * 1024)
  chunk = b"0" * 65536

  def iter_content():
    remaining = size_bytes
    while remaining > 0:
      n = min(len(chunk), remaining)
      yield chunk[:n]
      remaining -= n

  return StreamingResponse(
    iter_content(),
    media_type="application/octet-stream",
  )


@app.post("/speedtest/upload")
async def speedtest_upload(request: Request):
  """
  Accept an uploaded blob from the browser to measure upload speed.
  We don't need the content; just reading it is enough to time the upload.
  """
  await request.body()
  return {"ok": True}


# ============================================================
# Probe / Agent Endpoint
# ============================================================

@app.post("/agent/submit")
async def agent_submit(sample: AgentSample):
  """
  Endpoint for lightweight probes/agents to send metrics.
  """
  data = sample.dict()

  if not data.get("timestamp"):
    data["timestamp"] = time.time()

  data["received_at"] = time.time()

  try:
    with open(AGENT_HISTORY_FILE, "a", encoding="utf-8") as f:
      f.write(json.dumps(data) + "\n")
  except Exception as e:
    print("Failed to write agent sample:", e)

  return {"ok": True}


# ============================================================
# Early Access Signup Endpoint
# ============================================================

@app.post("/early-access/join")
async def early_access_join(payload: EarlyAccessSignup):
  """
  Collect Early Access emails.

  Body:
    {
      "email": "user@example.com",
      "source": "upgrade_page"  # optional
    }

  We append each signup as JSONL to EARLY_ACCESS_FILE for later use.
  """
  data = payload.dict()
  if not data.get("created_at"):
    data["created_at"] = time.time()

  try:
    with open(EARLY_ACCESS_FILE, "a", encoding="utf-8") as f:
      f.write(json.dumps(data) + "\n")
  except Exception as e:
    print("Failed to append early access signup:", e)

  return {"ok": True}
