# scheduler_core/scenario_config.py
import json
from pathlib import Path
import pandas as pd

DEFAULT_CFG = {
    "mode": "real_time",
    "now": None,
    "freeze_horizon_hours": 0,
    "freeze_horizon_by_workplace": {},
    "freeze_pg2": False,
    "policy_version": "v1",
    "notes": ""
}

def load_scenario_config(scenario_name: str) -> dict:
    cfg_path = Path("scenarios") / scenario_name / "config.json"
    if not cfg_path.exists():
        return DEFAULT_CFG.copy()
    return json.loads(cfg_path.read_text(encoding="utf-8"))

def scenario_now(cfg: dict) -> pd.Timestamp:
    mode = (cfg.get("mode") or "real_time").strip().lower()
    if mode == "what_if":
        now_raw = cfg.get("now")
        if not now_raw:
            raise ValueError("config.json: mode=what_if requires a non-null 'now'")
        return pd.Timestamp(now_raw).floor("min")
    # real time
    return pd.Timestamp.now().floor("min")
