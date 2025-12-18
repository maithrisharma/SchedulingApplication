import heapq, math
import pandas as pd
from .config import (
    DEFAULT_WEIGHTS, GRACE_DAYS, INDUSTRIAL_FACTOR, NOW,
    SCHEDULE_RT
)
from .windows import build_windows
from scheduler_state import cancel_flag

#helpers
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

def _check_cancel(scenario_name):
    if scenario_name and cancel_flag.get(scenario_name):
        print(f"[SCHEDULER] CANCEL DETECTED inside scheduler() for {scenario_name}")
        return True
    return False

#scoring
def heap_key(row, earliest_ts, cont_same_machine, weights):
    ddl = row.get("effective_deadline")
    has_ddl = 0 if (isinstance(ddl, pd.Timestamp) and pd.notna(ddl)) else 1
    ddl_minutes = max(0, minutes_between(NOW, ddl)) if pd.notna(ddl) else 10_000_000

    grp = to_int(row.get("PriorityGroup"), 2)
    ost = to_int(row.get("Orderstate"), 0)

    if ost == 5:
        lateness = 0
        duration_late = 0
        if pd.notna(ddl):
            ddl_minutes = 0  # treat as urgent

    #Absolute OS=5 priority
    if ost == 5:
        return -1e12  # Nothing can beat this


    cont = 0 if cont_same_machine else 1
    dur = to_int_nonneg(row.get("duration_min"), 0)
    pos = to_int(row.get("OrderPos"), 0)
    earliest_min = max(0, minutes_between(NOW, earliest_ts))

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



