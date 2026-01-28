import traceback
import shutil
from flask import Blueprint, jsonify, request
from pathlib import Path
from threading import Thread
import pandas as pd
import json

from scheduler_core.run import run_scheduler_with_paths
from scheduler_core.io import load_cleaned_inputs
from scheduler_core.precedence import build_dependency_graph
from scheduler_core.scenario_config import load_scenario_config, scenario_now

from scheduler_state import (
    active_jobs,
    progress,
    cancel_flag,
    get_lock,
)

schedule_bp = Blueprint("schedule", __name__, url_prefix="/api/schedule")
CANDIDATE_SUFFIX = "_candidate"


# ---------------------------
# Helpers
# ---------------------------
def _parse_plan_times(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    if "job_id" in df.columns:
        df["job_id"] = df["job_id"].astype(str).str.strip()
    if "WorkPlaceNo" in df.columns:
        df["WorkPlaceNo"] = df["WorkPlaceNo"].astype(str).str.strip()

    # ✅ Parse as naive (no timezone)
    if "Start" in df.columns:
        df["Start"] = pd.to_datetime(df["Start"], errors="coerce")
        # Remove timezone if present
        if df["Start"].dt.tz is not None:
            df["Start"] = df["Start"].dt.tz_convert(None)

    if "End" in df.columns:
        df["End"] = pd.to_datetime(df["End"], errors="coerce")
        # Remove timezone if present
        if df["End"].dt.tz is not None:
            df["End"] = df["End"].dt.tz_convert(None)

    return df

def _successor_closure(seed_ids: set, succ_multi: dict) -> set:
    seen = set(seed_ids)
    stack = list(seed_ids)
    while stack:
        x = stack.pop()
        for s in succ_multi.get(x, set()):
            if s not in seen:
                seen.add(s)
                stack.append(s)
    return seen


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
        print(traceback.format_exc())
        progress[scenario] = -1  # mark as crashed

    finally:
        lock = get_lock(scenario)
        with lock:
            active_jobs[scenario] = False
            cancel_flag[scenario] = False
        print(f"[STATE] Scheduler finished for {scenario}")


def publish_candidate_files(scenario: str, run_dir: str):
    out_dir = Path("scenarios") / scenario / "output"
    out_dir.mkdir(parents=True, exist_ok=True)

    run_dir = Path(run_dir)

    mapping = {
        "plan.csv": f"plan{CANDIDATE_SUFFIX}.csv",
        "late.csv": f"late{CANDIDATE_SUFFIX}.csv",
        "unplaced.csv": f"unplaced{CANDIDATE_SUFFIX}.csv",
        "orders_delivery.csv": f"orders_delivery{CANDIDATE_SUFFIX}.csv",
        "summaryFile.csv": f"summaryFile{CANDIDATE_SUFFIX}.csv",
        "run_meta.json": f"run_meta{CANDIDATE_SUFFIX}.json",
    }

    for src_name, dst_name in mapping.items():
        src = run_dir / src_name
        dst = out_dir / dst_name
        if src.exists():
            shutil.copy2(src, dst)


def candidate_paths(output_dir: Path):
    return {
        "plan": output_dir / f"plan{CANDIDATE_SUFFIX}.csv",
        "late": output_dir / f"late{CANDIDATE_SUFFIX}.csv",
        "unplaced": output_dir / f"unplaced{CANDIDATE_SUFFIX}.csv",
        "orders": output_dir / f"orders_delivery{CANDIDATE_SUFFIX}.csv",
        "summary": output_dir / f"summaryFile{CANDIDATE_SUFFIX}.csv",
        "meta": output_dir / f"run_meta{CANDIDATE_SUFFIX}.json",
    }


def baseline_paths(output_dir: Path):
    return {
        "plan": output_dir / "plan.csv",
        "late": output_dir / "late.csv",
        "unplaced": output_dir / "unplaced.csv",
        "orders": output_dir / "orders_delivery.csv",
        "summary": output_dir / "summaryFile.csv",
        "meta": output_dir / "run_meta.json",
    }


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

        active_jobs[scenario] = True
        cancel_flag[scenario] = False
        progress[scenario] = 0

    t = Thread(
        target=run_scheduler_background,
        args=(scenario, required_files, output_dir),
        daemon=True
    )
    t.start()

    return jsonify({"ok": True, "message": "Scheduler started"})


@schedule_bp.get("/status/<scenario_name>")
def get_status(scenario_name):
    return jsonify({
        "running": active_jobs.get(scenario_name, False),
        "progress": progress.get(scenario_name, 0),
        "cancelled": cancel_flag.get(scenario_name, False)
    })


@schedule_bp.post("/cancel/<scenario_name>")
def cancel_schedule(scenario_name):
    if not active_jobs.get(scenario_name, False):
        return jsonify({"ok": False, "message": "No active scheduler"}), 400

    cancel_flag[scenario_name] = True
    return jsonify({"ok": True, "message": "Cancel signal sent"})


# ----------------------------------------
# MOVE (preview candidate plan)
# ----------------------------------------
@schedule_bp.post("/move/<scenario_name>")
def move_job(scenario_name):
    scenario = scenario_name
    base = Path("scenarios") / scenario
    base_out = base / "output"
    plan_file = base_out / "plan.csv"

    if not base_out.exists() or not plan_file.exists():
        return jsonify({"ok": False, "error": "plan.csv not found"}), 404

    payload = request.get_json(silent=True) or {}
    job_id = str(payload.get("job_id", "")).strip()
    target_start_raw = payload.get("target_start")

    if not job_id or not target_start_raw:
        return jsonify({"ok": False, "error": "Missing job_id or target_start"}), 400

    target_start = pd.to_datetime(target_start_raw, errors="coerce", utc=True).tz_convert(None)

    if pd.isna(target_start):
        return jsonify({"ok": False, "error": "Invalid target_start"}), 400

    # block if long run active
    lock = get_lock(scenario)
    with lock:
        if active_jobs.get(scenario, False):
            return jsonify({"ok": False, "error": "Scheduler already running"}), 409

    # ---- load current plan ----
    df_plan = pd.read_csv(plan_file)
    df_plan = df_plan.where(pd.notna(df_plan), None)
    if "job_id" not in df_plan.columns:
        return jsonify({"ok": False, "error": f"plan.csv missing 'job_id' column. Have={list(df_plan.columns)}"}), 500

    df_plan = _parse_plan_times(df_plan)
    for col in ["Start", "End"]:
        if col in df_plan.columns and df_plan[col].dt.tz is not None:
            df_plan[col] = df_plan[col].dt.tz_localize(None)

    row = df_plan.loc[df_plan["job_id"] == job_id]
    if row.empty:
        return jsonify({"ok": False, "error": f"job_id not found in plan: {job_id}"}), 404

    old_start = row["Start"].iloc[0]
    old_wp = row["WorkPlaceNo"].iloc[0]

    if pd.isna(old_start) or not old_wp:
        return jsonify({"ok": False, "error": "Target job has no Start or WorkPlaceNo in plan"}), 400

    cutoff = old_start  # stable prefix boundary

    # ---- paths to cleaned inputs ----
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

    # ---- build dependency closure (successors) ----
    cfg = load_scenario_config(scenario) if scenario else {"mode": "real_time"}
    baseline_meta_path = base_out / "run_meta.json"
    now_ts = scenario_now(cfg)

    if baseline_meta_path.exists():
        try:
            prev_meta = json.loads(baseline_meta_path.read_text("utf-8"))
            if prev_meta.get("now_used"):
                now_ts = pd.to_datetime(prev_meta["now_used"], errors="coerce")
        except Exception as e:
            print("[MOVE] could not read baseline run_meta.json:", e)

    jobs, shifts, unlimited, outsourcing, *_ = load_cleaned_inputs(
        required_files["jobs_clean.csv"],
        required_files["shifts_clean.csv"],
        required_files["unlimited_machines.csv"],
        required_files["outsourcing_machines.csv"],
        now_ts
    )
    _, succ_multi = build_dependency_graph(jobs)


    # ---- compute affected set ----
    affected = {job_id}

    same_wp_after = df_plan[
        (df_plan["WorkPlaceNo"] == old_wp) &
        (df_plan["Start"].notna()) &
        (df_plan["Start"] >= cutoff)
    ]["job_id"].tolist()
    affected |= set(same_wp_after)

    affected = _successor_closure(affected, succ_multi)

    # ---- compute locked ops = stable prefix ----
    locked_ops = df_plan[
        df_plan["Start"].notna() &
        df_plan["End"].notna() &
        (~df_plan["job_id"].isin(affected))
        ].copy()

    # ---- clamp pin if it falls inside a locked op on same WP ----
    pin = target_start
    overlap = locked_ops[
        (locked_ops["WorkPlaceNo"] == old_wp) &
        (locked_ops["Start"].notna()) &
        (locked_ops["End"].notna()) &
        (locked_ops["Start"] <= pin) &
        (locked_ops["End"] > pin)
    ]
    if not overlap.empty:
        pin = max(pin, overlap["End"].max())

    print(f"[MOVE] job_id={job_id} old_wp={old_wp} cutoff={cutoff}")
    print(f"[MOVE] affected_count={len(affected)} locked_ops_count={len(locked_ops)} pin={pin}")

    # ---- run preview schedule ----
    res = run_scheduler_with_paths(
        required_files["jobs_clean.csv"],
        required_files["shifts_clean.csv"],
        required_files["unlimited_machines.csv"],
        required_files["outsourcing_machines.csv"],
        output_dir,
        scenario_name=scenario,
        progress_callback=None,
        locked_ops=locked_ops,
        pinned_starts={job_id: pin},
        sa_enabled=False,
        preview_only=True,
        now_ts=now_ts,
    )

    if isinstance(res, dict) and res.get("cancelled"):
        return jsonify({"ok": False, "error": "Move preview cancelled"}), 409

    run_dir = (res or {}).get("run_dir")
    if run_dir:
        publish_candidate_files(scenario, run_dir)

    plan_records = (res or {}).get("plan_records", []) or []

    return jsonify({
        "ok": True,
        "scenario": scenario,
        "job_id": job_id,
        "target_start": target_start.isoformat(),
        "effective_pin": pd.Timestamp(pin).isoformat(),
        "cutoff": pd.Timestamp(cutoff).isoformat(),
        "affected_count": int(len(affected)),
        "locked_ops_count": int(len(locked_ops)),
        "candidate_ready": True,
        "plan": plan_records,
        "engine_result": {
            "run_id": (res or {}).get("run_id"),
            "run_dir": run_dir,
            "preview_only": True,
        },
    })


@schedule_bp.post("/apply-candidate/<scenario_name>")
def apply_candidate(scenario_name):
    scenario = scenario_name
    out_dir = Path("scenarios") / scenario / "output"

    if not out_dir.exists():
        return jsonify({"ok": False, "error": "Scenario output not found"}), 404

    lock = get_lock(scenario)
    with lock:
        if active_jobs.get(scenario, False):
            return jsonify({"ok": False, "error": "Scheduler already running"}), 409

        cand = candidate_paths(out_dir)
        base = baseline_paths(out_dir)

        missing = [k for k, p in cand.items() if k in ("plan", "summary") and not p.exists()]
        if missing:
            return jsonify({"ok": False, "error": "Candidate not found", "missing": missing}), 404

        mapping = {
            cand["plan"]: base["plan"],
            cand["late"]: base["late"],
            cand["unplaced"]: base["unplaced"],
            cand["orders"]: base["orders"],
            cand["summary"]: base["summary"],
            cand["meta"]: base["meta"],
        }

        copied = []
        for src, dst in mapping.items():
            if src.exists():
                shutil.copy2(src, dst)
                copied.append(dst.name)

        return jsonify({"ok": True, "message": "Candidate applied", "updated": copied})


@schedule_bp.post("/discard-candidate/<scenario_name>")
def discard_candidate(scenario_name):
    scenario = scenario_name
    out_dir = Path("scenarios") / scenario / "output"

    if not out_dir.exists():
        return jsonify({"ok": False, "error": "Scenario output not found"}), 404

    lock = get_lock(scenario)
    with lock:
        if active_jobs.get(scenario, False):
            return jsonify({"ok": False, "error": "Scheduler already running"}), 409

        cand = candidate_paths(out_dir)
        deleted = []
        for p in cand.values():
            if p.exists():
                p.unlink()
                deleted.append(p.name)

        return jsonify({"ok": True, "message": "Candidate discarded", "deleted": deleted})


@schedule_bp.post("/generate-candidate/<scenario_name>")
def generate_candidate(scenario_name):
    scenario = scenario_name
    base = Path("scenarios") / scenario
    base_out = base / "output"
    plan_file = base_out / "plan.csv"

    if not base_out.exists() or not plan_file.exists():
        return jsonify({"ok": False, "error": "plan.csv not found"}), 404

    # block if long run active
    lock = get_lock(scenario)
    with lock:
        if active_jobs.get(scenario, False):
            return jsonify({"ok": False, "error": "Scheduler already running"}), 409

    # ---- load baseline plan ----
    df_plan = pd.read_csv(plan_file)
    df_plan = df_plan.where(pd.notna(df_plan), None)
    df_plan = _parse_plan_times(df_plan)

    # ---- load scenario now ----
    cfg = load_scenario_config(scenario) if scenario else {"mode": "real_time"}
    baseline_meta_path = base_out / "run_meta.json"
    now_ts = scenario_now(cfg)

    if baseline_meta_path.exists():
        try:
            prev_meta = json.loads(baseline_meta_path.read_text("utf-8"))
            if prev_meta.get("now_used"):
                now_ts = pd.to_datetime(prev_meta["now_used"], errors="coerce")
        except Exception as e:
            print("[GEN] could not read baseline run_meta.json:", e)

    # ✅ CRITICAL FIX: Ensure now_ts is timezone-naive
    now_ts = pd.to_datetime(now_ts, errors="coerce")
    if pd.notna(now_ts) and now_ts.tzinfo is not None:
        now_ts = now_ts.tz_convert(None)

    # ✅ CRITICAL FIX: Ensure df_plan datetime columns are naive
    for col in ["Start", "End"]:
        if col in df_plan.columns:
            df_plan[col] = pd.to_datetime(df_plan[col], errors="coerce")
            if df_plan[col].dt.tz is not None:
                df_plan[col] = df_plan[col].dt.tz_convert(None)

    # ---- paths to cleaned inputs ----
    cleaned = base / "cleaned"
    output_dir = base_out
    required_files = {
        "jobs_clean.csv": cleaned / "jobs_clean.csv",
        "shifts_clean.csv": cleaned / "shifts_clean.csv",
        "unlimited_machines.csv": cleaned / "unlimited_machines.csv",
        "outsourcing_machines.csv": cleaned / "outsourcing_machines.csv",
    }
    missing = [n for n, p in required_files.items() if not p.exists()]
    if missing:
        return jsonify({"ok": False, "error": "Missing cleaned files", "missing": missing}), 400

    # ✅ NEW: Load overrides to compute affected set
    overrides_path = base_out / "overrides.json"
    pinned_starts = {}
    affected = set()

    if overrides_path.exists():
        try:
            obj = json.loads(overrides_path.read_text("utf-8"))
            changes = obj.get("changes") or []

            if changes:
                # Load dependency graph
                jobs, shifts, unlimited, outsourcing, *_ = load_cleaned_inputs(
                    required_files["jobs_clean.csv"],
                    required_files["shifts_clean.csv"],
                    required_files["unlimited_machines.csv"],
                    required_files["outsourcing_machines.csv"],
                    now_ts
                )
                _, succ_multi = build_dependency_graph(jobs)

                # Process each override
                for ch in changes:
                    jid = str(ch.get("job_id", "")).strip()
                    if not jid:
                        continue

                    st = pd.to_datetime(ch.get("Start"), errors="coerce")
                    if pd.notna(st):
                        if st.tzinfo is not None:
                            st = st.tz_convert(None)
                        pinned_starts[jid] = st

                    # Get baseline row
                    row = df_plan[df_plan["job_id"] == jid]
                    if row.empty:
                        continue

                    baseline_start = row["Start"].iloc[0]
                    wp = row["WorkPlaceNo"].iloc[0]

                    # Add to affected: target job
                    affected.add(jid)

                    # Add: same machine jobs starting at or after baseline cutoff
                    same_wp_after = df_plan[
                        (df_plan["WorkPlaceNo"] == wp) &
                        (df_plan["Start"].notna()) &
                        (df_plan["Start"] >= baseline_start)
                    ]["job_id"].tolist()
                    affected.update(same_wp_after)

                    # Add: transitive closure of successors
                    affected.update(_successor_closure({jid}, succ_multi))

                print(f"[GEN] Computed affected set: {len(affected)} jobs from {len(changes)} overrides")

        except Exception as e:
            print(f"[GEN] Error processing overrides: {e}")
            import traceback
            traceback.print_exc()

    # ✅ COMPUTE LOCKED OPS: everything NOT in affected set
    if affected:
        locked_ops = df_plan[
            df_plan["Start"].notna() &
            df_plan["End"].notna() &
            (~df_plan["job_id"].isin(affected))
        ].copy()
        print(f"[GEN] Locking {len(locked_ops)} stable jobs (affected={len(affected)})")
    else:
        # No overrides → lock everything up to now_ts (original behavior)
        locked_ops = df_plan[
            df_plan["Start"].notna() &
            df_plan["End"].notna() &
            (df_plan["End"] <= now_ts)
        ].copy()
        print(f"[GEN] No overrides → locking {len(locked_ops)} jobs ending before now_ts")

    res = run_scheduler_with_paths(
        required_files["jobs_clean.csv"],
        required_files["shifts_clean.csv"],
        required_files["unlimited_machines.csv"],
        required_files["outsourcing_machines.csv"],
        output_dir,
        scenario_name=scenario,
        progress_callback=None,
        locked_ops=locked_ops,
        pinned_starts=pinned_starts,
        sa_enabled=False,
        preview_only=True,
        now_ts=now_ts,
    )

    if isinstance(res, dict) and res.get("cancelled"):
        return jsonify({"ok": False, "error": "Generate candidate cancelled"}), 409

    run_dir = (res or {}).get("run_dir")
    if run_dir:
        publish_candidate_files(scenario, run_dir)

    return jsonify({
        "ok": True,
        "scenario": scenario,
        "candidate_ready": True,
        "locked_ops_count": int(len(locked_ops)),
        "affected_count": int(len(affected)),
        "pins_count": int(len(pinned_starts)),
        "plan": (res or {}).get("plan_records", []) or [],
        "engine_result": {
            "run_id": (res or {}).get("run_id"),
            "run_dir": run_dir,
            "preview_only": True,
        },
    })
@schedule_bp.post("/overrides/<scenario_name>")
def save_overrides(scenario_name):
    scenario = scenario_name
    base = Path("scenarios") / scenario
    out_dir = base / "output"
    out_dir.mkdir(parents=True, exist_ok=True)

    payload = request.get_json(silent=True) or {}
    changes = payload.get("changes", [])

    if not isinstance(changes, list):
        return jsonify({"ok": False, "error": "changes must be a list"}), 400

    # Normalize + validate
    norm = []
    for ch in changes:
        job_id = str(ch.get("job_id", "")).strip()
        if not job_id:
            continue

        norm.append({
            "job_id": job_id,
            "WorkPlaceNo": str(ch.get("WorkPlaceNo", "")).strip(),
            "Start": ch.get("Start"),
            "End": ch.get("End"),
        })

    overrides_path = out_dir / "overrides.json"
    overrides_path.write_text(
        json.dumps(
            {
                "scenario": scenario,
                "changes": norm,
            },
            indent=2,
            default=str,
        ),
        encoding="utf-8",
    )

    return jsonify({
        "ok": True,
        "message": "Overrides gespeichert",
        "count": len(norm),
    })
@schedule_bp.get("/overrides-status/<scenario_name>")
def overrides_status(scenario_name):
    out_dir = Path("scenarios") / scenario_name / "output"
    overrides_path = out_dir / "overrides.json"

    if not out_dir.exists():
        return jsonify({"ok": False, "error": "Scenario output not found"}), 404

    if not overrides_path.exists():
        return jsonify({"ok": True, "exists": False, "count": 0})

    try:
        obj = json.loads(overrides_path.read_text("utf-8"))
        changes = obj.get("changes") or []
        return jsonify({"ok": True, "exists": True, "count": len(changes)})
    except Exception:
        # if file corrupted treat as not existing
        return jsonify({"ok": True, "exists": False, "count": 0})

@schedule_bp.post("/discard-overrides/<scenario_name>")
def discard_overrides(scenario_name):
    out_dir = Path("scenarios") / scenario_name / "output"
    overrides_path = out_dir / "overrides.json"

    if not out_dir.exists():
        return jsonify({"ok": False, "error": "Scenario output not found"}), 404

    lock = get_lock(scenario_name)
    with lock:
        if active_jobs.get(scenario_name, False):
            return jsonify({"ok": False, "error": "Scheduler already running"}), 409

        if overrides_path.exists():
            overrides_path.unlink()

    return jsonify({"ok": True, "message": "Overrides verworfen"})
