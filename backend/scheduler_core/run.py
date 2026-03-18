import math
import random
from pathlib import Path
import json
from datetime import datetime
import shutil
import time
import pandas as pd  # helpful for debugging

from .config import (
    DEFAULT_WEIGHTS,
    SA_ENABLED,
    SA_ITERS,
    SA_INIT_TEMP,
    SA_COOLING,
    SA_STEP_SCALE,
    SA_SEED,
    INDUSTRIAL_FACTOR,
    SCHEDULE_RT,
)
from .io import load_cleaned_inputs
from .precedence import build_dependency_graph
from .scheduler import schedule
from .orders import make_orders_delivery_csv
from .kpis import compute_kpis_multi, add_idle_time_columns
from .report import write_summary
from .scenario_config import load_scenario_config, scenario_now


# Cancel / state flags (module at backend/scheduler_state.py)
from scheduler_state import cancel_flag, active_jobs

def _iso(ts):
    if ts is None:
        return None
    t = pd.to_datetime(ts, errors="coerce")
    if pd.isna(t):
        return None
    # treat naive as UTC
    if t.tzinfo is None:
        t = t.tz_localize("UTC")
    else:
        t = t.tz_convert("UTC")
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")

def df_to_json_records_safe(df: pd.DataFrame):
    if df is None or df.empty:
        return []

    out = df.copy()

    def to_naive_iso(series: pd.Series) -> pd.Series:
        """Convert to naive ISO format without timezone (no 'Z' suffix)"""
        s = pd.to_datetime(series, errors="coerce")
        # If timezone-aware, convert to UTC then remove timezone
        if getattr(s.dt, "tz", None) is not None:
            s = s.dt.tz_convert("UTC").dt.tz_localize(None)
        # Format as naive ISO string (no 'Z')
        return s.dt.strftime("%Y-%m-%dT%H:%M:%S")

    for col in ["Start", "End", "LatestStartDate", "OutsourcingDelivery"]:
        if col in out.columns:
            out[col] = to_naive_iso(out[col])

    # Handle any other datetime64 columns
    for col in out.columns:
        if pd.api.types.is_datetime64_any_dtype(out[col]) and col not in ["Start", "End", "LatestStartDate", "OutsourcingDelivery"]:
            out[col] = to_naive_iso(out[col])

    out = out.where(pd.notna(out), None)
    return out.to_dict(orient="records")



# JITTER WEIGHTS (Simulated Annealing)
def jitter_weights(weights, scale: float):
    new_w = {}
    for k, v in weights.items():
        factor = 1.0 + random.uniform(-scale, scale)
        nv = max(1e-6, v * factor)

        if k in ("w_has_ddl", "w_priority"):
            nv = max(10.0, min(nv, 5000.0))
        elif k in ("w_ddl_minutes", "w_earliest"):
            nv = max(0.0001, min(nv, 20.0))
        elif k in ("w_orderstate", "w_cont"):
            nv = max(0.0001, min(nv, 50.0))
        elif k in ("w_duration", "w_orderpos"):
            nv = max(0.00001, min(nv, 5.0))

        new_w[k] = nv
    return new_w