def schedule(jobs, shifts, pred_sets, succ_multi, unlimited_set, outsourcing_set, weights, scenario_name=None):
    windows_by_wp, earliest_global, first_by_wp = build_windows(shifts)

    # normalize window dict to UPPER keys to avoid mismatches
    wins = {str(wp).strip().upper(): df.copy() for wp, df in windows_by_wp.items()}
    for df in wins.values():
        if "cursor" not in df.columns:
            df["cursor"] = df["start"]  # safety

    wp_ptr = {wp: 0 for wp in wins}
    if _check_cancel(scenario_name):
        return None, None, None

    unlimited_upper = {str(x).strip().upper() for x in unlimited_set}
    outsourcing_upper = {str(x).strip().upper() for x in outsourcing_set}

    # jobs map
    jobdict = {str(r["job_id"]).strip(): r for _, r in jobs.iterrows()}

    # indegree init
    indeg = {jid: len(pred_sets.get(jid, set())) for jid in jobdict.keys()}
    # ---------- OS5 upstream lock (fixes greedy cursor runaway) ----------
    # If a job is a predecessor of an OS=5 job, then when that predecessor becomes READY,
    # we lock the OS5 machine to stop it being filled ahead before OS5 unlocks.
    os5_lock_wp = set()  # wpU that should not be greedily filled
    os5_pred_to_wp = {}  # pred_jid -> set(wpU of dependent OS5 jobs)

    for os5_jid, r in jobdict.items():
        if to_int(r.get("Orderstate"), 0) != 5:
            continue
        wp_os5 = str(r.get("WorkPlaceNo", "")).strip().upper()
        if not wp_os5 or wp_os5 == "TBA":
            continue
        for p in pred_sets.get(os5_jid, set()):
            os5_pred_to_wp.setdefault(p, set()).add(wp_os5)

            # ----------------------------------
            # --- OS5-UPSTREAM PRIORITY BOOST ---
        OS5_UPSTREAM_BOOST = 5e11  # big, but still less than OS5 absolute priority (-1e12)
        os5_upstream_jobs = set(os5_pred_to_wp.keys())

    # ---------------------------------------------------

    plan_rows, late_rows = [], []
    end_times, placed = {}, set()

    # tiny upstream bonus (stronger but still small)
    UPSTREAM_EPS = 0.5

    # remember last placed per machine (for strict same-machine continuation)
    machine_last_job = {}  # wpU -> job_id



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
        wpU = str(row.get("WorkPlaceNo", "")).strip().upper()
        last = machine_last_job.get(wpU)
        if not last:
            return False
        preds = pred_sets.get(jid, set())
        return last in preds

    #milestone detectors
    def _is_outs_milestone(row) -> bool:
        wpU = str(row.get("WorkPlaceNo", "")).strip().upper()
        return (wpU in outsourcing_upper) and (to_int(row.get("Orderstate"), 0) > 3)

    def _has_real_pred(jid) -> bool:
        """Any predecessor that consumes capacity (PG in {0,1}) and is known in jobdict."""
        preds = pred_sets.get(jid, set())
        for p in preds:
            prow = jobdict.get(p)
            if prow is None:
                continue
            if to_int(prow.get("PriorityGroup"), 2) in (0, 1):
                return True
        return False

    def earliest_start_for(jid, row):
        if _check_cancel(scenario_name):
            return NOW
        wp = str(row["WorkPlaceNo"]).strip()
        wpU = wp.upper()

        # predecessors ready times (respect buffer; continuation has 0 buffer)
        preds = pred_sets.get(jid, set())
        ready_times = []
        for p in preds:
            if p in end_times:
                prow = jobdict.get(p, {})
                if str(prow.get("WorkPlaceNo", "")).strip().upper() == wpU:
                    ready_times.append(end_times[p])  # no buffer continuation
                else:
                    buf = int(pd.to_numeric(prow.get("buffer_min", 0), errors="coerce") or 0)
                    ready_times.append(end_times[p] + pd.Timedelta(minutes=buf))

        # SPECIAL: outsourcing milestones (no capacity) follow your rules
        if _is_outs_milestone(row):
            ev = pd.to_datetime(row.get("DateStart"), errors="coerce")
            # Case A: future vendor delivery -> place at DateStart
            if pd.notna(ev) and ev > NOW:
                est = ev
            else:
                # Case B: delivered (ev <= NOW or NaT)
                if _has_real_pred(jid) and ready_times:
                    # after a real op -> predecessor end + buffer
                    est = max(ready_times)
                else:
                    # first op or only after milestones -> show NOW
                    est = NOW

            return est

        # Normal capacity-bound ops
        candidates = [NOW, earliest_global]
        if ready_times:
            candidates.append(max(ready_times))

        first_wp = first_by_wp.get(wpU, pd.NaT)
        if pd.notna(first_wp):
            candidates.append(first_wp)

        # outsourcing gate (non-milestone / generic handling)
        if wpU in outsourcing_upper:
            ev_gate = row.get("DateStart")
            os = to_int(row.get("Orderstate"), 0)
            if pd.notna(ev_gate) and os > 3:
                candidates.append(ev_gate)

        est = max(candidates)

        return est

    def has_pending_deadline_ops():
        for jid, r in jobdict.items():
            if jid not in placed and indeg.get(jid, 0) == 0:
                if pd.notna(r.get("effective_deadline")):
                    return True
        return False

    def any_effective_remaining_pg01():
        for jid, r in jobdict.items():
            if jid in placed:
                continue
            if to_int(r.get("PriorityGroup"), 2) in (0, 1) and has_effective_deadline(r):
                return True
        return False

    def _has_immediate_same_machine_successor(jid, row):
        wpU = str(row.get("WorkPlaceNo", "")).strip().upper()
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

    #Look forward in windows for PG=0/1
    def _feasible_now(jid):
        row = jobdict[jid]
        wpU = str(row.get("WorkPlaceNo", "")).strip().upper()
        wdf = wins.get(wpU)
        if wdf is None or wdf.empty:
            return False
        idx = wp_ptr.get(wpU, 0)
        est = earliest_start_for(jid, row)
        pg = to_int(row.get("PriorityGroup"), 2)

        if pg == 2:
            for j in range(len(wdf)):
                if est < wdf.at[j, "end"]:
                    return True
            return False

        # Look forward from current window
        for j in range(idx, len(wdf)):
            cursor = wdf.at[j, "cursor"]
            win_end = wdf.at[j, "end"]
            if max(cursor, est) + GAP_TOL <= win_end:
                return True
        return False

    # seed heap with indegree==0
    ready_heap = []
    for jid, deg in indeg.items():
        if deg == 0:
            if _check_cancel(scenario_name):
                return None, None, None
            r = jobdict[jid]
            est = earliest_start_for(jid, r)
            score = heap_key(r, est, is_continuation(jid, r), weights)
            if is_upstream_pending(jid):
                score -= UPSTREAM_EPS
            if jid in os5_upstream_jobs:
                score -= OS5_UPSTREAM_BOOST
            heapq.heappush(ready_heap, (score, jid))
            for wp_lock in os5_pred_to_wp.get(jid, ()):
                os5_lock_wp.add(wp_lock)


    LOOKAHEAD = 20
    GAP_TOL = pd.Timedelta(minutes=1)

    while ready_heap:
        if _check_cancel(scenario_name):
            return None, None, None
        pulled = [heapq.heappop(ready_heap) for _ in range(min(LOOKAHEAD, len(ready_heap)))]
        picked = None
        picked_tuple = None
        pick_reason = None

        #(0) PICK OUTSOURCING MILESTONES (OS>3) IMMEDIATELY WHEN READY (no capacity)
        cand_list = pulled + list(ready_heap)
        outs_cands = []
        for score, cand in cand_list:
            if cand in placed:
                continue
            row_try = jobdict.get(cand)
            if row_try is None:
                continue
            if _is_outs_milestone(row_try):
                est = earliest_start_for(cand, row_try)
                outs_cands.append((est, score, cand))
        if outs_cands:
            # choose earliest est; tie-break by score
            outs_cands.sort(key=lambda t: (t[0], t[1]))
            _, _, chosen = outs_cands[0]
            picked = chosen
            pick_reason = "outs-milestone"
            picked_tuple = next((t for t in pulled if t[1] == chosen), None)
            if picked_tuple is None:
                ready_heap = [t for t in ready_heap if t[1] != chosen]
                heapq.heapify(ready_heap)


        # Absolute priority for feasible OS=5 (for non-picked)
        if picked is None:
            feasible_os5 = []
            rest = list(ready_heap)
            for score, cand in pulled + rest:
                if cand in placed: continue
                row_try = jobdict.get(cand)
                if row_try is None: continue
                if to_int(row_try.get("Orderstate"), 0) != 5: continue
                est = earliest_start_for(cand, row_try)
                sc = heap_key(row_try, est, is_continuation(cand, row_try), weights)
                if is_upstream_pending(cand): sc -= UPSTREAM_EPS
                if _has_immediate_same_machine_successor(cand, row_try):
                    sc += 1_000_000  # Penalty to place last
                if _feasible_now(cand):
                    feasible_os5.append((sc, cand))
            if feasible_os5:
                feasible_os5.sort(key=lambda x: x[0])
                picked_tuple = feasible_os5[0]
                picked = picked_tuple[1]
                pick_reason = "os5"
                ready_heap = [t for t in rest if t[1] != picked]
                heapq.heapify(ready_heap)

            else:
                # STRICT SAME-MACHINE CONTINUATION
                cont_choice = None
                cont_tuple_in_pulled = None
                for score, cand in pulled + rest:
                    if cand in placed:
                        continue
                    row_try = jobdict[cand]
                    wpU = str(row_try.get("WorkPlaceNo", "")).strip().upper()
                    wdf = wins.get(wpU)
                    if wdf is None or wdf.empty:
                        continue
                    idx = wp_ptr.get(wpU, 0)
                    if idx >= len(wdf):
                        continue
                    if not has_direct_continuation(cand, row_try):
                        continue

                    earliest_try = earliest_start_for(cand, row_try)
                    grp = to_int(row_try.get("PriorityGroup"), 2)

                    if grp == 2:
                        feasible = (earliest_try < wdf.at[idx, "end"])
                    else:
                        cursor = wdf.at[idx, "cursor"]
                        window_end = wdf.at[idx, "end"]
                        feasible = (cursor + GAP_TOL <= window_end) and (earliest_try <= cursor + GAP_TOL)

                    if not feasible:
                        continue

                    sc = heap_key(row_try, earliest_try, True, weights)
                    if is_upstream_pending(cand):
                        sc -= UPSTREAM_EPS
                    if (cont_choice is None) or (sc < cont_choice[0]):
                        cont_choice = (sc, cand)
                        cont_tuple_in_pulled = None
                        for t in pulled:
                            if t[1] == cand:
                                cont_tuple_in_pulled = t
                                break

                if cont_choice is not None:
                    picked_tuple = cont_tuple_in_pulled if cont_tuple_in_pulled else cont_choice
                    picked = picked_tuple[1]
                    pick_reason = "cont"
                    if cont_tuple_in_pulled is None:
                        ready_heap = [t for t in rest if t[1] != picked]
                        heapq.heapify(ready_heap)
                    r_pick = jobdict[picked]


        #GAP-FILL
        if picked is None:
            for score, cand in pulled:
                if _check_cancel(scenario_name):
                    return None, None, None
                if cand in placed:
                    continue
                row_try = jobdict[cand]
                grp = to_int(row_try.get("PriorityGroup"), 2)
                ddl_try = row_try.get("effective_deadline")
                wpU = str(row_try["WorkPlaceNo"]).strip().upper()
                wdf = wins.get(wpU)
                if wdf is None or wdf.empty:
                    continue

                if grp in (0, 1) and pd.isna(ddl_try) and has_pending_deadline_ops():
                    continue

                earliest_try = earliest_start_for(cand, row_try)

                if grp == 2:
                    j = wp_ptr.get(wpU, 0)
                    ok = False
                    while j < len(wdf):
                        if earliest_try < wdf.at[j, "end"]:
                            ok = True
                            break
                        j += 1
                    if not ok:
                        j = 0
                        while j < len(wdf):
                            if earliest_try < wdf.at[j, "end"]:
                                ok = True
                                break
                            j += 1
                    if ok:
                        picked_tuple = (score, cand)
                        picked = picked_tuple[1]

                        break
                    else:
                        continue

                idx = wp_ptr.get(wpU, 0)
                if idx >= len(wdf):
                    continue
                cursor = wdf.at[idx, "cursor"]
                window_end = wdf.at[idx, "end"]
                # --- OS5-UPSTREAM LOCK GUARD ---
                # If this machine is locked because an upstream of an OS5 is READY,
                # do not greedily fill it with non-OS5 jobs.
                if wpU in os5_lock_wp and to_int(row_try.get("Orderstate"), 0) != 5:
                    # allow PG=2 to run if it finishes before OS5 earliest start
                    if to_int(row_try.get("PriorityGroup"), 2) != 2:
                        continue

                if max(cursor, earliest_try) + GAP_TOL <= window_end:
                    picked_tuple = (score, cand)
                    picked = picked_tuple[1]

                    break

        #FALLBACK
        if picked is None:
            pulled.sort(key=lambda x: x[0])
            for score, cand in pulled:
                if cand in placed:
                    continue
                row_try = jobdict[cand]
                grp = to_int(row_try.get("PriorityGroup"), 2)
                if grp in (0, 1):
                    if (not has_effective_deadline(row_try)) and any_effective_remaining_pg01():
                        continue
                    ddl_try = row_try.get("effective_deadline")
                    if pd.isna(ddl_try) and has_pending_deadline_ops():
                        continue
                wpU = str(row_try.get("WorkPlaceNo", "")).strip().upper()
                picked_tuple = (score, cand)
                picked = picked_tuple[1]

                break

        for t in pulled:
            if picked_tuple and t[1] == picked_tuple[1]:
                continue
            heapq.heappush(ready_heap, t)

        if picked is None:
            break

        #PLACE PICKED
        r = jobdict[picked]
        wp = str(r["WorkPlaceNo"]).strip()
        wpU = wp.upper()
        pg = to_int(r.get("PriorityGroup"), 2)

        dur = to_int_nonneg(r.get("duration_min"), 0)

        if wpU == "AP0031" and to_int(r.get("Orderstate"), 0) <= 3:
            dur = int(math.ceil(dur / INDUSTRIAL_FACTOR))

        ddl = r.get("effective_deadline")
        ddl = ddl if pd.notna(ddl) else pd.NaT

        # Outsourcing milestone: no capacity, start/end per earliest_start_for rule set
        if (wpU in outsourcing_upper) and (to_int(r.get("Orderstate"), 0) > 3):
            start = earliest_start_for(picked, r)
            end = start
        else:
            if not wp or wpU == "TBA":
                placed.add(picked)
                end_times[picked] = pd.NaT
                continue

            earliest = earliest_start_for(picked, r)
            w = wins.get(wpU)
            if _check_cancel(scenario_name):
                return None, None, None

            if pg == 2:
                if dur == 0:
                    start = earliest
                    end = start
                else:
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
                    start = earliest
                    end = start
                else:
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
                        if _check_cancel(scenario_name):
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

        if pd.notna(ddl) and not within_grace:
            try:
                allowed = ddl + pd.Timedelta(days=GRACE_DAYS)
                # Safe timedelta
                if pd.isna(start) or pd.isna(allowed):
                    delta = pd.Timedelta(0)
                else:
                    delta = start - allowed
                    if delta == pd.NaT:
                        delta = pd.Timedelta(0)

                days_late = max(0, math.ceil(delta.total_seconds() / 86400))
            except Exception as e:
                print("[SAFE-LATE] Timedelta failed:", e)
                days_late = 0
                allowed = ddl

            late_rows.append({
                "job_id": picked, "OrderNo": r.get("OrderNo"), "OrderPos": r.get("OrderPos"),
                "Orderstate": to_int(r.get("Orderstate"), 0), "WorkPlaceNo": wp,
                "Start": start, "End": end,
                "LatestStartDate": ddl, "Allowed": allowed,
                "DaysLate": days_late, "RecordType": to_int(r.get("RecordType"), 0)
            })

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
            else "Outsourced milestone" if ((wpU in outsourcing_upper) and (to_int(r.get("Orderstate"), 0) > 3))
            else "Unlimited parallel window" if to_int(r.get("PriorityGroup"), 2) == 2
            else "Bottleneck operation" if to_int(r.get("PriorityGroup"), 2) == 0
            else "Best candidate now"
        )

        is_outs = (wpU in outsourcing_upper)
        out_delivery = r.get("DateStart") if (
                    is_outs and to_int(r.get("Orderstate"), 0) > 3 and pd.notna(r.get("DateStart"))) else pd.NaT
        buf_real = to_int_nonneg(r.get("buffer_min"), 0)
        buf_ind = int(round(buf_real / INDUSTRIAL_FACTOR))

        plan_rows.append({
            "job_id": picked, "OrderNo": r.get("OrderNo"), "OrderPos": r.get("OrderPos"),
            "Orderstate": to_int(r.get("Orderstate"), 0),
            "ItemNo": r.get("ItemNo"), "SortPos": r.get("SortPos"), "WorkPlaceNo": wp,
            "Start": start, "End": end,
            "Duration": to_int_nonneg(r.get("duration_min"), 0),
            "LatestStartDate": ddl,
            "StartsBeforeLSD": starts_before_lsd, "WithinGraceDays": within_grace,
            "PriorityGroup": to_int(r.get("PriorityGroup"), 2),
            "IsUnlimitedMachine": (to_int(r.get("PriorityGroup"), 2) == 2),
            "IsOutsourcing": is_outs, "OutsourcingDelivery": out_delivery,
            "BufferIndustrial": buf_ind, "BufferReal": buf_real,
            "ReasonSelected": f"{primary} | {secondary}",
            "DurationReal": to_int_nonneg(r.get("duration_min"), 0),
            "RecordType": to_int(r.get("RecordType"), 0)
        })

        placed.add(picked)
        end_times[picked] = end
        machine_last_job[wpU] = picked
        if to_int(r.get("Orderstate"), 0) == 5:
            os5_lock_wp.discard(wpU)  # release protection once OS5 ran


        # release successors
        for succ in succ_multi.get(picked, set()):
            if _check_cancel(scenario_name):
                return None, None, None
            if succ in placed:
                continue
            indeg[succ] = max(0, indeg.get(succ, 0) - 1)
            if indeg[succ] == 0:
                row_s = jobdict[succ]
                est = earliest_start_for(succ, row_s)
                score = heap_key(row_s, est, is_continuation(succ, row_s), weights)
                if is_upstream_pending(succ):
                    score -= UPSTREAM_EPS
                if succ in os5_upstream_jobs:
                    score -= OS5_UPSTREAM_BOOST

                heapq.heappush(ready_heap, (score, succ))

                # --- NEW FIX: lock OS5 machine as soon as upstream becomes READY ---
                for wp_lock in os5_pred_to_wp.get(succ, ()):
                    os5_lock_wp.add(wp_lock)


    plan_df = pd.DataFrame(plan_rows).sort_values(["WorkPlaceNo", "Start"]).reset_index(drop=True)
    if _check_cancel(scenario_name):
        return None, None, None

    # Unplaced
    placed_ids = set(plan_df["job_id"]) if not plan_df.empty else set()
    all_ids = set(jobdict.keys())
    remaining = sorted(all_ids - placed_ids)

    unplaced_rows = []
    for jid in remaining:
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
            "Orderstate": to_int(r.get("Orderstate"), 0),
            "reason": reason
        })

    late_df = pd.DataFrame(late_rows).sort_values(["WorkPlaceNo", "Start"]).reset_index(drop=True)
    unp_df = pd.DataFrame(unplaced_rows)
    return plan_df, late_df, unp_df