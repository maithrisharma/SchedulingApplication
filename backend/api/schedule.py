from flask import Blueprint, jsonify
from pathlib import Path
from threading import Thread

from scheduler_core.run import run_scheduler_with_paths
from scheduler_state import (
    active_jobs,
    progress,
    cancel_flag,
    get_lock,
)

schedule_bp = Blueprint("schedule", __name__, url_prefix="/api/schedule")


# ----------------------------------------
# INTERNAL WORKER FUNCTION (runs in thread)
# ----------------------------------------
def run_scheduler_background(scenario, required_files, output_dir):

    def update_progress(p: int):
        progress[scenario] = int(p)
        print(f"[PROGRESS] {scenario} → {progress[scenario]}%")

    try:
        print(f"[ENGINE] Background scheduler START for {scenario}")

        results = run_scheduler_with_paths(
            required_files["jobs_clean.csv"],
            required_files["shifts_clean.csv"],
            required_files["unlimited_machines.csv"],
            required_files["outsourcing_machines.csv"],
            output_dir,
            scenario_name=scenario,
            progress_callback=update_progress,
        )

        if isinstance(results, dict) and results.get("cancelled"):
            print(f"[ENGINE] Scheduler CANCELLED for {scenario}")
            progress[scenario] = 0

        else:
            print(f"[ENGINE] Scheduler COMPLETED for {scenario}")
            progress[scenario] = 100

    except Exception as e:
        print(f"[ERROR] Scheduler crashed for {scenario}: {e}")
        progress[scenario] = -1  # mark as crashed

    finally:
        # Release lock & flags
        lock = get_lock(scenario)
        with lock:
            active_jobs[scenario] = False
            cancel_flag[scenario] = False
        print(f"[STATE] Scheduler finished for {scenario}")


# ----------------------------------------
# START SCHEDULER (returns immediately)
# ----------------------------------------
@schedule_bp.post("/start/<scenario_name>")
def start_scheduler(scenario_name):
    scenario = scenario_name
    print(f"[API] /schedule/start/{scenario} called")

    base = Path("scenarios") / scenario
    if not base.exists():
        return jsonify({"ok": False, "error": "Scenario does not exist"}), 404

    cleaned = base / "cleaned"
    output_dir = base / "output"

    required_files = {
        "jobs_clean.csv": cleaned / "jobs_clean.csv",
        "shifts_clean.csv": cleaned / "shifts_clean.csv",
        "unlimited_machines.csv": cleaned / "unlimited_machines.csv",
        "outsourcing_machines.csv": cleaned / "outsourcing_machines.csv",
    }

    missing = [n for n, p in required_files.items() if not p.exists()]
    if missing:
        return jsonify({"ok": False, "error": "Missing cleaned files", "missing": missing}), 400

    lock = get_lock(scenario)
    with lock:
        if active_jobs.get(scenario, False):
            return jsonify({"ok": False, "error": "Scheduler already running"}), 409

        # Mark running
        active_jobs[scenario] = True
        cancel_flag[scenario] = False
        progress[scenario] = 0

    # LAUNCH BACKGROUND THREAD
    t = Thread(
        target=run_scheduler_background,
        args=(scenario, required_files, output_dir),
        daemon=True
    )
    t.start()

    return jsonify({"ok": True, "message": "Scheduler started"})


# ----------------------------------------
# STATUS ENDPOINT (frontend polls here)
# ----------------------------------------
@schedule_bp.get("/status/<scenario_name>")
def get_status(scenario_name):
    return jsonify({
        "running": active_jobs.get(scenario_name, False),
        "progress": progress.get(scenario_name, 0),
        "cancelled": cancel_flag.get(scenario_name, False)
    })


# ----------------------------------------
# CANCEL ENDPOINT
# ----------------------------------------
@schedule_bp.post("/cancel/<scenario_name>")
def cancel_schedule(scenario_name):
    if not active_jobs.get(scenario_name, False):
        return jsonify({"ok": False, "message": "No active scheduler"}), 400

    cancel_flag[scenario_name] = True
    return jsonify({"ok": True, "message": "Cancel signal sent"})
