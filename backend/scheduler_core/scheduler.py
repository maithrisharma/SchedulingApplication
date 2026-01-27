import heapq, math
import pandas as pd
from .config import (
    DEFAULT_WEIGHTS, GRACE_DAYS, INDUSTRIAL_FACTOR,
    SCHEDULE_RT
)
from .windows import build_windows
from collections import deque
import numpy as np


# helpers
def to_int(v, default=0):
    x = pd.to_numeric(v, errors="coerce")
    return int(default if pd.isna(x) else x)


def to_int_nonneg(v, default=0):
    x = to_int(v, default)
    return x if x >= 0 else 0


def minutes_between(a, b):
    try:
        if pd.isna(a) or pd.isna(b):
            return 0
        delta = b - a
        if delta == pd.NaT:
            return 0
        return int(delta.total_seconds() // 60)
    except:
        return 0


def has_effective_deadline(row) -> bool:
    ddl = row.get("effective_deadline")
    return isinstance(ddl, pd.Timestamp) and pd.notna(ddl) and ddl.year >= 2025


# scoring
def heap_key(row, earliest_ts, cont_same_machine, weights, now_ts):
    ddl = row.get("effective_deadline")
    has_ddl = 0 if (isinstance(ddl, pd.Timestamp) and pd.notna(ddl)) else 1
    ddl_minutes = max(0, minutes_between(now_ts, ddl)) if pd.notna(ddl) else 10_000_000

    grp = row['_pg']
    ost = row['_os']

    if ost == 5:
        lateness = 0
        duration_late = 0
        if pd.notna(ddl):
            ddl_minutes = 0  # treat as urgent

    dur = row['_dur']
    # Absolute OS5 priority ONLY for real (capacity-consuming) work
    if ost == 5 and dur > 0:
        return -1e12

    cont = 0 if cont_same_machine else 1

    pos = row['_pos']
    earliest_min = max(0, minutes_between(now_ts, earliest_ts))

    lateness = 0
    duration_late = 0
    spt_near = 0
    if pd.notna(ddl):
        late_min = minutes_between(ddl, earliest_ts)
        lateness = max(0, late_min)
        if lateness > 0:
            duration_late = dur
        if ddl_minutes <= 2 * 24 * 60:
            spt_near = dur

    f = {
        "w_has_ddl": has_ddl,
        "w_priority": grp,
        "w_orderstate": -ost * 100,
        "w_cont": cont,
        "w_ddl_minutes": ddl_minutes,
        "w_lateness": lateness,
        "w_duration_late": duration_late,
        "w_spt_near": spt_near,
        "w_earliest": earliest_min,
        "w_duration": dur,
        "w_orderpos": -pos,
    }
    return sum(weights.get(k, 0.0) * v for k, v in f.items())


def schedule(jobs, shifts, pred_sets, succ_multi, unlimited_set, outsourcing_set, weights, now_ts, cancel_check=None,
             locked_ops=None, freeze_until=None, freeze_pg2=False, pinned_starts=None):
    pinned_starts = pinned_starts or {}

    def _to_naive_utc(x):
        """
        Normalize any datetime-like to tz-naive Timestamp.
        - If input has timezone (e.g. '...Z'), convert to UTC and drop tz.
        - If input is naive already, keep as-is.
        """
        ts = pd.to_datetime(x, errors="coerce", utc=True)
        if pd.isna(ts):
            return ts
        return ts.tz_convert(None)

    pinned_starts = {str(k).strip(): _to_naive_utc(v) for k, v in pinned_starts.items()}

    windows_by_wp, earliest_global, first_by_wp = build_windows(shifts, now_ts)

    # FREEZE HORIZON ENFORCEMENT
    locked_df = None
    locked_ids = set()
    locked_plan_rows = []

    if locked_ops is not None and len(locked_ops) > 0:
        locked_df = locked_ops.copy()

        # Ensure columns exist (matches your plan.csv columns)
        needed = ["job_id", "WorkPlaceNo", "Start", "End"]
        if not all(c in locked_df.columns for c in needed):
            print(f"[FREEZE] locked_ops missing columns; skipping locks. Have={list(locked_df.columns)}")
            locked_df = None

    if locked_df is not None:
        locked_df["job_id"] = locked_df["job_id"].astype(str).str.strip()
        locked_df["WorkPlaceNo"] = locked_df["WorkPlaceNo"].astype(str).str.strip()
        locked_df["Start"] = pd.to_datetime(locked_df["Start"], errors="coerce")
        locked_df["End"] = pd.to_datetime(locked_df["End"], errors="coerce")

        if "Duration" in locked_df.columns:
            dur0 = pd.to_numeric(locked_df["Duration"], errors="coerce").fillna(0).astype(int).eq(0)
            m = dur0 & locked_df["Start"].notna() & locked_df["End"].isna()
            locked_df.loc[m, "End"] = locked_df.loc[m, "Start"]

            # If End missing but Start exists (even without Duration), assume instantaneous lock
        m2 = locked_df["Start"].notna() & locked_df["End"].isna()
        locked_df.loc[m2, "End"] = locked_df.loc[m2, "Start"]

        before = len(locked_df)

        bad_start = locked_df["Start"].isna().sum()
        bad_end = locked_df["End"].isna().sum()
        bad_order = (locked_df["End"] < locked_df["Start"]).sum()

        print(f"[FREEZE-DBG] locked_ops rows={before} bad_start={bad_start} bad_end={bad_end} end<start={bad_order}")

        locked_df = locked_df[
            locked_df["Start"].notna()
            & locked_df["End"].notna()
            & (locked_df["End"] >= locked_df["Start"])  # <-- allow 0 duration
            ].copy()

        locked_ids = set(locked_df["job_id"].tolist())
        print(f"[FREEZE] Applying locks: {len(locked_ids)} ops")

        def _is_locked(jid):
            return str(jid).strip() in locked_ids

        # Helper: subtract [a,b) from a machine's windows
        def _subtract_interval(wdf, a, b):
            # 0-duration locks should NOT eat capacity
            if pd.isna(a) or pd.isna(b) or b <= a:
                nd = wdf.copy()
                if "cursor" not in nd.columns:
                    nd["cursor"] = nd["start"]
                return nd
            out = []
            for _, rr in wdf.iterrows():
                s, e = rr["start"], rr["end"]
                if e <= a or s >= b:
                    out.append((s, e))
                    continue
                if s < a:
                    out.append((s, a))
                if b < e:
                    out.append((b, e))
            nd = pd.DataFrame(out, columns=["start", "end"])
            if nd.empty:
                return nd.assign(cursor=pd.NaT)
            nd["cursor"] = nd["start"]
            return nd[nd["end"] > nd["start"]].reset_index(drop=True)

        # Remove locked capacity from windows_by_wp BEFORE normalizing to wins
        for wp, g in locked_df.groupby("WorkPlaceNo", sort=False):
            wpU = str(wp).strip().upper()
            if wpU not in {str(k).strip().upper() for k in windows_by_wp.keys()}:
                # windows_by_wp keys might not be upper yet; we'll handle via wins below
                pass

        # We'll apply subtraction after wins is created (keys upper)

    # normalize window dict to UPPER keys to avoid mismatches
    wins = {str(wp).strip().upper(): df.copy() for wp, df in windows_by_wp.items()}
    for df in wins.values():
        if "cursor" not in df.columns:
            df["cursor"] = df["start"]  # safety

    # Apply locked intervals onto normalized windows (wins)
    if locked_df is not None and len(locked_df) > 0:
        locked_df_cap = locked_df
        if "PriorityGroup" in locked_df_cap.columns:
            allowed = [0, 1] + ([2] if freeze_pg2 else [])
            locked_df_cap = locked_df_cap[
                locked_df_cap["PriorityGroup"].apply(lambda x: to_int(x, 2)).isin(allowed)
            ]

        if len(locked_df_cap) > 0:
            for wp, g in locked_df_cap.groupby("WorkPlaceNo", sort=False):
                wpU = str(wp).strip().upper()
                if wpU not in wins:
                    continue
                wdf = wins[wpU]
                for _, rr in g.iterrows():
                    wdf = _subtract_interval(wdf, rr["Start"], rr["End"])
                wins[wpU] = wdf

    wp_ptr = {wp: 0 for wp in wins}
    if cancel_check and cancel_check():
        return None, None, None

    unlimited_upper = {str(x).strip().upper() for x in unlimited_set}
    outsourcing_upper = {str(x).strip().upper() for x in outsourcing_set}
    plan_rows = []
    end_times = {}
    placed = set()

    # jobs map
    jobdict = {str(r["job_id"]).strip(): r for _, r in jobs.iterrows()}

    print(f"Pre-normalizing {len(jobdict)} job fields...")
    for jid, r in jobdict.items():
        if cancel_check and cancel_check():
            return None, None, None
        r['_wpU'] = str(r.get("WorkPlaceNo", "")).strip().upper()
        r['_wp'] = str(r.get("WorkPlaceNo", "")).strip()
        r['_pg'] = to_int(r.get("PriorityGroup"), 2)
        r['_os'] = to_int(r.get("Orderstate"), 0)
        r['_dur'] = to_int_nonneg(r.get("duration_min"), 0)
        r['_buf'] = to_int_nonneg(r.get("buffer_min"), 0)
        r['_rec'] = to_int(r.get("RecordType"), 0)
        r['_pos'] = to_int(r.get("OrderPos"), 0)
    print("Pre-normalization complete")

    # indegree init
    indeg = {jid: len(pred_sets.get(jid, set())) for jid in jobdict.keys()}

    # Fast ready-deadline sets
    has_any_deadline = {}
    has_effective_pg01 = {}
    gap_eval_cache = {}
    rough_end_cache = {}
    # pred -> specific OS5 job remaining minutes (NOT wp)
    os5_remaining_minutes_job = {}  # (pred_jid, os5_jid) -> minutes or None
    rem_cache_job = {}  # (jid, os5_jid) -> minutes
    rem_visiting_job = set()  # (jid, os5_jid)
    dirty_publish_wps = set()
    # jobs that are indeg==0 but must wait until preds_resolved() before entering heap
    pending_ready = set()
    dirty_best_wps = set()
    os5_targets_by_wp = {}
    os5_pred_eta = {}  # wpU -> Timestamp
    ready_heap = []
    ready_by_wp = {wp: set() for wp in wins}
    cont_ready_by_wp = {wp: set() for wp in wins}
    os5_ready = set()
    os5_ready_by_wp = {wp: set() for wp in wins}

    best_wp_heap = []
    best_wp_gen = {wp: 0 for wp in wins}

    dead = set()
    OS5_UPSTREAM_BOOST = 5e11  # big, but still less than OS5 absolute priority (-1e12)
    # tiny upstream bonus (stronger but still small)
    UPSTREAM_EPS = 0.5
    # remember last placed per machine (for strict same-machine continuation)
    machine_last_job = {}  # wpU -> job_id
    ready_with_deadline = set()
    ready_with_effective_pg01 = set()
    # OS5 prediction system
    OS5_PICK_HORIZON = pd.Timedelta(hours=1)
    os5_lock_cache = {}
    OS5_LOCK_HORIZON = pd.Timedelta(days=1)
    os5_lock_until = {}
    os5_upstream_jobs = set()
    seeded_pred = set()

    LOOKAHEAD = 20
    GAP_TOL = pd.Timedelta(minutes=1)

    for jid, rr in jobdict.items():
        if cancel_check and cancel_check():
            return None, None, None
        if rr['_os'] == 5:
            if _is_locked(jid):  # ✅ NEW
                continue
            wpU = rr['_wpU']
            if wpU and wpU != "TBA":
                os5_targets_by_wp.setdefault(wpU, set()).add(jid)

    os5_eta_by_job = {}
    os5_pred_to_jobs = {}

    for jid, r in jobdict.items():
        if cancel_check and cancel_check():
            return None, None, None
        ddl = r.get("effective_deadline")
        has_any_deadline[jid] = pd.notna(ddl)
        has_effective_pg01[jid] = (r['_pg'] in (0, 1) and has_effective_deadline(r))

    def _is_outs_milestone(row) -> bool:
        wpU = row['_wpU']
        return (wpU in outsourcing_upper) and (row['_os'] > 3)

    def _has_real_pred(jid) -> bool:
        """Any predecessor that consumes capacity (PG in {0,1}) and is known in jobdict."""
        preds = pred_sets.get(jid, set())
        for p in preds:
            prow = jobdict.get(p)
            if prow is None:
                continue
            if prow['_pg'] in (0, 1):
                return True
        return False

    def _apply_freeze_shift(row, est):
        """Shift op's earliest start to freeze_until if needed."""
        if freeze_until is None or pd.isna(est):
            return est

        pg = row['_pg']

        if pg in (0, 1) and est < freeze_until:
            return freeze_until

        if pg == 2 and freeze_pg2 and est < freeze_until:
            return freeze_until

        return est

    def _refresh_ready_sets_for(jid):
        if jid in placed or indeg.get(jid, 0) != 0:
            return
        if has_any_deadline.get(jid, False):
            ready_with_deadline.add(jid)
        if has_effective_pg01.get(jid, False):
            ready_with_effective_pg01.add(jid)

    def _remove_from_ready_sets(jid):
        ready_with_deadline.discard(jid)
        ready_with_effective_pg01.discard(jid)

    def has_pending_deadline_ops():
        return bool(ready_with_deadline)

    def any_effective_remaining_pg01():
        return bool(ready_with_effective_pg01)

    def _collect_all_upstream(start_jid):
        seen = set()
        stack = [start_jid]
        while stack:
            if cancel_check and cancel_check():
                return seen
            cur = stack.pop()
            for p in pred_sets.get(cur, set()):
                if p not in seen:
                    seen.add(p)
                    stack.append(p)
        return seen

    def preview_end_in_windows_pg01(wdf, idx0, est, dur_min):
        """Non-mutating end-time preview for PG0/1 op."""
        if wdf is None or wdf.empty:
            return pd.NaT
        if dur_min <= 0:
            return est

        n = len(wdf)
        idx = idx0
        while idx < n and not (wdf.at[idx, "end"] > est):
            idx += 1
        if idx >= n:
            return pd.NaT

        remain = int(dur_min)
        curr = est

        while idx < n and remain > 0:
            ws, we = wdf.at[idx, "start"], wdf.at[idx, "end"]
            cur = wdf.at[idx, "cursor"]
            s = max(ws, cur, curr)
            if s >= we:
                idx += 1
                continue
            free = minutes_between(s, we)
            if free <= 0:
                idx += 1
                continue
            take = min(remain, free)
            e = s + pd.Timedelta(minutes=take)
            remain -= take
            curr = e
            if remain > 0 and e >= we:
                idx += 1

        if remain > 0:
            return pd.NaT
        return curr

    def _rough_end_for_prediction(jid, row, est):
        wpU = row['_wpU']
        wdf = wins.get(wpU)
        if wdf is None or wdf.empty:
            return est

        idx0 = wp_ptr.get(wpU, 0)
        if idx0 >= len(wdf):
            return est

        dur = row['_dur']
        if dur <= 0:
            return est

        cursor0 = wdf.at[idx0, "cursor"]
        ck = (wpU, idx0, cursor0, est, dur)
        hit = rough_end_cache.get(ck)
        if hit is not None:
            return hit

        end_pred = preview_end_in_windows_pg01(wdf, idx0, est, dur)
        if pd.isna(end_pred):
            end_pred = est + pd.Timedelta(minutes=dur)

        rough_end_cache[ck] = end_pred
        return end_pred

    def earliest_start_for(jid, row):
        if cancel_check and cancel_check():
            return now_ts

        wp = str(row.get("WorkPlaceNo")).strip()
        wpU = wp.upper()

        preds = pred_sets.get(jid, set())
        ready_times = []
        for p in preds:
            if p in end_times:
                prow = jobdict.get(p, {})
                if str(prow.get("WorkPlaceNo", "")).strip().upper() == wpU:
                    ready_times.append(end_times[p])
                else:
                    buf = int(pd.to_numeric(prow.get("buffer_min", 0), errors="coerce") or 0)
                    et = pd.to_datetime(end_times.get(p), errors="coerce")
                    if pd.notna(et):
                        ready_times.append(et + pd.Timedelta(minutes=buf))

        if _is_outs_milestone(row):
            ev = pd.to_datetime(row.get("DateStart"), errors="coerce")
            if pd.notna(ev) and ev > now_ts:
                est = ev
            else:
                if _has_real_pred(jid) and ready_times:
                    est = max(ready_times)
                else:
                    est = now_ts
            est = _apply_freeze_shift(row, est)
            return est

        candidates = [now_ts, earliest_global]
        if ready_times:
            candidates.append(max(ready_times))

        first_wp = first_by_wp.get(wpU, pd.NaT)
        if pd.notna(first_wp):
            candidates.append(first_wp)

        if wpU in outsourcing_upper:
            ev_gate = row.get("DateStart")
            os = row['_os']
            if pd.notna(ev_gate) and os > 3:
                candidates.append(ev_gate)

        est = max(candidates)
        est = _apply_freeze_shift(row, est)
        # ✅ STEP 2a: interactive pin (user move)
        pin = pinned_starts.get(str(jid).strip())
        if pd.notna(pin):
            est = max(est, pin)

        return est

    def fits_before_os5_lock(wpU, st_feas, dur_min):
        lock_until = os5_lock_until.get(wpU, pd.NaT)
        if pd.isna(lock_until):
            lock_until = os5_barrier_for_wp(wpU)

        if pd.isna(lock_until):
            return True

        wdf = wins.get(wpU)
        if wdf is None or wdf.empty:
            return True

        idx0 = wp_ptr.get(wpU, 0)
        t0 = max(now_ts, wdf.at[idx0, "cursor"])

        if lock_until <= t0:
            return dur_min == 0 and st_feas <= t0

        if dur_min <= 0:
            return st_feas <= lock_until

        end_if_run = preview_end_in_windows_pg01(wdf, idx0, st_feas, dur_min)
        if pd.isna(end_if_run):
            return True
        return end_if_run <= lock_until

    def update_os5_lock_for_wp(wpU):
        eta = os5_pred_eta.get(wpU, pd.NaT)

        if pd.isna(eta):
            os5_lock_until.pop(wpU, None)
            os5_lock_cache.pop(wpU, None)
            return

        wdf = wins.get(wpU)
        if wdf is None or wdf.empty:
            return

        idx0 = wp_ptr.get(wpU, 0)
        t0 = max(now_ts, wdf.at[idx0, "cursor"])

        if eta <= t0:
            os5_lock_until.pop(wpU, None)
            os5_lock_cache.pop(wpU, None)

            if os5_targets_by_wp.get(wpU):
                os5_pred_eta[wpU] = t0
            else:
                os5_pred_eta.pop(wpU, None)
            return

        if eta > (t0 + OS5_LOCK_HORIZON):
            os5_lock_until.pop(wpU, None)
            return

        c = os5_lock_cache.get(wpU)
        if c is not None:
            c_idx0, c_t0, c_eta, c_lock = c
            if c_idx0 == idx0 and c_t0 == t0 and c_eta == eta:
                if pd.notna(c_lock):
                    os5_lock_until[wpU] = c_lock
                return

        lock_feas = first_feasible_start_pg01(wdf, idx0, eta)
        os5_lock_cache[wpU] = (idx0, t0, eta, lock_feas)

        if pd.isna(lock_feas):
            return

        prev = os5_lock_until.get(wpU, pd.NaT)
        if pd.isna(prev) or lock_feas < prev:
            os5_lock_until[wpU] = lock_feas

    def os5_barrier_for_wp(wpU):
        """FEASIBLE boundary time for upcoming OS5 on wpU."""
        eta = os5_pred_eta.get(wpU, pd.NaT)
        if pd.isna(eta):
            return pd.NaT

        wdf = wins.get(wpU)
        if wdf is None or wdf.empty:
            return pd.NaT

        idx0 = wp_ptr.get(wpU, 0)
        t0 = max(now_ts, wdf.at[idx0, "cursor"])

        c = os5_lock_cache.get(wpU)
        if c is not None:
            c_idx0, c_t0, c_eta, c_bar = c
            if c_idx0 == idx0 and c_t0 == t0 and c_eta == eta:
                return c_bar

        bar = first_feasible_start_pg01(wdf, idx0, eta)
        os5_lock_cache[wpU] = (idx0, t0, eta, bar)
        return bar

    for os5_jid, r in jobdict.items():
        if cancel_check and cancel_check():
            return None, None, None
        if r['_os'] != 5:
            continue
        if _is_locked(os5_jid):  # ✅ NEW
            continue

        wp_os5 = r['_wpU']
        if not wp_os5 or wp_os5 == "TBA":
            continue

        upstream = _collect_all_upstream(os5_jid)
        os5_upstream_jobs |= upstream

        for p in upstream:
            os5_pred_to_jobs.setdefault(p, set()).add(os5_jid)

    def recompute_wp_os5_eta(wpU):
        tgts = os5_targets_by_wp.get(wpU)
        if not tgts:
            os5_pred_eta.pop(wpU, None)
            os5_lock_until.pop(wpU, None)
            os5_lock_cache.pop(wpU, None)
            return

        best = pd.NaT
        for j in tgts:
            if j in placed:
                continue

            rowj = jobdict.get(j)
            if rowj is None:
                continue

            base = earliest_start_for(j, rowj)
            eta = os5_eta_by_job.get(j, pd.NaT)
            eta = base if pd.isna(eta) else max(eta, base)

            os5_eta_by_job[j] = eta

            if pd.isna(best) or eta < best:
                best = eta

        if pd.isna(best):
            os5_pred_eta.pop(wpU, None)
        else:
            os5_pred_eta[wpU] = best

    def os5_eta_for_wp(wpU):
        eta = os5_pred_eta.get(wpU, pd.NaT)
        if pd.notna(eta):
            return eta

        lu = os5_lock_until.get(wpU, pd.NaT)
        if pd.notna(lu):
            return lu

        return pd.NaT

    os5_all_preds_by_wp = {}
    for os5_jid, rr in jobdict.items():
        if cancel_check and cancel_check():
            return None, None, None
        if rr['_os'] == 5:
            if _is_locked(os5_jid):  # ✅ NEW
                continue
            wpU = rr['_wpU']
            if wpU and wpU != "TBA":
                upstream = _collect_all_upstream(os5_jid)
                os5_all_preds_by_wp.setdefault(wpU, set()).update(upstream)

    os5_reachers_by_wp = {wpU: set(tgts) for wpU, tgts in os5_targets_by_wp.items()}
    for wpU in os5_all_preds_by_wp:
        os5_reachers_by_wp.setdefault(wpU, set()).update(os5_all_preds_by_wp[wpU])

    rem_cache = {}
    rem_visiting = set()

    upstream_of_os5 = {}
    for os5_jid, r in jobdict.items():
        if cancel_check and cancel_check():
            return None, None, None
        if r['_os'] != 5:
            continue
        if _is_locked(os5_jid):  # ✅ NEW
            continue
        upstream_of_os5[os5_jid] = _collect_all_upstream(os5_jid)

    def rem_to_os5_job(jid, os5_jid):
        key = (jid, os5_jid)
        if key in rem_cache_job:
            return rem_cache_job[key]
        if key in rem_visiting_job:
            return None
        if jid == os5_jid:
            rem_cache_job[key] = 0
            return 0

        rem_visiting_job.add(key)
        ups = upstream_of_os5.get(os5_jid, set())

        best = None
        for s in succ_multi.get(jid, ()):
            if s != os5_jid and s not in ups:
                continue

            buf = to_int_nonneg(jobdict.get(jid, {}).get("buffer_min"), 0)

            if s == os5_jid:
                step = buf
            else:
                dur = to_int_nonneg(jobdict.get(s, {}).get("duration_min"), 0)
                step = buf + dur

            r = rem_to_os5_job(s, os5_jid)
            if r is None:
                continue

            cand = step + r
            if best is None or cand > best:
                best = cand

        rem_visiting_job.discard(key)
        rem_cache_job[key] = best
        return best



    def _precompute_os5_remaining_job():
        for pred_jid, os5_jobs in os5_pred_to_jobs.items():
            if cancel_check and cancel_check():
                return
            for os5_jid in os5_jobs:
                os5_remaining_minutes_job[(pred_jid, os5_jid)] = rem_to_os5_job(pred_jid, os5_jid)

    _precompute_os5_remaining_job()

    # ================= EARLY OS5 PREDICTION SEEDING =================
    print("Seeding early OS5 predictions...")

    # Seed base ETA for every OS5 job first
    for wpU, tgts in os5_targets_by_wp.items():
        if cancel_check and cancel_check():
            return None, None, None
        for os5_jid in tgts:
            row_os5 = jobdict[os5_jid]
            os5_eta_by_job[os5_jid] = earliest_start_for(os5_jid, row_os5)
        recompute_wp_os5_eta(wpU)

    # Then seed predictions from ready upstream jobs
    for upstream_jid in os5_pred_to_jobs.keys():
        if cancel_check and cancel_check():
            return None, None, None
        if indeg.get(upstream_jid, 0) != 0:
            continue

        row_up = jobdict.get(upstream_jid)
        if row_up is None:
            continue

        est0 = earliest_start_for(upstream_jid, row_up)
        end0 = _rough_end_for_prediction(upstream_jid, row_up, est0)

        for os5_jid in os5_pred_to_jobs.get(upstream_jid, ()):
            rem = os5_remaining_minutes_job.get((upstream_jid, os5_jid))
            if rem is None:
                continue

            cand = end0 + pd.Timedelta(minutes=int(rem))
            prevj = os5_eta_by_job.get(os5_jid, pd.NaT)

            if pd.isna(prevj) or cand > prevj:
                os5_eta_by_job[os5_jid] = cand

                wpU = str(jobdict[os5_jid].get("WorkPlaceNo", "")).strip().upper()
                if wpU and wpU != "TBA":
                    recompute_wp_os5_eta(wpU)
                    dirty_best_wps.add(wpU)

    print(f"Seeded {len(os5_eta_by_job)} OS5 jobs")

    # ===============================================================

    def is_upstream_pending(jid):
        succs = succ_multi.get(jid, set())
        return any(s not in placed for s in succs)

    def is_continuation(jid, row):
        preds = pred_sets.get(jid, set())
        for p in preds:
            if p in end_times:
                prow = jobdict.get(p)
                if prow is not None:
                    if str(prow.get("WorkPlaceNo", "")).strip().upper() == str(
                            row.get("WorkPlaceNo", "")).strip().upper():
                        return True
        return False

    def has_direct_continuation(jid, row):
        wpU = row['_wpU']
        last = machine_last_job.get(wpU)
        if not last:
            return False
        preds = pred_sets.get(jid, set())
        return last in preds

    def is_pg2_row(row) -> bool:
        return row['_pg'] == 2

    def preds_resolved(jid) -> bool:
        for p in pred_sets.get(jid, set()):
            if p not in end_times:
                return False
        return True

    def _first_feasible_start_cached(wpU, jid, row, est):
        wdf = wins.get(wpU)
        if wdf is None or wdf.empty:
            return pd.NaT
        idx0 = wp_ptr.get(wpU, 0)
        return first_feasible_start_pg01(wdf, idx0, est)

    def _best_gapfill_for_wp(wpU):
        best = None
        wdf = wins.get(wpU)
        if wdf is None or wdf.empty:
            return None

        s = ready_by_wp.get(wpU)
        if not s:
            return None

        idx0 = wp_ptr.get(wpU, 0)
        if idx0 >= len(wdf):
            return None
        cursor0 = wdf.at[idx0, "cursor"]

        to_remove = []
        for jid in s:
            if cancel_check and cancel_check():
                return None

            if jid in placed or jid in dead:
                to_remove.append(jid)
                continue

            row = jobdict.get(jid)
            if row is None:
                to_remove.append(jid)
                continue

            if is_pg2_row(row) and not _is_outs_milestone(row):
                to_remove.append(jid)
                continue

            grp = row['_pg']
            ddl_try = row.get("effective_deadline")

            if grp in (0, 1) and pd.isna(ddl_try) and has_pending_deadline_ops():
                continue

            ck = (wpU, jid, idx0, cursor0)
            cached = gap_eval_cache.get(ck)

            if cached is None:
                est = earliest_start_for(jid, row)
                dur0 = row['_dur']

                if dur0 == 0:
                    st_feas = preview_zero_duration_time(wdf, idx0, est)
                else:
                    st_feas = first_feasible_start_pg01(wdf, idx0, est)

                if pd.isna(st_feas):
                    gap_eval_cache[ck] = (pd.NaT, 1, float("inf"), dur0, row['_os'])
                    continue

                sc = heap_key(row, est, is_continuation(jid, row), weights, now_ts)
                if is_upstream_pending(jid):
                    sc -= UPSTREAM_EPS
                if jid in os5_upstream_jobs:
                    sc = min(sc, -9e11)

                dur_flag = 0 if dur0 == 0 else 1
                ost0 = row['_os']

                gap_eval_cache[ck] = (st_feas, dur_flag, sc, dur0, ost0)

            else:
                st_feas, dur_flag, sc, dur0, ost0 = cached
                if pd.isna(st_feas):
                    continue

            if ost0 != 5 and not _is_outs_milestone(row):
                if not fits_before_os5_lock(wpU, st_feas, dur0):
                    continue

            key = (st_feas, dur_flag, sc, jid)
            if (best is None) or (key < best):
                best = key

        for jid in to_remove:
            s.discard(jid)

        return best

    def _publish_best_for_wp(wpU):
        best_wp_gen[wpU] = best_wp_gen.get(wpU, 0) + 1
        gen = best_wp_gen[wpU]

        best = _best_gapfill_for_wp(wpU)
        if best is None:
            return
        st_feas, dur_flag, sc, jid = best
        heapq.heappush(best_wp_heap, (st_feas, dur_flag, sc, jid, wpU, gen))

    def update_predictive_os5_lock_from_upstream(picked_jid, picked_end):
        if pd.isna(picked_end):
            return

        for os5_jid in os5_pred_to_jobs.get(picked_jid, ()):
            if _is_locked(os5_jid):  # ✅ NEW (critical)
                continue
            if os5_jid in placed:
                continue

            rem = os5_remaining_minutes_job.get((picked_jid, os5_jid))
            if rem is None:
                continue

            cand = picked_end + pd.Timedelta(minutes=int(rem))

            prevj = os5_eta_by_job.get(os5_jid, pd.NaT)
            if pd.isna(prevj) or cand > prevj:
                os5_eta_by_job[os5_jid] = cand

                wpU = str(jobdict[os5_jid].get("WorkPlaceNo", "")).strip().upper()
                recompute_wp_os5_eta(wpU)
                dirty_best_wps.add(wpU)

    def _best_zero_duration_global():
        best = None
        for wpU in wins.keys():
            if cancel_check and cancel_check():
                return None

            wdf = wins.get(wpU)
            if wdf is None or wdf.empty:
                continue
            idx0 = wp_ptr.get(wpU, 0)

            s = ready_by_wp.get(wpU)
            if not s:
                continue

            to_remove = []
            for jid in s:
                if jid in placed or jid in dead:
                    to_remove.append(jid)
                    continue
                row = jobdict.get(jid)
                if row is None:
                    to_remove.append(jid)
                    continue

                if row['_dur'] != 0:
                    continue

                est = earliest_start_for(jid, row)
                st_feas = preview_zero_duration_time(wdf, idx0, est)
                if pd.isna(st_feas):
                    continue

                pos = row['_pos']
                sc = heap_key(row, est, is_continuation(jid, row), weights, now_ts)
                key = (st_feas, -pos, sc, jid)

                if (best is None) or (key < best):
                    best = key

            for jid in to_remove:
                s.discard(jid)

        return best

    def push_if_ready(jid):
        if jid in placed or jid in dead:
            return
        if indeg.get(jid, 0) != 0:
            return
        if not preds_resolved(jid):
            pending_ready.add(jid)
            return

        row = jobdict[jid]
        is_pg2 = is_pg2_row(row)

        wpU = row['_wpU']
        if not wpU or wpU == "TBA":
            return

        os = row['_os']

        if os == 5:
            eta0 = earliest_start_for(jid, row)

            prevj = os5_eta_by_job.get(jid, pd.NaT)
            if pd.isna(prevj) or eta0 > prevj:
                os5_eta_by_job[jid] = eta0

                recompute_wp_os5_eta(wpU)
                dirty_best_wps.add(wpU)

        if jid in os5_pred_to_jobs:
            for os5_jid in os5_pred_to_jobs.get(jid, ()):
                key = (jid, os5_jid)
                if key in seeded_pred:
                    continue
                seeded_pred.add(key)

                est0 = earliest_start_for(jid, row)
                end0 = _rough_end_for_prediction(jid, row, est0)
                update_predictive_os5_lock_from_upstream(jid, end0)

        if is_pg2 and not _is_outs_milestone(row):
            return

        if os == 5:
            os5_ready.add(jid)
            os5_ready_by_wp.setdefault(wpU, set()).add(jid)

        if has_direct_continuation(jid, row):
            cont_ready_by_wp.setdefault(wpU, set()).add(jid)

        ready_by_wp.setdefault(wpU, set()).add(jid)
        dirty_publish_wps.add(wpU)

    def flush_pending_ready():
        for jid in list(pending_ready):
            if cancel_check and cancel_check():
                return
            if jid in placed or indeg.get(jid, 0) != 0:
                pending_ready.discard(jid)
                continue
            if preds_resolved(jid):
                pending_ready.discard(jid)
                push_if_ready(jid)

    def flush_dirty_publish():
        if not dirty_publish_wps:
            return
        for wpU in list(dirty_publish_wps):
            if cancel_check and cancel_check():
                return
            _publish_best_for_wp(wpU)
        dirty_publish_wps.clear()

    def release_successors_after_place(jid):
        for succ in succ_multi.get(jid, set()):
            if cancel_check and cancel_check():
                return
            if succ in placed:
                continue

            indeg[succ] = max(0, indeg.get(succ, 0) - 1)

            if indeg[succ] == 0:
                _refresh_ready_sets_for(succ)
                push_if_ready(succ)

    def place_pg2_unlimited_in_windows(wdf, earliest, dur_min):
        if wdf is None or wdf.empty:
            return (pd.NaT, pd.NaT)

        earliest = pd.to_datetime(earliest, errors="coerce")
        if pd.isna(earliest):
            return (pd.NaT, pd.NaT)

        n = len(wdf)
        j = 0
        while j < n and not (wdf.at[j, "end"] > earliest):
            j += 1
        if j >= n:
            return (pd.NaT, pd.NaT)

        ws, we = wdf.at[j, "start"], wdf.at[j, "end"]
        start0 = max(earliest, ws)
        if start0 >= we:
            return (pd.NaT, pd.NaT)

        if dur_min <= 0:
            return (start0, start0)

        remain = int(dur_min)
        curr = start0
        start = start0
        end = start0

        while j < n and remain > 0:
            ws, we = wdf.at[j, "start"], wdf.at[j, "end"]
            s = max(ws, curr)
            if s < we:
                free = minutes_between(s, we)
                if free > 0:
                    take = min(remain, free)
                    e = s + pd.Timedelta(minutes=take)
                    end = e
                    remain -= take
                    curr = e

            if remain > 0:
                j += 1
                if j < n:
                    curr = max(curr, wdf.at[j, "start"])

        if remain > 0:
            return (pd.NaT, pd.NaT)

        return (start, end)

    def sched_minutes_for_shifts(row) -> int:
        dur_real = row['_dur']
        wpU = row['_wpU']
        os = row['_os']

        if wpU == "AP0031" and os <= 3:
            return int(math.ceil(dur_real / INDUSTRIAL_FACTOR))
        return dur_real

    def resolve_pg2_one(jid) -> bool:
        if jid in placed:
            return True

        row = jobdict.get(jid)
        if row is None or not is_pg2_row(row):
            return False

        if not preds_resolved(jid):
            return False

        wpU = row['_wpU']
        est = earliest_start_for(jid, row)

        if _is_outs_milestone(row):
            st, en = est, est
        else:
            dur_real = row['_dur']
            dur_sched = sched_minutes_for_shifts(row)

            wdf = wins.get(wpU)
            st, en = place_pg2_unlimited_in_windows(wdf, est, dur_sched)

            if pd.isna(st) or pd.isna(en):
                return False

        ddl = row.get("effective_deadline")
        ddl = ddl if pd.notna(ddl) else pd.NaT
        starts_before_lsd = pd.NA
        within_grace = pd.NA
        if pd.notna(ddl):
            starts_before_lsd = bool(st <= ddl)
            within_grace = bool(st <= (ddl + pd.Timedelta(days=GRACE_DAYS)))

        is_outs = (wpU in outsourcing_upper)
        out_delivery = row.get("DateStart") if (
                is_outs and row['_os'] > 3 and pd.notna(row.get("DateStart"))
        ) else pd.NaT
        buf_real = row['_buf']
        buf_ind = int(round(buf_real / INDUSTRIAL_FACTOR))

        plan_rows.append({
            "job_id": jid, "OrderNo": row.get("OrderNo"), "OrderPos": row.get("OrderPos"),
            "Orderstate": row['_os'],
            "ItemNo": row.get("ItemNo"), "SortPos": row.get("SortPos"),
            "WorkPlaceNo": str(row.get("WorkPlaceNo", "")).strip(),
            "Start": st, "End": en,
            "Duration": to_int_nonneg(row.get("duration_min"), 0),
            "LatestStartDate": ddl,
            "StartsBeforeLSD": starts_before_lsd, "WithinGraceDays": within_grace,
            "PriorityGroup": 2,
            "IsUnlimitedMachine": True,
            "IsOutsourcing": is_outs, "OutsourcingDelivery": out_delivery,
            "BufferIndustrial": buf_ind, "BufferReal": buf_real,
            "ReasonSelected": "PG2 resolved (shift-bound, no capacity)",
            "DurationReal": to_int_nonneg(row.get("duration_min"), 0),
            "RecordType": to_int(row.get("RecordType"), 0)
        })

        placed.add(jid)
        _remove_from_ready_sets(jid)

        end_times[jid] = en
        update_predictive_os5_lock_from_upstream(jid, en)

        release_successors_after_place(jid)

        return True

    def auto_resolve_pg2_closure(seed_jid):
        q = deque([seed_jid])
        while q:
            if cancel_check and cancel_check():
                return
            x = q.popleft()
            for s in succ_multi.get(x, set()):
                if s in placed:
                    continue
                row = jobdict.get(s)
                if row is None:
                    continue
                if not is_pg2_row(row):
                    continue

                if not preds_resolved(s):
                    continue

                if resolve_pg2_one(s):
                    q.append(s)

    def _has_immediate_same_machine_successor(jid, row):
        wpU = row['_wpU']
        for s in succ_multi.get(jid, set()):
            srow = jobdict.get(s)
            if srow is None:
                continue
            if str(srow.get("WorkPlaceNo", "")).strip().upper() != wpU:
                continue
            preds = pred_sets.get(s, set())
            others = preds - {jid}
            if all((p in placed) for p in others):
                return True
        return False

    def first_feasible_start_pg01(wdf, idx0, est):
        if wdf is None or wdf.empty:
            return pd.NaT
        n = len(wdf)
        for j in range(idx0, n):
            cur = wdf.at[j, "cursor"]
            ws = wdf.at[j, "start"]
            we = wdf.at[j, "end"]
            st = max(ws, cur, est)
            if st + GAP_TOL <= we:
                return st
        return pd.NaT

    def _feasible_now(jid, est=None):
        row = jobdict[jid]
        wpU = row['_wpU']
        wdf = wins.get(wpU)
        if wdf is None or wdf.empty:
            return False
        idx = wp_ptr.get(wpU, 0)
        if est is None:
            est = earliest_start_for(jid, row)

        pg = row['_pg']

        if pg == 2:
            for j in range(len(wdf)):
                if est < wdf.at[j, "end"]:
                    return True
            return False

        for j in range(idx, len(wdf)):
            cursor = wdf.at[j, "cursor"]
            win_end = wdf.at[j, "end"]
            if max(cursor, est) + GAP_TOL <= win_end:
                return True
        return False

    def feasible_zero_duration(wdf, idx0, est):
        if wdf is None or wdf.empty:
            return False
        for j in range(idx0, len(wdf)):
            if est <= wdf.at[j, "end"]:
                return True
        return False

    def place_zero_duration_on_wp(wdf, idx0, est):
        if wdf is None or wdf.empty:
            return pd.NaT
        for j in range(idx0, len(wdf)):
            ws, we = wdf.at[j, "start"], wdf.at[j, "end"]
            cur = wdf.at[j, "cursor"]
            t = max(est, ws, cur)
            if t <= we:
                if t > cur:
                    wdf.at[j, "cursor"] = t
                return t
        return pd.NaT

    def preview_zero_duration_time(wdf, idx0, est):
        if wdf is None or wdf.empty:
            return pd.NaT
        for j in range(idx0, len(wdf)):
            ws, we = wdf.at[j, "start"], wdf.at[j, "end"]
            cur = wdf.at[j, "cursor"]
            t = max(est, ws, cur)
            if t <= we:
                return t
        return pd.NaT

    # Pre-place locked ops
    if locked_df is not None and len(locked_df) > 0:
        # Add locked ops into plan_rows in the same schema you output later
        for _, rr in locked_df.iterrows():
            jid = str(rr["job_id"]).strip()
            wp = str(rr["WorkPlaceNo"]).strip()
            wpU = wp.upper()
            st = pd.to_datetime(rr["Start"], errors="coerce")
            en = pd.to_datetime(rr["End"], errors="coerce")

            # ---- DEBUG: why a lock might be skipped ----
            if jid not in jobdict:
                print(f"[FREEZE-DBG] lock jid not in jobs -> skipping: {jid}")
                continue

            if not wp or wpU == "TBA":
                print(f"[FREEZE-DBG] lock has bad wp -> skipping: jid={jid} wp={wp}")
                continue

            if pd.isna(st) or pd.isna(en):
                print(f"[FREEZE-DBG] lock has NaT times -> skipping: jid={jid} st={st} en={en}")
                continue

            if en < st:
                print(f"[FREEZE-DBG] lock end<start -> skipping: jid={jid} st={st} en={en}")
                continue
            # -------------------------------------------

            plan_rows.append({
                "job_id": jid,
                "OrderNo": rr.get("OrderNo"),
                "OrderPos": rr.get("OrderPos"),
                "Orderstate": to_int(rr.get("Orderstate"), 0),
                "ItemNo": rr.get("ItemNo"),
                "SortPos": rr.get("SortPos"),
                "WorkPlaceNo": wp,
                "Start": st,
                "End": en,
                "Duration": to_int_nonneg(rr.get("Duration", rr.get("DurationReal", 0)), 0),
                "LatestStartDate": pd.to_datetime(rr.get("LatestStartDate", rr.get("effective_deadline")),
                                                  errors="coerce"),
                "StartsBeforeLSD": rr.get("StartsBeforeLSD", pd.NA),
                "WithinGraceDays": rr.get("WithinGraceDays", pd.NA),
                "PriorityGroup": to_int(rr.get("PriorityGroup"), 2),
                "IsUnlimitedMachine": bool(rr.get("IsUnlimitedMachine", False)),
                "IsOutsourcing": bool(rr.get("IsOutsourcing", False)),
                "OutsourcingDelivery": rr.get("OutsourcingDelivery", pd.NaT),
                "BufferIndustrial": rr.get("BufferIndustrial", 0),
                "BufferReal": rr.get("BufferReal", 0),
                "ReasonSelected": rr.get("ReasonSelected", "FROZEN"),
                "DurationReal": rr.get("DurationReal", to_int_nonneg(rr.get("Duration", 0), 0)),
                "RecordType": to_int(rr.get("RecordType"), 0),
            })

            placed.add(jid)
            end_times[jid] = en
            machine_last_job[wpU] = jid

    if placed:
        for jid in placed:
            for succ in succ_multi.get(jid, set()):
                indeg[succ] = max(0, indeg.get(succ, 0) - 1)

    # seed heap with indegree==0
    for jid, deg in indeg.items():
        if cancel_check and cancel_check():
            return None, None, None

        if deg != 0:
            continue
        if jid in placed:
            continue

        _refresh_ready_sets_for(jid)

        row0 = jobdict[jid]

        if to_int(row0.get("PriorityGroup"), 2) == 2:
            if preds_resolved(jid):
                resolve_pg2_one(jid)
                auto_resolve_pg2_closure(jid)
                flush_pending_ready()
            else:
                pending_ready.add(jid)
            continue

        if not preds_resolved(jid):
            pending_ready.add(jid)
            continue

        push_if_ready(jid)

    flush_pending_ready()
    if dirty_best_wps:
        for wpx in list(dirty_best_wps):
            if cancel_check and cancel_check():
                return None, None, None
            update_os5_lock_for_wp(wpx)
            dirty_publish_wps.add(wpx)
        dirty_best_wps.clear()
    flush_dirty_publish()

    # Main scheduling loop
    while True:
        if cancel_check and cancel_check():
            return None, None, None

        picked = None
        pick_reason = None

        if dirty_best_wps:
            for wpx in list(dirty_best_wps):
                if cancel_check and cancel_check():
                    return None, None, None
                update_os5_lock_for_wp(wpx)
                dirty_publish_wps.add(wpx)
            dirty_best_wps.clear()

        # (0) outsourcing milestones
        best_outs = None
        for wpU in outsourcing_upper:
            if cancel_check and cancel_check():
                return None, None, None

            s = ready_by_wp.get(wpU)
            if not s:
                continue
            to_remove = []
            for jid in s:
                if jid in placed or jid in dead:
                    to_remove.append(jid)
                    continue
                row = jobdict.get(jid)
                if row is None:
                    to_remove.append(jid)
                    continue
                if _is_outs_milestone(row):
                    est = earliest_start_for(jid, row)
                    sc = heap_key(row, est, is_continuation(jid, row), weights, now_ts)
                    key = (est, sc, jid)
                    if (best_outs is None) or (key < best_outs):
                        best_outs = key
            for jid in to_remove:
                s.discard(jid)

        if best_outs is not None:
            picked = best_outs[2]
            pick_reason = "outs-milestone"

        # (0.5) ZERO-DURATION FLUSH
        if picked is None:
            z = _best_zero_duration_global()
            if z is not None:
                picked = z[3]
                pick_reason = "zero-gate"

        # (1) OS5 absolute priority
        if picked is None and os5_ready:
            best_os5 = None
            to_remove = []
            for jid in os5_ready:
                if cancel_check and cancel_check():
                    return None, None, None

                if jid in placed or jid in dead:
                    to_remove.append(jid)
                    continue
                row = jobdict.get(jid)
                if row is None:
                    to_remove.append(jid)
                    continue

                wpU = row['_wpU']

                est = earliest_start_for(jid, row)

                dur0 = row['_dur']
                wdf = wins.get(wpU)
                idx0 = wp_ptr.get(wpU, 0)

                if dur0 == 0:
                    if not feasible_zero_duration(wdf, idx0, est):
                        continue
                else:
                    if not _feasible_now(jid, est):
                        continue

                if dur0 == 0:
                    st_feas = preview_zero_duration_time(wdf, idx0, est)
                else:
                    st_feas = first_feasible_start_pg01(wdf, idx0, est)

                if pd.isna(st_feas):
                    continue
                t0 = max(now_ts, wdf.at[idx0, "cursor"])
                if st_feas > (t0 + OS5_PICK_HORIZON):
                    continue

                sc = heap_key(row, est, is_continuation(jid, row), weights, now_ts)

                if is_upstream_pending(jid):
                    sc -= UPSTREAM_EPS
                if _has_immediate_same_machine_successor(jid, row):
                    sc += 1_000_000

                dur_flag = 0 if dur0 == 0 else 1

                key = (st_feas, dur_flag, sc, jid)

                if (best_os5 is None) or (key < best_os5):
                    best_os5 = key
            for jid in to_remove:
                os5_ready.discard(jid)

            if best_os5 is not None:
                picked = best_os5[3]
                pick_reason = "os5"

        # (2) strict continuation
        if picked is None:
            best_cont = None
            for wpU in wins.keys():
                if cancel_check and cancel_check():
                    return None, None, None

                s = cont_ready_by_wp.get(wpU)
                if not s:
                    continue

                to_remove = []
                for jid in s:
                    if jid in placed or jid in dead:
                        to_remove.append(jid)
                        continue
                    row = jobdict.get(jid)
                    if row is None:
                        to_remove.append(jid)
                        continue
                    if not has_direct_continuation(jid, row):
                        to_remove.append(jid)
                        continue

                    wdf = wins.get(wpU)
                    idx = wp_ptr.get(wpU, 0)
                    if wdf is None or wdf.empty or idx >= len(wdf):
                        continue

                    est = earliest_start_for(jid, row)
                    grp = row['_pg']
                    if grp == 2:
                        feasible = (est < wdf.at[idx, "end"])
                    else:
                        cursor = wdf.at[idx, "cursor"]
                        window_end = wdf.at[idx, "end"]
                        feasible = (cursor + GAP_TOL <= window_end) and (est <= cursor + GAP_TOL)

                    if not feasible:
                        continue

                    dur0 = row['_dur']
                    dur_flag = 0 if dur0 == 0 else 1

                    sc = heap_key(row, est, True, weights, now_ts)
                    if is_upstream_pending(jid):
                        sc -= UPSTREAM_EPS

                    key = (dur_flag, sc, jid)

                    if (best_cont is None) or (key < best_cont):
                        best_cont = key
                for jid in to_remove:
                    s.discard(jid)
            if best_cont is not None:
                picked = best_cont[2]
                pick_reason = "cont"

        # (3) GAPFILL
        if picked is None:
            while best_wp_heap:
                if cancel_check and cancel_check():
                    return None, None, None

                st_feas, dur_flag, sc, jid, wpU, gen = heapq.heappop(best_wp_heap)

                if gen != best_wp_gen.get(wpU, 0):
                    continue
                if jid in placed or jid in dead:
                    continue

                row = jobdict.get(jid)
                if row is None:
                    continue
                dur0 = row['_dur']
                ost0 = row['_os']

                if ost0 != 5 and not _is_outs_milestone(row):
                    if not fits_before_os5_lock(wpU, st_feas, dur0):
                        dirty_publish_wps.add(wpU)
                        continue

                picked = jid
                pick_reason = "gapfill"
                break

        # (4) FALLBACK
        if picked is None:
            best_fb = None
            for wpU in wins.keys():
                if cancel_check and cancel_check():
                    return None, None, None

                s = ready_by_wp.get(wpU)
                if not s:
                    continue

                to_remove = []
                for jid in s:
                    if jid in placed or jid in dead:
                        to_remove.append(jid)
                        continue
                    row = jobdict.get(jid)
                    if row is None:
                        to_remove.append(jid)
                        continue
                    if is_pg2_row(row) and not _is_outs_milestone(row):
                        continue

                    grp = row['_pg']
                    ddl_try = row.get("effective_deadline")

                    if grp in (0, 1):
                        if (not has_effective_deadline(row)) and any_effective_remaining_pg01():
                            continue
                        if pd.isna(ddl_try) and has_pending_deadline_ops():
                            continue

                    est = earliest_start_for(jid, row)
                    dur0 = row['_dur']

                    wdf = wins.get(wpU)
                    idx0 = wp_ptr.get(wpU, 0)

                    if dur0 == 0:
                        st_feas = preview_zero_duration_time(wdf, idx0, est)
                    else:
                        st_feas = first_feasible_start_pg01(wdf, idx0, est)

                    if pd.isna(st_feas):
                        continue

                    ost0 = row['_os']
                    if ost0 != 5 and not _is_outs_milestone(row):
                        if not fits_before_os5_lock(wpU, st_feas, dur0):
                            continue

                    sc = heap_key(row, est, is_continuation(jid, row), weights, now_ts)
                    if is_upstream_pending(jid):
                        sc -= UPSTREAM_EPS
                    if jid in os5_upstream_jobs:
                        sc = min(sc, -9e11)

                    dur_flag = 0 if dur0 == 0 else 1
                    key = (st_feas, dur_flag, sc, jid)

                    if (best_fb is None) or (key < best_fb):
                        best_fb = key
                for jid in to_remove:
                    s.discard(jid)

            if best_fb is not None:
                picked = best_fb[3]
                pick_reason = "fallback"

        if picked is None:
            break

        dead.add(picked)

        if picked is not None:
            rr = jobdict.get(picked)
            if rr is not None and is_pg2_row(rr) and not _is_outs_milestone(rr):
                resolve_pg2_one(picked)
                auto_resolve_pg2_closure(picked)
                flush_pending_ready()
                continue

        # -------------------- PLACE PICKED --------------------
        r = jobdict[picked]
        est_picked = earliest_start_for(picked, r)

        wp = str(r["WorkPlaceNo"]).strip()
        wpU = wp.upper()
        pg = r['_pg']

        dur = r['_dur']

        ddl = r.get("effective_deadline")
        ddl = ddl if pd.notna(ddl) else pd.NaT

        if (wpU in outsourcing_upper) and (r['_os'] > 3):
            start = est_picked
            end = start
        else:
            if not wp or wpU == "TBA":
                placed.add(picked)
                _remove_from_ready_sets(picked)
                end_times[picked] = pd.NaT
                continue

            earliest = est_picked
            w = wins.get(wpU)

            if pg == 2:
                if dur == 0:
                    start = earliest
                    end = start
                else:
                    if cancel_check and cancel_check():
                        return None, None, None

                    if w is None or w.empty:
                        placed.add(picked)
                        end_times[picked] = pd.NaT
                        continue
                    idx0 = wp_ptr.get(wpU, 0)
                    n = len(w)
                    j = idx0
                    while j < n and not (w.at[j, "end"] > earliest):
                        j += 1
                    if j >= n:
                        j = 0
                        while j < n and not (w.at[j, "end"] > earliest):
                            j += 1
                    remain = dur
                    curr = earliest
                    segs = []
                    while j < n and remain > 0:
                        ws, we = w.at[j, "start"], w.at[j, "end"]
                        s = max(ws, curr)
                        if s >= we:
                            j += 1
                            continue
                        free = minutes_between(s, we)
                        if free <= 0:
                            j += 1
                            continue
                        take = min(remain, free)
                        e = s + pd.Timedelta(minutes=take)
                        segs.append((s, e))
                        remain -= take
                        curr = e
                        if remain > 0 and e >= we:
                            j += 1
                    wp_ptr[wpU] = min(idx0, n - 1) if n > 0 else 0
                    if not segs:
                        placed.add(picked)
                        end_times[picked] = pd.NaT
                        continue
                    start, end = segs[0][0], segs[-1][1]

            else:
                if dur == 0:
                    if w is None or w.empty:
                        placed.add(picked)
                        _remove_from_ready_sets(picked)
                        end_times[picked] = pd.NaT
                        continue
                    idx0 = wp_ptr.get(wpU, 0)
                    t0 = place_zero_duration_on_wp(w, idx0, earliest)
                    if pd.isna(t0):
                        placed.add(picked)
                        _remove_from_ready_sets(picked)
                        end_times[picked] = pd.NaT
                        continue
                    start = t0
                    end = t0

                else:
                    if cancel_check and cancel_check():
                        return None, None, None

                    if w is None or w.empty:
                        placed.add(picked)
                        end_times[picked] = pd.NaT
                        continue
                    idx = wp_ptr.get(wpU, 0)
                    n = len(w)

                    while idx < n and not (w.at[idx, "end"] > earliest):
                        idx += 1
                    remain = dur
                    curr = earliest
                    segs = []
                    while idx < n and remain > 0:
                        if cancel_check and cancel_check():
                            return None, None, None

                        ws, we, cur = w.at[idx, "start"], w.at[idx, "end"], w.at[idx, "cursor"]
                        s = max(ws, cur, curr)
                        if s >= we:
                            idx += 1
                            continue
                        free = minutes_between(s, we)
                        if free <= 0:
                            idx += 1
                            continue

                        take = min(remain, free)
                        e = s + pd.Timedelta(minutes=take)
                        w.at[idx, "cursor"] = e
                        segs.append((s, e))
                        remain -= take
                        curr = e
                        if remain > 0 and e >= we:
                            idx += 1
                    wp_ptr[wpU] = min(idx, n - 1) if n > 0 else 0

                    if not segs:
                        placed.add(picked)
                        end_times[picked] = pd.NaT
                        continue
                    start, end = segs[0][0], segs[-1][1]

        starts_before_lsd = pd.NA
        within_grace = pd.NA
        if pd.notna(ddl):
            starts_before_lsd = bool(start <= ddl)
            within_grace = bool(start <= (ddl + pd.Timedelta(days=GRACE_DAYS)))



        if pd.notna(ddl):
            if start > ddl:
                primary = "Past deadline (urgent)"
            else:
                dt = ddl - start
                if dt <= pd.Timedelta(days=1):
                    primary = "Imminent deadline (<1 day)"
                elif dt <= pd.Timedelta(days=3):
                    primary = "Upcoming deadline (<3 days)"
                else:
                    primary = f"Has deadline on {ddl:%d-%m-%Y %H:%M}"
        else:
            primary = "No deadline (priority/fit)"

        secondary = (
            "Continuation (no buffer)" if is_continuation(picked, r)
            else "Outsourced milestone" if ((wpU in outsourcing_upper) and (r['_os'] > 3))
            else "Unlimited parallel window" if r['_pg'] == 2
            else "Bottleneck operation" if r['_pg'] == 0
            else "Best candidate now"
        )

        is_outs = (wpU in outsourcing_upper)
        out_delivery = r.get("DateStart") if (
                is_outs and r['_os'] > 3 and pd.notna(r.get("DateStart"))) else pd.NaT
        buf_real = r['_buf']
        buf_ind = int(round(buf_real / INDUSTRIAL_FACTOR))

        plan_rows.append({
            "job_id": picked, "OrderNo": r.get("OrderNo"), "OrderPos": r.get("OrderPos"),
            "Orderstate": r['_os'],
            "ItemNo": r.get("ItemNo"), "SortPos": r.get("SortPos"), "WorkPlaceNo": wp,
            "Start": start, "End": end,
            "Duration": to_int_nonneg(r.get("duration_min"), 0),
            "LatestStartDate": ddl,
            "StartsBeforeLSD": starts_before_lsd, "WithinGraceDays": within_grace,
            "PriorityGroup": r['_pg'],
            "IsUnlimitedMachine": (r['_pg'] == 2),
            "IsOutsourcing": is_outs, "OutsourcingDelivery": out_delivery,
            "BufferIndustrial": buf_ind, "BufferReal": buf_real,
            "ReasonSelected": f"{primary} | {secondary}",
            "DurationReal": to_int_nonneg(r.get("duration_min"), 0),
            "RecordType": r['_rec']
        })

        placed.add(picked)
        _remove_from_ready_sets(picked)
        end_times[picked] = end

        update_predictive_os5_lock_from_upstream(picked, end)

        wpU = r['_wpU']
        if wpU:
            ready_by_wp.get(wpU, set()).discard(picked)
            cont_ready_by_wp.get(wpU, set()).discard(picked)
        os5_ready.discard(picked)
        os5_ready_by_wp.get(wpU, set()).discard(picked)

        if wpU in wins:
            update_os5_lock_for_wp(wpU)
            dirty_publish_wps.add(wpU)

        if dirty_best_wps:
            for wpx in list(dirty_best_wps):
                if cancel_check and cancel_check():
                    return None, None, None
                update_os5_lock_for_wp(wpx)
                dirty_publish_wps.add(wpx)
            dirty_best_wps.clear()
        flush_dirty_publish()

        machine_last_job[wpU] = picked

        for s in succ_multi.get(picked, ()):
            if cancel_check and cancel_check():
                return None, None, None
            if s in placed or s in dead:
                continue
            srow = jobdict.get(s)
            if srow is None:
                continue
            if srow['_pg'] == 2 and not _is_outs_milestone(srow):
                continue
            if str(srow.get("WorkPlaceNo", "")).strip().upper() != wpU:
                continue
            if indeg.get(s, 0) == 0 and preds_resolved(s):
                cont_ready_by_wp.setdefault(wpU, set()).add(s)

        auto_resolve_pg2_closure(picked)
        flush_pending_ready()
        flush_dirty_publish()

        if r['_os'] == 5:
            os5_lock_until.pop(wpU, None)
            os5_lock_cache.pop(wpU, None)

            os5_eta_by_job.pop(picked, None)

            if wpU in os5_targets_by_wp:
                os5_targets_by_wp[wpU].discard(picked)

            recompute_wp_os5_eta(wpU)

            seeded_pred = {k for k in seeded_pred if k[1] != picked}

            dirty_best_wps.add(wpU)

        release_successors_after_place(picked)

    plan_df = pd.DataFrame(plan_rows)
    if not plan_df.empty:
        plan_df = plan_df.sort_values(["WorkPlaceNo", "Start"]).reset_index(drop=True)
        for col in ["Start", "End", "LatestStartDate", "OutsourcingDelivery"]:
            if col in plan_df.columns:
                plan_df[col] = pd.to_datetime(plan_df[col], errors="coerce")
                if plan_df[col].dt.tz is not None:
                    plan_df[col] = plan_df[col].dt.tz_localize(None)

    # -------------------------------
    # OPTION A: derive late_df from plan_df (includes locked ops)
    # -------------------------------
    late_df = pd.DataFrame(columns=[
        "job_id", "OrderNo", "OrderPos", "Orderstate", "WorkPlaceNo",
        "Start", "End", "LatestStartDate", "Allowed", "DaysLate", "RecordType"
    ])

    if not plan_df.empty:
        # make sure datetimes are datetimes
        plan_df["Start"] = pd.to_datetime(plan_df["Start"], errors="coerce")
        plan_df["End"] = pd.to_datetime(plan_df["End"], errors="coerce")
        plan_df["LatestStartDate"] = pd.to_datetime(plan_df["LatestStartDate"], errors="coerce")

        m = plan_df["LatestStartDate"].notna() & plan_df["Start"].notna()
        tmp = plan_df.loc[m, [
            "job_id", "OrderNo", "OrderPos", "Orderstate", "WorkPlaceNo",
            "Start", "End", "LatestStartDate", "RecordType"
        ]].copy()

        tmp["Allowed"] = tmp["LatestStartDate"] + pd.Timedelta(days=GRACE_DAYS)

        # days late relative to Allowed (grace included)
        delta_days = (tmp["Start"] - tmp["Allowed"]).dt.total_seconds() / 86400.0
        tmp["DaysLate"] = np.maximum(0, np.ceil(delta_days.fillna(0))).astype(int)

        late_df = tmp[tmp["DaysLate"] > 0].sort_values(["WorkPlaceNo", "Start"]).reset_index(drop=True)
        for col in ["Start", "End", "LatestStartDate", "Allowed"]:
            if col in late_df.columns:
                late_df[col] = pd.to_datetime(late_df[col], errors="coerce")
                if late_df[col].dt.tz is not None:
                    late_df[col] = late_df[col].dt.tz_localize(None)

    if cancel_check and cancel_check():
        return None, None, None

    # Unplaced
    placed_ids = set(plan_df["job_id"]) if not plan_df.empty else set()
    all_ids = set(jobdict.keys())
    remaining = sorted(all_ids - placed_ids)
    unplaced_rows = []
    for jid in remaining:
        if cancel_check and cancel_check():
            return None, None, None

        r = jobdict[jid]
        wp = str(r.get("WorkPlaceNo", "")).strip()
        wpU = wp.upper()
        if not wp or wpU == "TBA":
            reason = "workplace_missing_or_TBA"
        elif indeg.get(jid, 0) > 0:
            reason = "blocked_by_predecessor_or_material"
        else:
            reason = "no_capacity_in_windows"
        unplaced_rows.append({
            "job_id": jid,
            "OrderNo": r.get("OrderNo"),
            "OrderPos": r.get("OrderPos"),
            "WorkPlaceNo": wp,
            "LatestStartDate": r.get("effective_deadline"),
            "Orderstate": r['_os'],
            "reason": reason
        })


    unp_df = pd.DataFrame(unplaced_rows)

    gap_eval_cache.clear()
    rough_end_cache.clear()
    rem_cache.clear()

    return plan_df, late_df, unp_df