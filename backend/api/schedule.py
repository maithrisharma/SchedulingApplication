from flask import Blueprint, jsonify
from pathlib import Path

from scheduler_core.run import run_scheduler_with_paths
from scheduler_state import (
    active_jobs,
    progress,
    cancel_flag,
    get_lock,
)

schedule_bp = Blueprint("schedule", __name__, url_prefix="/api/schedule")



# RUN SCHEDULER
@schedule_bp.post("/<scenario_name>")
def schedule_scenario(scenario_name):

    scenario = scenario_name
    print(f"[API] /schedule/{scenario} called")

    base = Path("scenarios") / scenario
    if not base.exists():
        print(f"[API] Scenario '{scenario}' does not exist")
        return jsonify({"ok": False, "error": "Scenario does not exist"}), 404

    cleaned_dir = base / "cleaned"
    output_dir = base / "output"

    #FILE CHECK
    required_files = {
        "jobs_clean.csv": cleaned_dir / "jobs_clean.csv",
        "shifts_clean.csv": cleaned_dir / "shifts_clean.csv",
        "unlimited_machines.csv": cleaned_dir / "unlimited_machines.csv",
        "outsourcing_machines.csv": cleaned_dir / "outsourcing_machines.csv",
    }

    missing = [n for n, p in required_files.items() if not p.exists()]
    if missing:
        print(f"[API] Missing cleaned files: {missing}")
        return jsonify({"ok": False, "error": "Missing cleaned files.", "missing": missing}), 400


    # Acquire lock
    lock = get_lock(scenario)

    with lock:
        print(f"[LOCK] Active jobs before check: {active_jobs}")

        if active_jobs.get(scenario, False):
            print(f"[LOCK] Scheduler already running for {scenario}")
            return jsonify({
                "ok": False,
                "error": f"Scheduler already running for '{scenario}'"
            }), 409

        # OK mark running
        print(f"[LOCK] Marking scenario '{scenario}' as running")
        active_jobs[scenario] = True
        cancel_flag[scenario] = False
        progress[scenario] = 0


    # Run scheduler
    try:

        def update_progress(p: int):
            progress[scenario] = int(p)
            print(f"[PROGRESS] {scenario} → {progress[scenario]}%")

        print(f"[ENGINE] Starting scheduler for {scenario}")

        results = run_scheduler_with_paths(
            required_files["jobs_clean.csv"],
            required_files["shifts_clean.csv"],
            required_files["unlimited_machines.csv"],
            required_files["outsourcing_machines.csv"],
            output_dir,
            scenario_name=scenario,
            progress_callback=update_progress,
        )

        # CANCELLED?
        if isinstance(results, dict) and results.get("cancelled"):
            print(f"[ENGINE] Scheduler CANCELLED for {scenario}")
            progress[scenario] = 0

            return jsonify({
                "ok": False,
                "cancelled": True,
                "message": "Scheduler cancelled"
            })

        print(f"[ENGINE] Scheduler completed for {scenario}")

        progress[scenario] = 100

        return jsonify({
            "ok": True,
            "message": "Scheduling completed",
            "outputs": results,
        })

    except Exception as e:
        print(f"[ERROR] Scheduler crashed: {e}")
        return jsonify({"ok": False, "error": str(e)}), 500

    finally:
        with lock:
            print(f"[LOCK] Releasing scenario '{scenario}'")
            active_jobs[scenario] = False
            cancel_flag[scenario] = False
            progress[scenario] = 0  # ADD THIS
            print(f"[STATE] active_jobs after release: {active_jobs}")
            print(f"[STATE] cancel_flag after release: {cancel_flag}")


# PROGRESS ENDPOINT
@schedule_bp.get("/progress/<scenario_name>")
def get_progress_route(scenario_name):
  return jsonify({
      "running": active_jobs.get(scenario_name, False),
      "progress": progress.get(scenario_name, 0),
  })



# CANCEL ENDPOINT
@schedule_bp.post("/cancel/<scenario_name>")
def cancel_schedule(scenario_name):
    print(f"[API] CANCEL request received for {scenario_name}")
    if not active_jobs.get(scenario_name, False):
        print(f"[API] CANCEL ignored — no active job for {scenario_name}")
        return jsonify({"ok": False, "message": "No active scheduler to cancel"}), 400
    cancel_flag[scenario_name] = True
    return jsonify({"ok": True, "message": "Cancel signal sent"})