# RUN ONCE
def run_once(jobs, shifts, unlimited, outsourcing, weights, now_ts, cancel_check=None, locked_ops=None,freeze_until=None, freeze_pg2=False,pinned_starts=None, is_first_run=False):
    """
    Run one scheduling pass.
    Returns: plan, late, unplaced, score
    If the inner scheduler detects a cancellation, all four values are None.
    """
    base = jobs[jobs["RecordType"].isin(SCHEDULE_RT)].copy()
    base["duration_min"] = (
        pd.to_numeric(base["duration_min"], errors="coerce")
        .fillna(0)
        .astype(int)
    )

    pred_sets, succ_multi = build_dependency_graph(jobs)


    # IMPORTANT: pass scenario_name into scheduler so it can read cancel_flag
    plan, late, unplaced = schedule(
        base,
        shifts,
        pred_sets,
        succ_multi,
        unlimited,
        outsourcing,
        weights,
        now_ts=now_ts,
        cancel_check=cancel_check,
        locked_ops=locked_ops,
        freeze_until=freeze_until,
        freeze_pg2=freeze_pg2,
        pinned_starts=pinned_starts,
        skip_os5_seeding=(not is_first_run),

    )

    # If scheduler was cancelled deep inside and signalled by returning None
    if plan is None or late is None or unplaced is None:
        print("[RUN_ONCE] schedule() returned None → treat as CANCEL")

        return None, None, None, None, None

    if not plan.empty:
        plan["Duration"] = (
            plan["DurationReal"] / INDUSTRIAL_FACTOR
        ).round().astype("Int64")
        plan = add_idle_time_columns(plan, shifts, unlimited)

    kpis = compute_kpis_multi(plan)
    score = (
        2.0 * kpis.get("on_time", 0.0)
        + 0.8 * kpis.get("within_2d", 0.0)
        - 1.0 * kpis.get("beyond_7d", 0.0)
    )

    return plan, late, unplaced, score, pred_sets



