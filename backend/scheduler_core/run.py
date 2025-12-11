import math
import random
from pathlib import Path

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

# Cancel / state flags (module at backend/scheduler_state.py)
from scheduler_state import cancel_flag, active_jobs



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
def run_once(jobs, shifts, unlimited, outsourcing, weights, scenario_name=None):
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
        scenario_name=scenario_name,
    )

    # If scheduler was cancelled deep inside and signalled by returning None
    if plan is None or late is None or unplaced is None:
        print(f"[RUN_ONCE] schedule() returned None for scenario {scenario_name} → treat as CANCEL")
        return None, None, None, None

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

    return plan, late, unplaced, score



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
):

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
        jobs_clean_path, shifts_clean_path, unlimited_path, outsourcing_path
    )

    print(f"[ENGINE] Loaded inputs: {len(jobs)} jobs, {len(shifts)} shifts")

    update(10)

    if scenario_name and cancel_flag.get(scenario_name):
        return early_cancel()

    # FIRST RUN
    print("[ENGINE] Running initial schedule pass")
    random.seed(SA_SEED)

    base_weights = weights.copy() if weights else DEFAULT_WEIGHTS.copy()
    print(f"[ENGINE] Initial weights: {base_weights}")

    plan, late, unplaced, score = run_once(
        jobs, shifts, unlimited, outsourcing, base_weights, scenario_name=scenario_name
    )

    # If cancelled during first run
    if plan is None:
        print("[ENGINE] Cancellation bubbled up from first run_once()")
        return early_cancel()

    best_plan, best_late, best_unplaced, best_score = plan, late, unplaced, score
    best_weights = base_weights.copy()

    print(f"[ENGINE] First run score = {best_score}")

    update(25)


    # SIMULATED ANNEALING LOOP
    if SA_ENABLED:
        print("[ENGINE] Starting Simulated Annealing...")
        temp = SA_INIT_TEMP
        cur_w = base_weights.copy()
        cur_plan, cur_late, cur_unplaced, cur_score = (
            best_plan,
            best_late,
            best_unplaced,
            best_score,
        )

        for it in range(SA_ITERS):
            print(f"[SA] Iter {it+1}/{SA_ITERS}, Temp={temp:.3f}")

            # CHECK FOR CANCELLATION
            current_flag = cancel_flag.get(scenario_name)
            print(f"[SA] cancel_flag[{scenario_name}] = {current_flag}")
            if scenario_name and current_flag:
                print(f"[SA] CANCEL detected during SA iteration {it+1}")
                return early_cancel()

            cand_w = jitter_weights(cur_w, SA_STEP_SCALE)
            plan, late, unplaced, sc = run_once(
                jobs, shifts, unlimited, outsourcing, cand_w, scenario_name=scenario_name
            )

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
                print(f"[SA] NEW BEST SCORE: {best_score}")

            update(30 + int((it / SA_ITERS) * 50))
            temp *= SA_COOLING

    update(85)

    # FINAL CANCEL CHECK
    print(f"[ENGINE] Final cancel_flag[{scenario_name}] = {cancel_flag.get(scenario_name)}")
    if scenario_name and cancel_flag.get(scenario_name):
        print("[ENGINE] Cancel detected before writing files")
        return early_cancel()


    # WRITE OUTPUT FILES
    print("[ENGINE] Writing output files...")

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    plan_path = output_dir / "plan.csv"
    late_path = output_dir / "late.csv"
    unplaced_path = output_dir / "unplaced.csv"
    orders_path = output_dir / "orders_delivery.csv"
    summary_csv_path = output_dir / "summaryFile.csv"

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
        eligible_ops=eligible_ops,
        pre_ops_late=pre_ops_late,
        pre_orders_late=pre_orders_late,
    )
    print(f"[WRITE] summaryFile.csv → {summary_csv_path}")

    update(100)

    if scenario_name:
        active_jobs[scenario_name] = False
        cancel_flag[scenario_name] = False
        print(f"[ENGINE] active_jobs[{scenario_name}] cleared after finish")
        print(f"[ENGINE] cancel_flag[{scenario_name}] cleared after finish")

    print(f"===== [ENGINE] Finished scheduler for {scenario_name} =====\n")

    return {
        "plan": str(plan_path),
        "late": str(late_path),
        "unplaced": str(unplaced_path),
        "orders_delivery": str(orders_path),
        "summary": str(summary_csv_path),
    }



# CLI ENTRYPOINT (not used in API mode)
def main():
    print(
        "This module is API-driven.\n"
        "Use run_scheduler_with_paths() via Flask, not CLI mode."
    )


if __name__ == "__main__":
    main()
