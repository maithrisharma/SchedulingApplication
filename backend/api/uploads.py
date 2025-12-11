from flask import Blueprint, request, jsonify
from pathlib import Path

uploads_bp = Blueprint("uploads", __name__, url_prefix="/api/uploads")


@uploads_bp.post("/<scenario_name>")
def upload_files(scenario_name):
    """
    Upload jobs.xlsx and shifts.xlsx into:
        scenarios/<scenario_name>/input/
    """

    base_path = Path("scenarios") / scenario_name
    input_dir = base_path / "input"

    if not input_dir.exists():
        return jsonify({"ok": False, "error": "Scenario does not exist"}), 404

    # Check file presence
    if "jobs" not in request.files or "shifts" not in request.files:
        return jsonify({
            "ok": False,
            "error": "Both 'jobs' and 'shifts' files must be uploaded"
        }), 400

    jobs_file = request.files["jobs"]
    shifts_file = request.files["shifts"]

    # Validate extension
    def allowed(filename):
        return filename.lower().endswith(".xlsx")

    if not allowed(jobs_file.filename):
        return jsonify({"ok": False, "error": "jobs file must be .xlsx"}), 400

    if not allowed(shifts_file.filename):
        return jsonify({"ok": False, "error": "shifts file must be .xlsx"}), 400

    # Target paths
    jobs_path = input_dir / "jobs.xlsx"
    shifts_path = input_dir / "shifts.xlsx"

    # DELETE old files before saving
    try:
        if jobs_path.exists():
            jobs_path.unlink()   # delete old file
        if shifts_path.exists():
            shifts_path.unlink()  # delete old file
    except PermissionError:
        return jsonify({
            "ok": False,
            "error": "One of the existing files is open in Excel. Please close it and try again."
        }), 400

    # Save new uploaded files
    try:
        jobs_file.save(jobs_path)
        shifts_file.save(shifts_path)
    except PermissionError:
        return jsonify({
            "ok": False,
            "error": "Could not write files. Ensure Excel is closed and try again."
        }), 500

    return jsonify({
        "ok": True,
        "message": "Files uploaded successfully",
        "jobs_path": str(jobs_path),
        "shifts_path": str(shifts_path)
    })
