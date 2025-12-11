import pandas as pd
from .config import INDUSTRIAL_FACTOR, GRACE_DAYS, INCLUDE_NON_EFFECTIVE_IN_ONTIME

from .kpis import compute_kpis_multi, sum_delay_in_shift_minutes, compute_scheduler_kpis


def compute_order_delivery_kpis(order_df: pd.DataFrame):
    res = {f"within_{d}d": 0.0 for d in range(0, 8)}
    res["beyond_7d"] = 0.0
    res["on_time"] = 0.0
    if order_df.empty:
        return res

    df = order_df.copy()
    target = pd.to_datetime(df["SupposedDeliveryDate"], errors="coerce")
    actual = pd.to_datetime(df["DeliveryAfterScheduling"], errors="coerce")

    # Keep rows that have an actual delivery date
    ok = actual.notna()
    if not ok.any():
        return res
    target = target[ok]
    actual = actual[ok]

    eff_mask = target.dt.year >= 2025
    noneff_mask = ~eff_mask  # includes NaT targets and <2025

    if INCLUDE_NON_EFFECTIVE_IN_ONTIME:
        denom = int(len(actual))  # all orders with an actual date
    else:
        #effective-only
        actual = actual[eff_mask]
        target = target[eff_mask]
        denom = int(len(actual))

    if denom == 0:
        return res

    # Buckets 0..7 days
    for d in range(0, 8):
        count_on_time = 0
        if INCLUDE_NON_EFFECTIVE_IN_ONTIME:
            # effective contribution
            if eff_mask.any():
                allowed_eff = target[eff_mask] + pd.to_timedelta(d, unit="D")
                count_on_time += int((actual[eff_mask] <= allowed_eff).sum())
            # non-effective are always on-time
            count_on_time += int(noneff_mask.sum())
        else:
            allowed_eff = target + pd.to_timedelta(d, unit="D")
            count_on_time += int((actual <= allowed_eff).sum())

        pct = (count_on_time / denom) * 100.0
        key = "on_time" if d == 0 else f"within_{d}d"
        res[key] = pct

    # Beyond 7d: only effective can be late beyond 7
    if INCLUDE_NON_EFFECTIVE_IN_ONTIME and eff_mask.any():
        allowed7 = target[eff_mask] + pd.to_timedelta(7, unit="D")
        count_beyond = int((actual[eff_mask] > allowed7).sum())
    elif not INCLUDE_NON_EFFECTIVE_IN_ONTIME:
        allowed7 = target + pd.to_timedelta(7, unit="D")
        count_beyond = int((actual > allowed7).sum())
    else:
        count_beyond = 0

    res["beyond_7d"] = (count_beyond / denom) * 100.0
    return res


