import json
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
    default_config = {
        "mode": "real_time",
        "now": None,
        "freeze_horizon_hours": 0,
        "freeze_pg2": False,
        "policy_version": "v1",
        "notes": ""
    }

    (scenario_dir / "config.json").write_text(
        json.dumps(default_config, indent=2),
        encoding="utf-8"
    )

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

    scenarios = [f.name for f in base_path.iterdir() if f.is_dir()]
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

    if not target_dir.exists() or not target_dir.is_dir():
        return jsonify({"ok": False, "error": "Scenario does not exist"}), 404

    try:
        shutil.rmtree(target_dir)
        return jsonify({"ok": True, "deleted": name})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@scenarios_bp.get("/<scenario>/config")
def get_scenario_config(scenario):
    cfg_path = Path("scenarios") / scenario / "config.json"

    if not cfg_path.exists():
        return jsonify({"ok": False, "error": "config.json not found"}), 404

    return jsonify({
        "ok": True,
        "scenario": scenario,
        "config": json.loads(cfg_path.read_text(encoding="utf-8"))
    })


@scenarios_bp.get("/<scenario>/run-meta")
def get_run_meta(scenario):
    """
    Returns normalized meta so frontend can always read meta.now
    regardless of whether the file stores now or now_used.
    """
    p = Path("scenarios") / scenario / "output" / "run_meta.json"
    if not p.exists():
        return jsonify({"ok": False, "error": "run_meta.json not found"}), 404

    meta = json.loads(p.read_text(encoding="utf-8"))

    # ✅ normalize NOW for frontend
    meta_norm = dict(meta)
    meta_norm["now"] = meta.get("now") or meta.get("now_used")

    return jsonify({"ok": True, "meta": meta_norm})


# ========================================
# NEW ENDPOINTS FOR SCENARIO CONFIGURATION
# ========================================

@scenarios_bp.put("/<scenario>/config")
@scenarios_bp.patch("/<scenario>/config")
def update_scenario_config(scenario):
    """
    PUT/PATCH /api/scenarios/<scenario>/config
    Update scenario configuration
    """
    data = request.get_json(silent=True) or {}
    cfg_path = Path("scenarios") / scenario / "config.json"

    if not cfg_path.exists():
        return jsonify({"ok": False, "error": "Config file not found"}), 404

    try:
        current_config = json.loads(cfg_path.read_text(encoding="utf-8"))
    except Exception as e:
        return jsonify({"ok": False, "error": f"Failed to read config: {str(e)}"}), 500

    current_config.update(data)

    mode = current_config.get("mode", "real_time")
    now = current_config.get("now")

    if mode == "what_if" and not now:
        return jsonify({
            "ok": False,
            "error": "mode='what_if' requires 'now' timestamp to be set"
        }), 400

    freeze_hours = current_config.get("freeze_horizon_hours", 0)
    if freeze_hours < 0:
        return jsonify({"ok": False, "error": "freeze_horizon_hours must be >= 0"}), 400

    try:
        cfg_path.write_text(json.dumps(current_config, indent=2), encoding="utf-8")
    except Exception as e:
        return jsonify({"ok": False, "error": f"Failed to save config: {str(e)}"}), 500

    return jsonify({"ok": True, "scenario": scenario, "config": current_config})


