import uuid
import shutil
from flask import Blueprint, jsonify, request
from pathlib import Path
from datetime import datetime


scenarios_bp = Blueprint("scenarios", __name__, url_prefix="/api/scenarios")


def create_scenario_folder(base_path: Path, scenario_name: str = None):
    """
    Creates a scenario folder with subfolders:
        /input
        /cleaned
        /output
        config.json (empty for now)
    """

    # If no name given -> auto-generate
    if scenario_name is None or scenario_name.strip() == "":
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        scenario_name = f"scenario_{timestamp}_{uuid.uuid4().hex[:4]}"

    scenario_dir = base_path / scenario_name

    # subfolders
    input_dir = scenario_dir / "input"
    cleaned_dir = scenario_dir / "cleaned"
    output_dir = scenario_dir / "output"

    input_dir.mkdir(parents=True, exist_ok=False)
    cleaned_dir.mkdir(parents=True, exist_ok=False)
    output_dir.mkdir(parents=True, exist_ok=False)

    # empty config
    (scenario_dir / "config.json").write_text("{}", encoding="utf-8")

    return scenario_name, scenario_dir


@scenarios_bp.post("/create")
def create_scenario():
    """
    POST /api/scenarios/create
    body: { "name": "optional name" }
    """
    data = request.get_json(silent=True) or {}
    name = data.get("name")

    base_path = Path("scenarios")   # relative to backend directory
    base_path.mkdir(exist_ok=True)

    try:
        scenario_name, scenario_dir = create_scenario_folder(base_path, name)

        return jsonify({
            "ok": True,
            "scenario": scenario_name,
            "path": str(scenario_dir)
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@scenarios_bp.get("/list")
def list_scenarios():
    """
    GET /api/scenarios/list
    returns all scenario folder names
    """
    base_path = Path("scenarios")
    base_path.mkdir(exist_ok=True)

    scenarios = [
        f.name for f in base_path.iterdir()
        if f.is_dir()
    ]

    return jsonify({"ok": True, "scenarios": scenarios})

@scenarios_bp.post("/delete")
def delete_scenario():
    """
    POST /api/scenarios/delete
    body: { "name": "scenario_name" }

    Deletes the entire scenario folder safely.
    """

    data = request.get_json(silent=True) or {}
    name = data.get("name")

    if not name:
        return jsonify({"ok": False, "error": "No scenario name provided"}), 400

    base_path = Path("scenarios")
    base_path.mkdir(exist_ok=True)

    target_dir = base_path / name

    # Check existence
    if not target_dir.exists() or not target_dir.is_dir():
        return jsonify({"ok": False, "error": "Scenario does not exist"}), 404

    try:
        # Recursively delete entire directory
        shutil.rmtree(target_dir)

        return jsonify({"ok": True, "deleted": name})

    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500