def write_summary(
    jobs,
    shifts,
    plan_df,
    late_df,
    unplaced_df,
    out_csv,
    orders_csv,
    eligible_ops=0,
    pre_ops_late=0,
    pre_orders_late=0,
):
    total_scheduled = len(plan_df)
    total_late = len(late_df)
    total_unplaced = len(unplaced_df)
    unique_orders = plan_df["OrderNo"].nunique() if not plan_df.empty else 0
    unique_machines = plan_df["WorkPlaceNo"].nunique() if not plan_df.empty else 0
    total_real_min = (
        int(plan_df.get("DurationReal", plan_df["Duration"]).sum())
        if not plan_df.empty
        else 0
    )
    total_ind_min = int(round(total_real_min / INDUSTRIAL_FACTOR)) if total_real_min else 0
    first_start = plan_df["Start"].min() if not plan_df.empty else pd.NaT
    last_end = plan_df["End"].max() if not plan_df.empty else pd.NaT

    kpis = compute_kpis_multi(plan_df)
    pct_pre_ops_late = (pre_ops_late / max(1, eligible_ops) * 100.0)
    real_gap_min, ind_gap_min = sum_delay_in_shift_minutes(plan_df, shifts)
    sched_kpis = compute_scheduler_kpis(plan_df, jobs)

    summary = pd.DataFrame(
        [
            {"Metric": "Eligible ops (60/115) before scheduling", "Value": eligible_ops},
            {"Metric": "% ops already late (pre)", "Value": round(pct_pre_ops_late, 2)},
            {"Metric": "Already late (input)", "Value": sched_kpis["planned_late"]},
            {"Metric": "On-time possible", "Value": sched_kpis["fixable_jobs"]},
            {"Metric": "On-time (fixable)", "Value": sched_kpis["on_time_fixable"]},
            {"Metric": "Late jobs completed", "Value": sched_kpis["late_completed"]},
            {"Metric": "Saved", "Value": sched_kpis["on_time_fixable_pct"]},
            {"Metric": "Scheduled jobs", "Value": total_scheduled},
            {
                "Metric": "Late jobs (beyond configured grace)",
                "Value": total_late,
            },
            {"Metric": "Unplaced jobs", "Value": total_unplaced},
            {"Metric": "Unique orders (scheduled)", "Value": unique_orders},
            {"Metric": "Unique machines (scheduled)", "Value": unique_machines},
            {"Metric": "Total real minutes", "Value": total_real_min},
            {"Metric": "Total industrial minutes", "Value": total_ind_min},
            {"Metric": "First start", "Value": first_start},
            {"Metric": "Last end", "Value": last_end},
            {"Metric": "Total delay in shift time (real)", "Value": real_gap_min},
            {
                "Metric": "Total delay in shift time (industrial)",
                "Value": ind_gap_min,
            },
            {"Metric": "% On time (Start <= LSD)", "Value": round(kpis.get("on_time", 0.0), 2)},
            {"Metric": "% Within 1 day grace", "Value": round(kpis.get("within_1d", 0.0), 2)},
            {"Metric": "% Within 2 days grace", "Value": round(kpis.get("within_2d", 0.0), 2)},
            {"Metric": "% Within 3 day grace", "Value": round(kpis.get("within_3d", 0.0), 2)},
            {"Metric": "% Within 4 day grace", "Value": round(kpis.get("within_4d", 0.0), 2)},
            {"Metric": "% Within 5 day grace", "Value": round(kpis.get("within_5d", 0.0), 2)},
            {"Metric": "% Within 6 day grace", "Value": round(kpis.get("within_6d", 0.0), 2)},
            {"Metric": "% Within 7 day grace", "Value": round(kpis.get("within_7d", 0.0), 2)},
            {
                "Metric": "% Beyond 7 days grace",
                "Value": round(kpis.get("beyond_7d", 0.0), 2),
            },
        ]
    )

    # Order-level KPIs (unchanged, just path-injected)
    try:
        orders_df = pd.read_csv(orders_csv)
        order_kpis = compute_order_delivery_kpis(orders_df)
    except Exception:
        order_kpis = {f"within_{d}d": 0.0 for d in range(0, 8)}
        order_kpis["beyond_7d"] = 0.0
        order_kpis["on_time"] = 0.0

    order_summary = pd.DataFrame(
        [
            {
                "Metric": "% Orders On time (Delivery <= SupposedDate)",
                "Value": round(order_kpis.get("on_time", 0.0), 2),
            },
            {
                "Metric": "% Orders Within 1 day grace",
                "Value": round(order_kpis.get("within_1d", 0.0), 2),
            },
            {
                "Metric": "% Orders Within 2 day grace",
                "Value": round(order_kpis.get("within_2d", 0.0), 2),
            },
            {
                "Metric": "% Orders Within 3 day grace",
                "Value": round(order_kpis.get("within_3d", 0.0), 2),
            },
            {
                "Metric": "% Orders Within 4 day grace",
                "Value": round(order_kpis.get("within_4d", 0.0), 2),
            },
            {
                "Metric": "% Orders Within 5 day grace",
                "Value": round(order_kpis.get("within_5d", 0.0), 2),
            },
            {
                "Metric": "% Orders Within 6 day grace",
                "Value": round(order_kpis.get("within_6d", 0.0), 2),
            },
            {
                "Metric": "% Orders Within 7 day grace",
                "Value": round(order_kpis.get("within_7d", 0.0), 2),
            },
            {
                "Metric": "% Orders Beyond 7 days grace",
                "Value": round(order_kpis.get("beyond_7d", 0.0), 2),
            },
        ]
    )

    summary = pd.concat([summary, order_summary], ignore_index=True)
    summary.to_csv(out_csv, index=False)