@scenarios_bp.post("/create-what-if")
def create_what_if_scenario():
    """
    POST /api/scenarios/create-what-if
    Creates what-if scenario from existing scenario.
    Copies NOW from output/run_meta.json (supports now_used / now)
    """
    data = request.get_json(silent=True) or {}

    source_scenario = data.get("source_scenario")
    if not source_scenario:
        return jsonify({"ok": False, "error": "source_scenario is required"}), 400

    source_dir = Path("scenarios") / source_scenario
    if not source_dir.exists():
        return jsonify({"ok": False, "error": f"Source scenario '{source_scenario}' not found"}), 404

    meta_path = source_dir / "output" / "run_meta.json"
    if not meta_path.exists():
        return jsonify({
            "ok": False,
            "error": f"Source scenario '{source_scenario}' has no run_meta.json. Run the scenario first."
        }), 400

    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    except Exception as e:
        return jsonify({"ok": False, "error": f"Failed to read run_meta.json: {str(e)}"}), 500

    # ✅ support both schemas
    source_now = meta.get("now") or meta.get("now_used")

    if not source_now:
        return jsonify({
            "ok": False,
            "error": (
                f"Source scenario '{source_scenario}' has run_meta.json but no NOW field. "
                f"Expected 'now' or 'now_used'."
            )
        }), 400

    now = data.get("now") or source_now

    name = data.get("name")
    if not name or name.strip() == "":
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        name = f"{source_scenario}_whatif_{timestamp}"

    base_path = Path("scenarios")
    base_path.mkdir(exist_ok=True)

    try:
        new_scenario_name, new_scenario_dir = create_scenario_folder(base_path, name)
    except Exception as e:
        return jsonify({"ok": False, "error": f"Failed to create scenario: {str(e)}"}), 500

    # Copy input files from source
    files_copied = 0
    source_input_dir = source_dir / "input"
    new_input_dir = new_scenario_dir / "input"

    if source_input_dir.exists():
        for filename in ["jobs.xlsx", "shifts.xlsx"]:
            src = source_input_dir / filename
            if src.exists():
                try:
                    shutil.copy(src, new_input_dir / filename)
                    files_copied += 1
                except Exception as e:
                    print(f"Warning: Failed to copy {filename}: {e}")


    config = {
        "mode": "what_if",
        "now": now,
        "freeze_horizon_hours": data.get("freeze_horizon_hours", 0),
        "freeze_pg2": data.get("freeze_pg2", False),
        "policy_version": data.get("policy_version", "v1"),
        "notes": data.get("notes", f"What-if scenario created from {source_scenario}")
    }

    try:
        (new_scenario_dir / "config.json").write_text(
            json.dumps(config, indent=2),
            encoding="utf-8"
        )
    except Exception as e:
        shutil.rmtree(new_scenario_dir)
        return jsonify({"ok": False, "error": f"Failed to save config: {str(e)}"}), 500

    return jsonify({
        "ok": True,
        "scenario": new_scenario_name,
        "source": source_scenario,
        "now": now,
        "files_copied": files_copied,
        "config": config
    })


@scenarios_bp.get("/list-detailed")
def list_scenarios_detailed():
    """
    GET /api/scenarios/list-detailed
    Returns scenarios with metadata (mode, has_run, now)
    """
    base_path = Path("scenarios")
    base_path.mkdir(exist_ok=True)

    scenarios_list = []

    for folder in base_path.iterdir():
        if not folder.is_dir():
            continue

        scenario_info = {"name": folder.name}

        # config
        cfg_path = folder / "config.json"
        if cfg_path.exists():
            try:
                config = json.loads(cfg_path.read_text(encoding="utf-8"))
                scenario_info["mode"] = config.get("mode", "real_time")
                scenario_info["freeze_horizon_hours"] = config.get("freeze_horizon_hours", 0)
            except:
                scenario_info["mode"] = "unknown"

        # run_meta
        meta_path = folder / "output" / "run_meta.json"
        scenario_info["has_run"] = meta_path.exists()

        if meta_path.exists():
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                # ✅ expose a consistent "now" key to frontend
                scenario_info["now"] = meta.get("now") or meta.get("now_used")
            except:
                pass

        # input files
        input_dir = folder / "input"
        if input_dir.exists():
            scenario_info["input_files"] = len(list(input_dir.glob("*.csv")))

        scenarios_list.append(scenario_info)

    scenarios_list.sort(key=lambda x: x["name"])

    return jsonify({"ok": True, "scenarios": scenarios_list})
