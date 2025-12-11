from flask import Blueprint, jsonify
from pathlib import Path
from cleaning.clean_jobs import clean_jobs
from cleaning.clean_shifts import clean_shifts

clean_bp = Blueprint("clean", __name__, url_prefix="/api/clean")


@clean_bp.post("/<scenario_name>")
def clean_scenario(scenario_name):

    scenario_dir = Path("scenarios") / scenario_name
    input_dir = scenario_dir / "input"
    cleaned_dir = scenario_dir / "cleaned"

    if not input_dir.exists():
        return jsonify({"ok": False, "error": "Scenario does not exist"}), 404

    jobs_path = input_dir / "jobs.xlsx"
    shifts_path = input_dir / "shifts.xlsx"

    if not jobs_path.exists() or not shifts_path.exists():
        return jsonify({
            "ok": False,
            "error": "jobs.xlsx or shifts.xlsx not found in scenario input/"
        }), 400

    try:
        # Run cleaners
        jobs_result = clean_jobs(str(jobs_path), str(cleaned_dir))
        shifts_result = clean_shifts(str(shifts_path), str(cleaned_dir))

        return jsonify({
            "ok": True,
            "message": "Cleaning completed",
            "jobs_clean": jobs_result,
            "shifts_clean": shifts_result
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500