# MAIN SCHEDULER (used by API)
def run_scheduler_with_paths(
    jobs_clean_path,
    shifts_clean_path,
    unlimited_path,
    outsourcing_path,
    output_dir: Path,
    scenario_name=None,
    weights=None,
    progress_callback=None,
    locked_ops=None,
    pinned_starts=None,
    sa_enabled=None,
    sa_config=None,        # NEW: Add SA config parameter
    preview_only=False,
    now_ts=None
):
    cfg = load_scenario_config(scenario_name) if scenario_name else {"mode": "real_time"}
    if now_ts is None:
        now_ts = scenario_now(cfg) if scenario_name else pd.Timestamp.now().floor("min")
        now_ts = pd.to_datetime(now_ts, errors="coerce", utc=True).tz_convert(None)
    else:
        now_ts = pd.to_datetime(now_ts, errors="coerce", utc=True).tz_convert(None)
    freeze_pg2 = bool(cfg.get("freeze_pg2", False))
    run_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    runs_dir = Path("scenarios") / str(scenario_name) / "runs" / run_id
    runs_dir.mkdir(parents=True, exist_ok=True)
    run_output_dir = runs_dir
    latest_dir = Path(output_dir)
    latest_dir.mkdir(parents=True, exist_ok=True)


    run_meta = {
        "scenario": scenario_name,
        "run_ts": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "mode": cfg.get("mode", "real_time"),
        "now_used": _iso(now_ts),
        "policy_version": cfg.get("policy_version", "unknown"),
        "freeze_horizon_hours": cfg.get("freeze_horizon_hours", 0),
        "freeze_pg2": bool(cfg.get("freeze_pg2", False)),
        "notes": cfg.get("notes", ""),
    }
    # Extract SA configuration
    if sa_config is None:
        sa_iters = SA_ITERS
        sa_init_temp = SA_INIT_TEMP
        sa_cooling = SA_COOLING
        sa_step_scale = SA_STEP_SCALE
        sa_seed = SA_SEED
        use_sa_enabled = SA_ENABLED
    else:
        sa_iters = sa_config.get("iterations", SA_ITERS)
        sa_init_temp = sa_config.get("initial_temp", SA_INIT_TEMP)
        sa_cooling = sa_config.get("cooling", SA_COOLING)
        sa_step_scale = sa_config.get("step_scale", SA_STEP_SCALE)
        sa_seed = sa_config.get("seed", SA_SEED)
        use_sa_enabled = sa_config.get("enabled", SA_ENABLED)

    # Store in run_meta for tracking
    run_meta["sa_enabled"] = use_sa_enabled
    run_meta["sa_iterations"] = sa_iters
    run_meta["sa_initial_temp"] = sa_init_temp
    run_meta["sa_cooling"] = sa_cooling
    run_meta["sa_step_scale"] = sa_step_scale

    freeze_h_global = int(cfg.get("freeze_horizon_hours", 0) or 0)
    freeze_by_wp = cfg.get("freeze_horizon_by_workplace", {})

    latest_plan_path = latest_dir / "plan.csv"
    latest_meta_path = latest_dir / "run_meta.json"

    # ===== PER-WORKPLACE FREEZE WINDOWS =====
    freeze_anchor_by_wp = {}
    freeze_until_by_wp = {}
    global_freeze_anchor = None
    global_freeze_until = None

    # Try to reuse previous anchored windows if still active
    if freeze_h_global > 0 and latest_meta_path.exists():
        try:
            prev_meta = json.loads(latest_meta_path.read_text(encoding="utf-8"))
            prev_anchor = prev_meta.get("freeze_anchor")
            prev_until_by_wp = prev_meta.get("freeze_until_by_workplace", {})

            if prev_anchor:
                prev_anchor_ts = pd.Timestamp(prev_anchor)

                # Check global window
                prev_until = prev_meta.get("freeze_until")
                if prev_until:
                    prev_until_ts = pd.Timestamp(prev_until)
                    if prev_until_ts > now_ts:
                        global_freeze_anchor = prev_anchor_ts
                        global_freeze_until = prev_until_ts
                        print(
                            f"[FREEZE] Reusing global anchored window: {global_freeze_anchor} → {global_freeze_until}")

                # Check each workplace-specific window
                for wp, prev_until_str in prev_until_by_wp.items():
                    try:
                        prev_until_ts = pd.Timestamp(prev_until_str)
                        if prev_until_ts > now_ts:
                            freeze_anchor_by_wp[wp] = prev_anchor_ts
                            freeze_until_by_wp[wp] = prev_until_ts
                            print(f"[FREEZE] Reusing workplace {wp} window: {prev_anchor_ts} → {prev_until_ts}")
                    except Exception as e:
                        print(f"[FREEZE] Error parsing workplace {wp} window: {e}")

        except Exception as e:
            print(f"[FREEZE] Could not read previous run_meta.json: {e}")

    # Create new anchored windows for workplaces without reused windows
    if freeze_h_global > 0 or freeze_by_wp:
        # Set global window if not reused
        if global_freeze_until is None and freeze_h_global > 0:
            global_freeze_anchor = now_ts
            global_freeze_until = now_ts + pd.Timedelta(hours=freeze_h_global)
            print(f"[FREEZE] New global anchored window: {global_freeze_anchor} → {global_freeze_until}")

        # Create workplace-specific windows
        for wp_key, wp_hours in freeze_by_wp.items():
            if wp_key not in freeze_until_by_wp:
                wp_h = int(wp_hours or 0)
                if wp_h > 0:
                    freeze_anchor_by_wp[wp_key] = now_ts
                    freeze_until_by_wp[wp_key] = now_ts + pd.Timedelta(hours=wp_h)
                    print(f"[FREEZE] New workplace {wp_key} window: {now_ts} → {freeze_until_by_wp[wp_key]}")

    # ===== EXTRACT LOCKED OPERATIONS FROM PREVIOUS PLAN =====
    locked_ops_by_wp = {}
    locked_ops_freeze = pd.DataFrame()

    if latest_plan_path.exists() and (freeze_h_global > 0 or freeze_by_wp):
        prev_plan = pd.read_csv(latest_plan_path)
        prev_plan["Start"] = pd.to_datetime(prev_plan["Start"], errors="coerce")
        prev_plan["End"] = pd.to_datetime(prev_plan["End"], errors="coerce")
        prev_plan["WorkPlaceNo"] = prev_plan["WorkPlaceNo"].astype(str).str.strip()

        # Filter by PriorityGroup
        freeze_pg2 = bool(cfg.get("freeze_pg2", False))

        if "PriorityGroup" in prev_plan.columns:
            prev_plan["PriorityGroup"] = pd.to_numeric(
                prev_plan["PriorityGroup"], errors="coerce"
            ).fillna(2).astype(int)

            if freeze_pg2:
                prev_plan = prev_plan[prev_plan["PriorityGroup"].isin([0, 1, 2])].copy()
            else:
                prev_plan = prev_plan[prev_plan["PriorityGroup"].isin([0, 1])].copy()
        else:
            if not freeze_pg2:
                print("[FREEZE] WARNING: plan.csv has no PriorityGroup; cannot exclude PG2. Freezing all locked ops.")

        # Group by workplace and apply workplace-specific freeze windows
        for wp, wp_plan in prev_plan.groupby("WorkPlaceNo"):
            # Get freeze window for this workplace (workplace-specific or global)
            freeze_until_wp = freeze_until_by_wp.get(wp, global_freeze_until)
            freeze_anchor_wp = freeze_anchor_by_wp.get(wp, global_freeze_anchor)

            if freeze_until_wp is None or freeze_anchor_wp is None:
                continue

            # Filter operations within this workplace's freeze window
            locked_wp = wp_plan[
                wp_plan["Start"].notna() & wp_plan["End"].notna() &
                (wp_plan["Start"] <= freeze_until_wp)
                ].copy()

            if len(locked_wp) > 0:
                locked_ops_by_wp[wp] = locked_wp
                print(
                    f"[FREEZE] Workplace {wp}: {len(locked_wp)} ops locked within [{freeze_anchor_wp}, {freeze_until_wp})")

        # Combine all locked ops from freeze
        if locked_ops_by_wp:
            locked_ops_freeze = pd.concat(locked_ops_by_wp.values(), ignore_index=True)

    print(f"[FREEZE] Total freeze-locked operations: {len(locked_ops_freeze)}")

    # ===== COMBINE ALL LOCKED OPERATIONS =====
    locked_ops_all = None

    if locked_ops_freeze is not None and len(locked_ops_freeze) > 0:
        locked_ops_all = locked_ops_freeze.copy()

    if locked_ops is not None and len(locked_ops) > 0:
        if locked_ops_all is None:
            locked_ops_all = locked_ops.copy()
        else:
            locked_ops_all = pd.concat([locked_ops_all, locked_ops], ignore_index=True)

    print(f"[LOCKS] Total locked operations: {len(locked_ops_all) if locked_ops_all is not None else 0}")
    print(f"[LOCKS]   - Freeze: {len(locked_ops_freeze)}")
    print(f"[LOCKS]   - User: {len(locked_ops) if locked_ops is not None else 0}")

    # Determine freeze enforcement
    freeze_enforce_until = (
        global_freeze_until
        if (freeze_h_global > 0 and locked_ops_all is not None and len(locked_ops_all) > 0)
        else None
    )

    print(f"[FREEZE] freeze_enforce_until={_iso(freeze_enforce_until)}")

    # Update run_meta with freeze info
    run_meta["freeze_anchor"] = _iso(global_freeze_anchor) if global_freeze_anchor is not None else None
    run_meta["freeze_until"] = _iso(global_freeze_until) if global_freeze_until is not None else None
    run_meta["freeze_horizon_by_workplace"] = freeze_by_wp
    run_meta["freeze_until_by_workplace"] = {
        wp: _iso(until) for wp, until in freeze_until_by_wp.items()
    }
    run_meta["freeze_anchor_by_workplace"] = {
        wp: _iso(anchor) for wp, anchor in freeze_anchor_by_wp.items()
    }
    run_meta["freeze_source"] = "output/plan.csv" if (freeze_h_global > 0 or freeze_by_wp) else None
    run_meta["locked_ops_count"] = int(len(locked_ops_all)) if locked_ops_all is not None else 0
    # write archived meta for this run (always)
    (run_output_dir / "run_meta.json").write_text(
        json.dumps(run_meta, indent=2),
        encoding="utf-8"
    )
    print(f"[WRITE] run_meta.json → {run_output_dir / 'run_meta.json'} (archived)")

    def cancel_check():
        return bool(scenario_name and cancel_flag.get(scenario_name, False))

    print(f"\n===== [ENGINE] Starting scheduler for scenario: {scenario_name} =====")

    def update(p: int):
        print(f"[ENGINE] Progress update: {p}%")
        if progress_callback:
            progress_callback(int(p))

    # Helper to handle cancellation
    def early_cancel():
        print(f"[ENGINE] EARLY CANCEL triggered for: {scenario_name}")
        update(0)
        if scenario_name:
            # Reset state here for safety (API will also clear in finally)
            active_jobs[scenario_name] = False
            cancel_flag[scenario_name] = False
            print(f"[ENGINE] active_jobs[{scenario_name}] set to False after cancel")
            print(f"[ENGINE] cancel_flag[{scenario_name}] set to False after cancel")
        return {"cancelled": True}





    update(0)

    # INITIAL CANCEL CHECK
    print(f"[ENGINE] Initial cancel_flag[{scenario_name}] = {cancel_flag.get(scenario_name)}")
    if scenario_name and cancel_flag.get(scenario_name):
        return early_cancel()

    # LOAD CLEANED INPUT FILES
    print(f"[ENGINE] Loading cleaned inputs for scenario: {scenario_name}")
    (
        jobs,
        shifts,
        unlimited,
        outsourcing,
        pre_ops_late,
        pre_orders_late,
        eligible_ops,
    ) = load_cleaned_inputs(
        jobs_clean_path, shifts_clean_path, unlimited_path, outsourcing_path, now_ts
    )

    print(f"[ENGINE] Loaded inputs: {len(jobs)} jobs, {len(shifts)} shifts")

    # ✅ PRE-NORMALIZE DATAFRAME ONCE (will be reused across all 45 iterations!)
    print(f"[ENGINE] Pre-normalizing {len(jobs)} jobs in DataFrame (one-time operation)...")
    jobs['_wpU'] = jobs['WorkPlaceNo'].astype(str).str.strip().str.upper()
    jobs['_wp'] = jobs['WorkPlaceNo'].astype(str).str.strip()
    jobs['_pg'] = pd.to_numeric(jobs['PriorityGroup'], errors='coerce').fillna(2).astype(int)
    jobs['_os'] = pd.to_numeric(jobs['Orderstate'], errors='coerce').fillna(0).astype(int)
    jobs['_dur'] = pd.to_numeric(jobs['duration_min'], errors='coerce').fillna(0).astype(int).clip(lower=0)
    jobs['_buf'] = pd.to_numeric(jobs['buffer_min'], errors='coerce').fillna(0).astype(int).clip(lower=0)
    jobs['_rec'] = pd.to_numeric(jobs['RecordType'], errors='coerce').fillna(0).astype(int)
    jobs['_pos'] = pd.to_numeric(jobs['OrderPos'], errors='coerce').fillna(0).astype(int)
    print("[ENGINE] Pre-normalization complete (DataFrame columns added)")

    update(10)

    if scenario_name and cancel_flag.get(scenario_name):
        return early_cancel()

    # FIRST RUN
    print("[ENGINE] Running initial schedule pass")
    random.seed(SA_SEED)

    base_weights = weights.copy() if weights else DEFAULT_WEIGHTS.copy()
    print(f"[ENGINE] Initial weights: {base_weights}")


    plan, late, unplaced, score, pred_sets = run_once(
        jobs, shifts, unlimited, outsourcing, base_weights, now_ts=now_ts, cancel_check=cancel_check, locked_ops=locked_ops_all, freeze_until=freeze_enforce_until, freeze_pg2 = freeze_pg2,pinned_starts=pinned_starts,is_first_run=True,
    )

    # If cancelled during first run
    if plan is None:
        print("[ENGINE] Cancellation bubbled up from first run_once()")
        return early_cancel()

    best_plan, best_late, best_unplaced, best_score = plan, late, unplaced, score
    best_weights = base_weights.copy()

    print(f"[ENGINE] First run score = {best_score}")

    update(25)

    # Determine if SA is enabled
    if sa_enabled is not None:
        use_sa = bool(sa_enabled)  # Explicit override
    else:
        use_sa = use_sa_enabled  # From config or sa_config parameter
    if use_sa:

        print(
            f"[ENGINE] Starting Simulated Annealing: {sa_iters} iterations (temp={sa_init_temp}, cooling={sa_cooling})")
        random.seed(sa_seed)  # Set seed for reproducibility
        temp = sa_init_temp
        cur_w = base_weights.copy()
        cur_plan, cur_late, cur_unplaced, cur_score = (
            best_plan,
            best_late,
            best_unplaced,
            best_score,
        )

        for it in range(sa_iters):
            iter_start = time.time()
            print(f"[SA] Iter {it+1}/{sa_iters}, Temp={temp:.3f}")

            # CHECK FOR CANCELLATION
            current_flag = cancel_flag.get(scenario_name)
            print(f"[SA] cancel_flag[{scenario_name}] = {current_flag}")
            if scenario_name and current_flag:
                print(f"[SA] CANCEL detected during SA iteration {it+1}")
                return early_cancel()

            cand_w = jitter_weights(cur_w, sa_step_scale)
            plan, late, unplaced, sc, pred_sets_iter = run_once(
                jobs, shifts, unlimited, outsourcing, cand_w,
                now_ts=now_ts,
                cancel_check=cancel_check, locked_ops=locked_ops_all, freeze_until=freeze_enforce_until, freeze_pg2 = freeze_pg2,pinned_starts=pinned_starts,is_first_run=False,
            )
            iter_time = time.time() - iter_start
            print(f"[SA] Iter {it + 1} completed in {iter_time:.1f}s (score={sc:.2f})")

            # If cancelled inside this run
            if plan is None:
                print(f"[SA] Cancellation bubbled up from run_once() in iter {it+1}")
                return early_cancel()

            improve = sc > cur_score
            accept = improve or (
                random.random()
                < math.exp((sc - cur_score) / max(1e-9, temp))
            )

            if accept:
                print(f"[SA] Accepted new weights with score {sc}")
                cur_w, cur_plan, cur_late, cur_unplaced, cur_score = (
                    cand_w,
                    plan,
                    late,
                    unplaced,
                    sc,
                )

            if sc > best_score:
                best_weights = cand_w
                best_plan, best_late, best_unplaced, best_score = (
                    plan,
                    late,
                    unplaced,
                    sc,
                )
                pred_sets = pred_sets_iter
                print(f"[SA] NEW BEST SCORE: {best_score}")

            update(30 + int((it / sa_iters) * 50))
            temp *= sa_cooling

    update(85)

    # FINAL CANCEL CHECK
    print(f"[ENGINE] Final cancel_flag[{scenario_name}] = {cancel_flag.get(scenario_name)}")
    if scenario_name and cancel_flag.get(scenario_name):
        print("[ENGINE] Cancel detected before writing files")
        return early_cancel()

    run_meta["plan_score"] = float(best_score) if best_score is not None else None
    (run_output_dir / "run_meta.json").write_text(
        json.dumps(run_meta, indent=2),
        encoding="utf-8"
    )

    # WRITE OUTPUT FILES
    print("[ENGINE] Writing output files...")

    # ✅ CRITICAL FIX: Write CSV with naive timestamps
    plan_path = run_output_dir / "plan.csv"
    late_path = run_output_dir / "late.csv"
    unplaced_path = run_output_dir / "unplaced.csv"
    orders_path = run_output_dir / "orders_delivery.csv"
    summary_csv_path = run_output_dir / "summaryFile.csv"

    # ✅ Strip timezone before writing
    if not best_plan.empty:
        for col in ["Start", "End", "LatestStartDate", "OutsourcingDelivery"]:
            if col in best_plan.columns:
                best_plan[col] = pd.to_datetime(best_plan[col], errors="coerce")
                if best_plan[col].dt.tz is not None:
                    best_plan[col] = best_plan[col].dt.tz_localize(None)

    if not best_late.empty:
        for col in ["Start", "End", "LatestStartDate", "Allowed"]:
            if col in best_late.columns:
                best_late[col] = pd.to_datetime(best_late[col], errors="coerce")
                if best_late[col].dt.tz is not None:
                    best_late[col] = best_late[col].dt.tz_localize(None)

    # ✅ Write with explicit format (no timezone)
    best_plan.to_csv(plan_path, index=False, date_format="%Y-%m-%d %H:%M:%S")
    best_late.to_csv(late_path, index=False, date_format="%Y-%m-%d %H:%M:%S")
    best_unplaced.to_csv(unplaced_path, index=False)

    print(f"[WRITE] plan.csv → {plan_path}")
    print(f"[WRITE] late.csv → {late_path}")
    print(f"[WRITE] unplaced.csv → {unplaced_path}")

    make_orders_delivery_csv(best_plan, jobs, out_csv=orders_path)
    print(f"[WRITE] orders_delivery.csv → {orders_path}")

    write_summary(
        jobs,
        shifts,
        best_plan,
        best_late,
        best_unplaced,
        summary_csv_path,
        orders_path,
        now_ts=now_ts,
        eligible_ops=eligible_ops,
        pre_ops_late=pre_ops_late,
        pre_orders_late=pre_orders_late,
    )
    print(f"[WRITE] summaryFile.csv → {summary_csv_path}")
    # ---- PUBLISH GATE: only overwrite output/ if this run beats currently released plan_score ----
    publish = False
    prev_score = None

    if not latest_plan_path.exists() or not latest_meta_path.exists():
        # First ever publish
        publish = True
        print("[PUBLISH] No existing output plan/meta → publishing this run.")
    else:
        try:
            prev_meta = json.loads(latest_meta_path.read_text(encoding="utf-8"))
            prev_score = prev_meta.get("plan_score", None)
        except Exception as e:
            print(f"[PUBLISH] Could not read previous output run_meta.json: {e}")
            prev_score = None

        # If previous score missing, you can either recompute or just publish.
        # Safer for release: do NOT publish unless we can compare.
        if prev_score is None:
            print("[PUBLISH] Previous plan_score missing → NOT publishing (no safe comparison).")
            publish = False
        else:
            publish = (best_score is not None and float(best_score) > float(prev_score))
            print(f"[PUBLISH] Compare scores: new={best_score:.6f} vs old={prev_score:.6f} → publish={publish}")

    if preview_only:
        publish = False

    if publish:
        # write the released meta (now it matches released plan)
        (latest_dir / "run_meta.json").write_text(
            json.dumps(run_meta, indent=2),
            encoding="utf-8"
        )

        for fn in ["plan.csv", "late.csv", "unplaced.csv", "orders_delivery.csv", "summaryFile.csv", "run_meta.json"]:
            shutil.copy2(run_output_dir / fn, latest_dir / fn)

        print(f"[PUBLISH] output/ updated → {latest_dir}")
    else:
        print("[PUBLISH] output/ NOT updated; kept previous released plan.")
    # -------------------------------------------------------------------------------

    update(100)

    if scenario_name:
        active_jobs[scenario_name] = False
        cancel_flag[scenario_name] = False
        print(f"[ENGINE] active_jobs[{scenario_name}] cleared after finish")
        print(f"[ENGINE] cancel_flag[{scenario_name}] cleared after finish")

    print(f"===== [ENGINE] Finished scheduler for {scenario_name} =====\n")
    records = df_to_json_records_safe(best_plan)

    # add predecessors only to JSON (not to CSV)
    if pred_sets is not None:
        for r in records:
            jid = str(r.get("job_id") or "").strip()
            r["PredIds"] = sorted(list(pred_sets.get(jid, set())))
    return {
        "run_id": run_id,
        "run_dir": str(run_output_dir),
        "plan": str(plan_path),
        "late": str(late_path),
        "unplaced": str(unplaced_path),
        "orders_delivery": str(orders_path),
        "summary": str(summary_csv_path),
        "plan_records": records,

    }



# CLI ENTRYPOINT (not used in API mode)
def main():
    print(
        "This module is API-driven.\n"
        "Use run_scheduler_with_paths() via Flask, not CLI mode."
    )


if __name__ == "__main__":
    main()
