from typing import Dict
import pandas as pd
from .config import SCHEDULE_RT, INDUSTRIAL_FACTOR, INCLUDE_NON_EFFECTIVE_IN_ONTIME, NOW
from .windows import build_windows

def compute_kpis_multi(plan_df: pd.DataFrame):
    res = {f"within_{d}d": 0.0 for d in range(0, 8)}
    res["beyond_7d"] = 0.0
    if plan_df.empty or "LatestStartDate" not in plan_df or "Start" not in plan_df:
        res["on_time"] = 0.0
        return res

    df = plan_df[plan_df["RecordType"].isin(SCHEDULE_RT)].copy()
    if df.empty:
        res["on_time"] = 0.0
        return res

    starts = df["Start"]
    deadlines = df["LatestStartDate"]

    eff_mask = deadlines.notna()
    noneff_mask = ~eff_mask

    if INCLUDE_NON_EFFECTIVE_IN_ONTIME:
        denom = int(len(df))  # include all rows
    else:
        denom = int(eff_mask.sum())

    if denom == 0:
        res["on_time"] = 0.0
        return res

    # Effective part: compare to LSD + d
    eff_starts = starts[eff_mask]
    eff_deadlines = deadlines[eff_mask]

    for d in range(0, 8):
        count_on_time = 0

        # Effective rows contribution
        if not eff_starts.empty:
            allowed = eff_deadlines + pd.to_timedelta(d, unit="D")
            count_on_time += int((eff_starts <= allowed).sum())

        # Non-effective rows contribution
        if INCLUDE_NON_EFFECTIVE_IN_ONTIME:
            count_on_time += int(noneff_mask.sum())  # always on-time

        pct = (count_on_time / denom) * 100.0
        key = "on_time" if d == 0 else f"within_{d}d"
        res[key] = pct

    # Beyond 7d: only effective rows can be late beyond 7d
    if not eff_starts.empty:
        allowed7 = eff_deadlines + pd.to_timedelta(7, unit="D")
        count_beyond = int((eff_starts > allowed7).sum())
    else:
        count_beyond = 0

    # Non-effective never contribute to beyond_7d
    res["beyond_7d"] = (count_beyond / denom) * 100.0
    return res

