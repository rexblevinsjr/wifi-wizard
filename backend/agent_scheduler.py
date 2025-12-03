"""
agent_scheduler.py
- Runs passive background scans ONLY for Monitor page charts
- NEVER copies anything into wifi-dashboard/
- Writes series JSON locally inside wifi-ai-mvp/
"""

from apscheduler.schedulers.background import BackgroundScheduler
import sys, subprocess
from pathlib import Path
from threading import Lock

BASE_DIR = Path(__file__).resolve().parent
PY = sys.executable

# shared no-overlap lock used by server + scheduler
RUN_LOCK = Lock()

scheduler = BackgroundScheduler()

def run(cmd_list):
    subprocess.run(cmd_list, check=True)

def copy_to_history(tag="passive"):
    # lazy import to avoid circular imports
    from agent_history import append_history
    append_history(tag=tag)

def update_series_files():
    # rebuild series INSIDE wifi-ai-mvp only
    from history_to_series import main as series_main
    series_main()

def passive_tick():
    """
    Passive tick:
    - fast scan only (no speedtest, no optimizer)
    - appends to history
    - rebuilds series for Monitor charts
    """
    if RUN_LOCK.locked():
        return

    with RUN_LOCK:
        run([PY, "scanner.py", "--no-speedtest"])
        copy_to_history(tag="passive")
        update_series_files()

# ✅ passive tick every 60 seconds
scheduler.add_job(
    passive_tick,
    "interval",
    seconds=60,
    id="passive_tick",
    max_instances=1,
)

# export these so agent_server.py can import safely
__all__ = ["scheduler", "RUN_LOCK", "update_series_files", "copy_to_history"]