def add_idle_time_columns(plan_df, shifts, unlimited_set):
    """Compute IdleBeforeReal/IdleBefore per machine against shift capacity."""
    if plan_df.empty:
        plan_df["IdleBeforeReal"] = 0
        plan_df["IdleBefore"] = 0
        return plan_df

    windows_by_wp = {wp: g[["start","end"]].reset_index(drop=True) for wp, g in shifts.groupby("WorkPlaceNo")}

    def _cap_minutes(wins, t0, t1):
        if t1 <= t0 or wins is None or wins.empty:
            return 0
        total = 0
        for _, r in wins.iterrows():
            a, b = r["start"], r["end"]
            if b <= t0: continue
            if a >= t1: break
            lo, hi = max(a, t0), min(b, t1)
            if hi > lo:
                total += int((hi - lo).total_seconds() // 60)
        return total

    idle_real = []
    upper_unlim = {str(x).upper() for x in unlimited_set}
    for wp, grp in plan_df.groupby("WorkPlaceNo", sort=False):
        g = grp.sort_values("Start").copy()
        wins = windows_by_wp.get(str(wp))
        is_unlim = str(wp).upper() in upper_unlim
        prev_end = None
        for _, row in g.iterrows():
            if is_unlim:
                idle_real.append(0)
            else:
                if prev_end is None:
                    t0 = wins["start"].min() if wins is not None and not wins.empty else row["Start"]
                    idle_real.append(_cap_minutes(wins, t0, row["Start"]))
                else:
                    idle_real.append(_cap_minutes(wins, prev_end, row["Start"]))
            prev_end = row["End"]

    plan_df = plan_df.copy()
    plan_df["IdleBeforeReal"] = idle_real
    plan_df["IdleBefore"]     = (plan_df["IdleBeforeReal"] / INDUSTRIAL_FACTOR).round().astype("Int64")
    return plan_df

def _overlap_minutes(a0, a1, b0, b1):
    """Return minutes of overlap between [a0,a1] and [b0,b1]."""
    if pd.isna(a0) or pd.isna(a1) or pd.isna(b0) or pd.isna(b1):
        return 0
    s = max(a0, b0)
    e = min(a1, b1)
    if e <= s:
        return 0
    return int((e - s).total_seconds() // 60)

def sum_delay_in_shift_minutes(plan_df: pd.DataFrame, shifts_df: pd.DataFrame):
    """
    Sum over all machines:
      For each idle gap between consecutive planned ops on a machine,
      add only the part of the gap that lies within that machine's shift windows.

    Returns (real_minutes, industrial_minutes)
    """
    if plan_df.empty or shifts_df.empty:
        return 0, 0

    # Build shift windows per machine (same source used by scheduler)
    windows_by_wp, _, _ = build_windows(shifts_df)

    # Ensure plan sorted by machine/time
    df = plan_df.copy()
    df["WorkPlaceNo"] = df["WorkPlaceNo"].astype(str)
    df = df.sort_values(["WorkPlaceNo", "Start"], kind="mergesort")

    total_real = 0

    for wp, g in df.groupby("WorkPlaceNo", sort=False):
        g = g[["Start","End"]].sort_values("Start").reset_index(drop=True)
        if len(g) < 2:
            continue

        # Flatten windows for this machine
        w = windows_by_wp.get(wp)
        if w is None or w.empty:
            continue
        # Only need start/end columns
        w2 = w[["start","end"]].sort_values("start").reset_index(drop=True)

        # Iterate gaps
        for i in range(len(g)-1):
            gap_s = g.at[i, "End"]
            gap_e = g.at[i+1, "Start"]
            if pd.isna(gap_s) or pd.isna(gap_e) or gap_e <= gap_s:
                continue
            # Count only overlap with shift windows
            # For speed, walk windows that could intersect
            # (simple scan – data size is moderate)
            for j in range(len(w2)):
                ws = w2.at[j, "start"]; we = w2.at[j, "end"]
                if we <= gap_s:
                    continue
                if ws >= gap_e:
                    break
                total_real += _overlap_minutes(gap_s, gap_e, ws, we)

    total_ind = int(round(total_real / INDUSTRIAL_FACTOR))
    return total_real, total_ind

#KPI function
def compute_scheduler_kpis(plan_df: pd.DataFrame, jobs_df: pd.DataFrame) -> Dict[str, float]:
    """
    Returns dict for summary.txt: On-time (fixable), Late jobs completed, % saved
    """
    sched_jobs = jobs_df[jobs_df["RecordType"].isin(SCHEDULE_RT)].copy()
    if len(sched_jobs) == 0:
        return {"eligible_jobs": 0}

    total_sched = len(sched_jobs)

    # 2. Planned-late (LSD < NOW)
    planned_late = sched_jobs[sched_jobs["effective_deadline"] < NOW]
    n_planned_late = len(planned_late)

    # 3. Fixable (can still be on-time)
    fixable = sched_jobs[sched_jobs["effective_deadline"] >= NOW]
    n_fixable = len(fixable)

    # 4. On-time among fixable
    fixable_plan = plan_df[plan_df["job_id"].isin(fixable["job_id"])]
    on_time_fix = fixable_plan[
        fixable_plan["Start"] <= fixable_plan["LatestStartDate"]
        ]
    pct_fixable = len(on_time_fix) / n_fixable * 100 if n_fixable else 0
    pct_fixable = f"{pct_fixable:.2f}"

    # 5. Late jobs that got scheduled anyway
    late_plan = plan_df[plan_df["job_id"].isin(planned_late["job_id"])]
    pct_late_done = len(late_plan) / n_planned_late * 100 if n_planned_late else 0
    pct_late_done = f"{pct_late_done:.2f}"

    # 6. Overall saved (among real jobs)
    overall_saved = len(on_time_fix) / total_sched * 100

    return {
        "eligible_jobs": total_sched,
        "planned_late": n_planned_late,
        "planned_late_pct": n_planned_late / total_sched * 100,
        "fixable_jobs": n_fixable,
        "on_time_fixable": len(on_time_fix),
        "on_time_fixable_pct": pct_fixable,
        "late_completed": len(late_plan),
        "late_completed_pct": pct_late_done,
        "overall_saved_pct": overall_saved,
    }