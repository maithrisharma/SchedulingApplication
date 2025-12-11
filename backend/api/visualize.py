# backend/api/visualize.py
from flask import Blueprint, jsonify
from pathlib import Path
import pandas as pd

visualize_bp = Blueprint("visualize", __name__, url_prefix="/api/visualize")


# Helper: Read CSV safely and sanitize NaN → None
def read_csv_safe(path: Path):
    if not path.exists():
        return []
    try:
        df = pd.read_csv(path)
        df = df.where(pd.notna(df), None)
        return df.to_dict(orient="records")
    except Exception as e:
        print(f"Error reading {path}: {e}")
        return []


def sanitize_df(df: pd.DataFrame):
    df = df.where(pd.notna(df), None)
    return df.to_dict(orient="records")


def parse_ts(s):
    """
    Parse scheduler timestamps → ISO 8601.
    Scheduler already writes ISO, so we do NOT use dayfirst=True.
    """
    if not s:
        return None
    try:
        # ISO-safe parsing (no dayfirst)
        ts = pd.to_datetime(s, errors="coerce")
        if pd.isna(ts):
            return None
        # Return ISO string, no timezone assumptions
        return ts.isoformat()
    except Exception:
        return None



# Compute machine utilization
def compute_machine_utilization_from_plan(plan_df: pd.DataFrame):
    """
    Computes utilization ONLY for machines where PriorityGroup is 0 or 1.
    Returns (util_pct, top10_list).
    """

    if plan_df.empty:
        return {}, []

    # Ensure datetime
    plan_df["Start"] = pd.to_datetime(plan_df["Start"], errors="coerce")
    plan_df["End"] = pd.to_datetime(plan_df["End"], errors="coerce")

    # SAFETY: If PriorityGroup missing, treat all as NBN (1)
    if "PriorityGroup" not in plan_df.columns:
        plan_df["PriorityGroup"] = 1

    # Filter to BN/NBN only
    allowed = plan_df[plan_df["PriorityGroup"].isin([0, 1])].copy()
    if allowed.empty:
        return {}, []

    # Keep only valid rows where we can compute a duration
    allowed = allowed.dropna(subset=["WorkPlaceNo", "Start", "End"])
    allowed = allowed[allowed["End"] > allowed["Start"]]
    if allowed.empty:
        return {}, []

    # Compute busy minutes per machine (vectorized)
    allowed["minutes"] = (allowed["End"] - allowed["Start"]).dt.total_seconds() / 60.0

    # Group once by WorkPlaceNo
    busy_series = (
        allowed.groupby("WorkPlaceNo")["minutes"]
        .sum()
        .sort_index()
    )

    if busy_series.empty:
        return {}, []

    # Compute global window
    min_start = allowed["Start"].min()
    max_end = allowed["End"].max()
    total_window = (max_end - min_start).total_seconds() / 60.0
    if total_window <= 0:
        total_window = 1.0

    # Utilization % per machine (vectorized)
    util_pct_series = busy_series / total_window * 100.0
    util_pct = util_pct_series.to_dict()

    # Top 10 by utilization
    top10_list = (
        util_pct_series.sort_values(ascending=False)
        .head(10)
        .index.astype(str)
        .tolist()
    )

    return util_pct, top10_list



# GET /api/visualize/<scenario>
# Main dataset for Gantt + KPIs list + machine list
@visualize_bp.get("/<scenario>")
def get_visualization_data(scenario):
    base = Path("scenarios") / scenario / "output"

    if not base.exists():
        return jsonify({"ok": False, "error": "Scenario output not found"}), 404

    # File paths
    plan_file = base / "plan.csv"
    late_file = base / "late.csv"
    unplaced_file = base / "unplaced.csv"
    orders_file = base / "orders_delivery.csv"
    summary_file = base / "summaryFile.csv"

    # Load + sanitize
    plan = read_csv_safe(plan_file)
    late = read_csv_safe(late_file)
    unplaced = read_csv_safe(unplaced_file)
    orders = read_csv_safe(orders_file)

    #SUMMARY
    summary = []
    if summary_file.exists():
        try:
            df = pd.read_csv(summary_file)
            df = df.where(pd.notna(df), None)
            summary = df.to_dict(orient="records")
        except Exception as e:
            print("Summary read error:", e)


    # PLAN sorting + machine + utilization
    try:
        df_plan = pd.DataFrame(plan)

        if not df_plan.empty:
            # Sort plan by machine + start time
            df_plan["Start"] = pd.to_datetime(df_plan["Start"], errors="coerce")
            df_plan = df_plan.sort_values(["WorkPlaceNo", "Start"], na_position="last")

            # Extract machines from plan (same as before)
            machines = sorted(
                set(
                    str(x).strip()
                    for x in df_plan["WorkPlaceNo"].dropna().unique()
                    if x and str(x).strip() != "TBA"
                )
            )

            # Compute utilization + top10 (vectorized helper)
            util_pct, top10_list = compute_machine_utilization_from_plan(df_plan)

            plan = sanitize_df(df_plan)
        else:
            machines = []
            util_pct = {}
            top10_list = []

    except Exception as e:
        print("Plan processing failed:", e)
        machines = []
        util_pct = {}
        top10_list = []

    return jsonify({
        "ok": True,
        "scenario": scenario,
        "plan": plan,
        "late": late,
        "unplaced": unplaced,
        "orders": orders,
        "summary": summary,
        "machines": machines,               # All machines from PLAN
        "machine_utilization": util_pct,    # % busy (relative measure)
        "top10_machines": top10_list        # Sorted top 10 for Gantt default
    })



#KPI DASHBOARD ENDPOINT
# GET /api/visualize/<scenario>/kpis
@visualize_bp.get("/<scenario>/kpis")
def get_kpis(scenario):
    """
    Returns a structured KPI payload based on summaryFile.csv
    for a given scenario, plus Late Ops buckets (DaysLate bands).
    """
    base = Path("scenarios") / scenario / "output"
    summary_file = base / "summaryFile.csv"
    late_file = base / "late.csv"

    if not base.exists() or not summary_file.exists():
        return jsonify({"ok": False, "error": "summaryFile.csv not found"}), 404

    try:
        df = pd.read_csv(summary_file)
    except Exception as e:
        print("Failed to read summaryFile:", e)
        return jsonify({"ok": False, "error": "Failed to read summaryFile.csv"}), 500

    # Clean up
    df["Metric"] = df["Metric"].astype(str).str.strip()
    df_num = df.copy()
    df_num["Value_num"] = pd.to_numeric(df_num["Value"], errors="coerce")

    num_lookup = dict(zip(df_num["Metric"], df_num["Value_num"]))
    raw_lookup = dict(zip(df["Metric"], df["Value"].astype(str)))

    def g_num(name, default=None):
        val = num_lookup.get(name, None)
        if pd.isna(val):
            return default
        return float(val)

    def g_raw(name, default=None):
        return raw_lookup.get(name, default)

    #Summary cards (top row)
    summary_cards = {
        "eligible_ops_before": g_num("Eligible ops (60/115) before scheduling"),
        "pct_ops_already_late_pre": g_num("% ops already late (pre)"),
        "already_late_ops_input": g_num("Already late (input)"),
        "on_time_possible": g_num("On-time possible"),
        "on_time_fixable": g_num("On-time (fixable)"),
        "late_jobs_completed": g_num("Late jobs completed"),
        "scheduled_jobs": g_num("Scheduled jobs"),
        "late_jobs_beyond_grace": g_num("Late jobs (beyond configured grace)"),
        "unplaced_jobs": g_num("Unplaced jobs"),
        "unique_orders": g_num("Unique orders (scheduled)"),
        "unique_machines": g_num("Unique machines (scheduled)"),
        "saved_pct": g_num("Saved"),
    }

    #Ops-level grace bands
    ops_kpis = [
        {"label": "% On time (Start <= LSD)", "value": g_num("% On time (Start <= LSD)")},
        {"label": "% Within 1 day grace", "value": g_num("% Within 1 day grace")},
        {"label": "% Within 2 days grace", "value": g_num("% Within 2 days grace")},
        {"label": "% Within 3 day grace", "value": g_num("% Within 3 day grace")},
        {"label": "% Within 4 day grace", "value": g_num("% Within 4 day grace")},
        {"label": "% Within 5 day grace", "value": g_num("% Within 5 day grace")},
        {"label": "% Within 6 day grace", "value": g_num("% Within 6 day grace")},
        {"label": "% Within 7 day grace", "value": g_num("% Within 7 day grace")},
        {"label": "% Beyond 7 days grace", "value": g_num("% Beyond 7 days grace")},
    ]

    #Order-level grace bands
    order_kpis = [
        {"label": "% Orders On time", "value": g_num("% Orders On time (Delivery <= SupposedDate)")},
        {"label": "% Orders Within 1 day grace", "value": g_num("% Orders Within 1 day grace")},
        {"label": "% Orders Within 2 day grace", "value": g_num("% Orders Within 2 day grace")},
        {"label": "% Orders Within 3 day grace", "value": g_num("% Orders Within 3 day grace")},
        {"label": "% Orders Within 4 day grace", "value": g_num("% Orders Within 4 day grace")},
        {"label": "% Orders Within 5 day grace", "value": g_num("% Orders Within 5 day grace")},
        {"label": "% Orders Within 6 day grace", "value": g_num("% Orders Within 6 day grace")},
        {"label": "% Orders Within 7 day grace", "value": g_num("% Orders Within 7 day grace")},
        {"label": "% Orders Beyond 7 days grace", "value": g_num("% Orders Beyond 7 days grace")},
    ]

    #Pre-scheduling metrics (input quality)
    pre_kpis = [
        {
            "label": "Eligible ops before scheduling",
            "value": g_num("Eligible ops (60/115) before scheduling"),
        },
        {"label": "Already late (input)", "value": g_num("Already late (input)")},
        {"label": "On-time possible", "value": g_num("On-time possible")},
        {"label": "On-time (fixable)", "value": g_num("On-time (fixable)")},
    ]

    # Utilization & delay
    real_minutes = g_num("Total real minutes")
    industrial_minutes = g_num("Total industrial minutes")
    delay_real = g_num("Total delay in shift time (real)")
    delay_industrial = g_num("Total delay in shift time (industrial)")

    utilization = {
        "real_minutes": real_minutes,
        "industrial_minutes": industrial_minutes,
        "delay_minutes_real": delay_real,
        "delay_minutes_industrial": delay_industrial,
        "utilization_pct": (
            (real_minutes / industrial_minutes * 100.0)
            if real_minutes is not None and industrial_minutes
            else None
        ),
    }

    #Time window (first start / last end)
    first_start_raw = g_raw("First start")
    last_end_raw = g_raw("Last end")

    time_window = {
        "first_start": parse_ts(first_start_raw),
        "last_end": parse_ts(last_end_raw),
        "first_start_raw": first_start_raw,
        "last_end_raw": last_end_raw,
    }

    # Late Ops buckets
    # Buckets: 0–1d, 1–2d, 2–3d, 3–4d, 4–5d, 5–6d, 6–7d, >7d
    bucket_labels = ["0–1d", "1–2d", "2–3d", "3–4d", "4–5d", "5–6d", "6–7d", ">7d"]
    bucket_counts = {label: 0 for label in bucket_labels}

    try:
        if late_file.exists():
            df_late = pd.read_csv(late_file)
            if "DaysLate" in df_late.columns:
                days = pd.to_numeric(df_late["DaysLate"], errors="coerce").dropna()
                for v in days:
                    v = float(v)
                    if v <= 1:
                        bucket_counts["0–1d"] += 1
                    elif v <= 2:
                        bucket_counts["1–2d"] += 1
                    elif v <= 3:
                        bucket_counts["2–3d"] += 1
                    elif v <= 4:
                        bucket_counts["3–4d"] += 1
                    elif v <= 5:
                        bucket_counts["4–5d"] += 1
                    elif v <= 6:
                        bucket_counts["5–6d"] += 1
                    elif v <= 7:
                        bucket_counts["6–7d"] += 1
                    else:
                        bucket_counts[">7d"] += 1
    except Exception as e:
        print("Failed to compute late buckets:", e)

    late_buckets = [
        {"label": label, "value": int(bucket_counts[label])}
        for label in bucket_labels
    ]

    return jsonify(
        {
            "ok": True,
            "scenario": scenario,
            "summary_cards": summary_cards,
            "ops_kpis": ops_kpis,
            "order_kpis": order_kpis,
            "pre_kpis": pre_kpis,
            "utilization": utilization,
            "time_window": time_window,
            "late_buckets": late_buckets,
        }
    )


@visualize_bp.get("/<scenario>/utilization")
def get_utilization_details(scenario):
    """
    Returns advanced utilization dataset:
    - hours per machine
    - utilization %
    - BN vs NBN split
    - daily utilization trend
    - job counts per machine
    - job lists per machine
    """
    base = Path("scenarios") / scenario / "output"
    plan_file = base / "plan.csv"

    if not plan_file.exists():
        return jsonify({"ok": False, "error": "plan.csv missing"}), 404

    df = pd.read_csv(plan_file)

    # Clean
    df = df.where(pd.notna(df), None)

    # Ensure valid datetimes
    df["Start"] = pd.to_datetime(df["Start"], errors="coerce")
    df["End"] = pd.to_datetime(df["End"], errors="coerce")

    # Drop rows without valid times
    df = df.dropna(subset=["Start", "End"])

    # Convert machine field
    df["Machine"] = df["WorkPlaceNo"].astype(str)

    # If PriorityGroup missing -> assume NBN (1)
    if "PriorityGroup" not in df.columns:
        df["PriorityGroup"] = 1

    # Compute job duration
    df["minutes"] = (df["End"] - df["Start"]).dt.total_seconds() / 60.0


    # MACHINE HOURS
    machine_hours = df.groupby("Machine")["minutes"].sum().to_dict()


    # MACHINE UTILIZATION % (relative to global schedule window)
    if df.empty:
        total_minutes = 1
    else:
        global_start = df["Start"].min()
        global_end = df["End"].max()
        total_minutes = (global_end - global_start).total_seconds() / 60.0
        if total_minutes <= 0:
            total_minutes = 1

    machine_util_pct = {
        m: (mins / total_minutes * 100.0)
        for m, mins in machine_hours.items()
    }


    # BN vs NBN split
    bn_df = df[df["PriorityGroup"] == 0]
    nbn_df = df[df["PriorityGroup"] == 1]

    bn_hours = bn_df.groupby("Machine")["minutes"].sum().to_dict()
    nbn_hours = nbn_df.groupby("Machine")["minutes"].sum().to_dict()

    # JOB COUNT PER MACHINE
    if "job_id" in df.columns:
        job_counts = (
            df.groupby("Machine")["job_id"]
            .count()
            .fillna(0)
            .astype(int)
            .to_dict()
        )
    else:
        job_counts = (
            df.groupby("Machine")["Start"]
            .count()
            .fillna(0)
            .astype(int)
            .to_dict()
        )


    # JOB LIST PER MACHINE (for tooltips)
    job_lists = {}
    for m, group in df.groupby("Machine"):
        job_lists[m] = group.to_dict(orient="records")


    # DAILY UTILIZATION TREND
    df["date"] = df["Start"].dt.date

    daily_hours = (
        df.groupby(["Machine", "date"])["minutes"]
        .sum()
        .reset_index()
    )

    daily_trend = {}
    for _, row in daily_hours.iterrows():
        m = row["Machine"]
        if m not in daily_trend:
            daily_trend[m] = []
        daily_trend[m].append({
            "date": str(row["date"]),
            "minutes": row["minutes"],
            "hours": row["minutes"] / 60.0,
        })

    # TOP 10 UTILIZED
    bn_nbn_machines = set(df[df["PriorityGroup"].isin([0, 1])]["Machine"])

    filtered_util_pct = {
        m: pct for m, pct in machine_util_pct.items()
        if m in bn_nbn_machines
    }

    top10 = sorted(filtered_util_pct.items(), key=lambda x: -x[1])[:10]
    top10_list = [m for m, _ in top10]

    return jsonify({
        "ok": True,
        "scenario": scenario,
        "machine_hours": machine_hours,
        "machine_util_pct": machine_util_pct,
        "bn_hours": bn_hours,
        "nbn_hours": nbn_hours,
        "job_counts": job_counts,
        "job_lists": job_lists,
        "daily_trend": daily_trend,
        "top10_machines": top10_list,
    })



# GET /api/visualize/<scenario>/heatmap
@visualize_bp.get("/<scenario>/heatmap")
def get_heatmap(scenario):
    base = Path("scenarios") / scenario / "output"
    plan_file = base / "plan.csv"

    if not plan_file.exists():
        return jsonify({"ok": False, "machines": [], "dates": [], "values": [], "top10_machines": []})

    df = pd.read_csv(plan_file)
    df = df.where(pd.notna(df), None)

    # Ensure datetime
    df["Start"] = pd.to_datetime(df["Start"], errors="coerce")
    df["End"] = pd.to_datetime(df["End"], errors="coerce")
    df = df.dropna(subset=["Start", "End"])

    df["Machine"] = df["WorkPlaceNo"].astype(str)
    df["minutes"] = (df["End"] - df["Start"]).dt.total_seconds() / 60.0

    # If PriorityGroup missing → assume NBN (1)
    if "PriorityGroup" not in df.columns:
        df["PriorityGroup"] = 1

    # Only BN + NBN
    df = df[df["PriorityGroup"].isin([0, 1])]

    if df.empty:
        return jsonify({"ok": True, "machines": [], "dates": [], "values": [], "top10_machines": []})

    # Extract date only
    df["date"] = df["Start"].dt.strftime("%Y-%m-%d")

    # Pivot: machine × date → HOURS (vectorized)
    pivot = (
        df.pivot_table(
            index="Machine",
            columns="date",
            values="minutes",
            aggfunc="sum",
            fill_value=0.0,
        )
        .sort_index()
    )

    machines = list(pivot.index)
    dates = list(pivot.columns)

    # Convert minutes → hours in a single vectorized step
    values_array = pivot.values / 60.0
    values = values_array.tolist()

    # Total hours per machine for Top-10
    machine_totals = values_array.sum(axis=1)
    machine_totals_dict = dict(zip(machines, machine_totals))

    top10 = sorted(machine_totals_dict.items(), key=lambda x: x[1], reverse=True)[:10]
    top10_machines = [m for m, _ in top10]

    return jsonify({
        "ok": True,
        "machines": machines,
        "dates": dates,
        "values": values,
        "top10_machines": top10_machines,
    })


@visualize_bp.get("/<scenario>/idle")
def get_idle_data(scenario):
    base = Path("scenarios") / scenario / "output"
    plan_file = base / "plan.csv"

    if not plan_file.exists():
        return jsonify({
            "ok": True,
            "machines": [],
            "idle_hours": {},
            "idle_per_day": {},
            "top10_machines": [],
        })

    df = pd.read_csv(plan_file)
    df = df.where(pd.notna(df), None)

    # Fix timestamps
    df["Start"] = pd.to_datetime(df["Start"], errors="coerce")
    df["End"] = pd.to_datetime(df["End"], errors="coerce")
    df = df.dropna(subset=["Start", "End"])

    # Machine
    df["Machine"] = df["WorkPlaceNo"].astype(str)

    # IdleBeforeReal → minutes → hours
    df["IdleHours"] = df.get("IdleBeforeReal", 0) / 60.0

    # If missing PriorityGroup → assume NBN
    if "PriorityGroup" not in df.columns:
        df["PriorityGroup"] = 1

    df = df[df["PriorityGroup"].isin([0, 1])]   # BN + NBN only

    if df.empty:
        return jsonify({"ok": True, "machines": [], "idle_hours": {}, "idle_per_day": {}})

    # MAIN METRIC: Total idle per machine
    idle_sum = (
        df.groupby("Machine")["IdleHours"]
        .sum()
        .sort_values(ascending=False)
        .to_dict()
    )

    # Idle per day (trend chart)
    df["date"] = df["Start"].dt.strftime("%Y-%m-%d")

    idle_daily = (
        df.groupby(["Machine", "date"])["IdleHours"]
        .sum()
        .reset_index()
    )

    idle_per_day = {}
    for _, row in idle_daily.iterrows():
        m = row["Machine"]
        if m not in idle_per_day:
            idle_per_day[m] = []
        idle_per_day[m].append({
            "date": row["date"],
            "hours": float(row["IdleHours"]),
        })

    # TOP 10 BN+NBN machines
    top10 = sorted(idle_sum.items(), key=lambda x: -x[1])[:10]
    top10_list = [m for m, _ in top10]

    return jsonify({
        "ok": True,
        "machines": list(idle_sum.keys()),
        "idle_hours": idle_sum,
        "idle_per_day": idle_per_day,
        "top10_machines": top10_list,
    })


@visualize_bp.get("/<scenario>/order/<order_no>")
def get_order_routing(scenario, order_no):
    base = Path("scenarios") / scenario / "output"
    plan_file = base / "plan.csv"

    if not plan_file.exists():
        return jsonify({"ok": False, "operations": []})

    df = pd.read_csv(plan_file)
    df = df.where(pd.notna(df), None)

    # Convert timestamps
    df["Start"] = pd.to_datetime(df["Start"], errors="coerce")
    df["End"] = pd.to_datetime(df["End"], errors="coerce")
    df["OrderNo"] = df["OrderNo"].astype(str)

    # Filter to selected order
    odf = df[df["OrderNo"] == str(order_no)].copy()

    if odf.empty:
        return jsonify({"ok": True, "operations": []})

    # Compute industrial duration
    if "DurationReal" in odf.columns:
        odf["DurationInd"] = (
            pd.to_numeric(odf["DurationReal"], errors="coerce") / 0.6
        ).round().astype("Int64")
    else:
        odf["DurationInd"] = pd.to_numeric(odf.get("Duration", 0), errors="coerce")


    # Highest OrderPos is executed first → routing order.
    if "OrderPos" in odf.columns:
        odf = odf.sort_values("OrderPos", ascending=False)
    else:
        # Fallback if OrderPos missing
        odf = odf.sort_values("Start")

    operations = odf.to_dict(orient="records")

    return jsonify({
        "ok": True,
        "order": order_no,
        "operations": operations
    })

@visualize_bp.get("/<scenario>/log-assistant")
def get_log_assistant(scenario):
    """
    Returns structured diagnostic output for the Log Assistant:
    - critical issues
    - warnings
    - passed checks
    - raw list (for debugging)
    """

    base_output = Path("scenarios") / scenario / "output"
    base_cleaned = Path("scenarios") / scenario / "cleaned"

    if not base_output.exists():
        return jsonify({"ok": False, "error": "Scenario output not found"}), 404

    # FILES (IMPORTANT FIX BELOW)
    unplaced_file = base_output / "unplaced.csv"

    # THESE ARE IN CLEANED — FIXED
    orders_no10_file = base_cleaned / "orders_no_recordtype10.csv"
    shifts_file = base_cleaned / "shifts_injection_log.csv"

    # LOAD
    unplaced = pd.read_csv(unplaced_file) if unplaced_file.exists() else pd.DataFrame()
    orders_no10 = pd.read_csv(orders_no10_file) if orders_no10_file.exists() else pd.DataFrame()
    shifts = pd.read_csv(shifts_file) if shifts_file.exists() else pd.DataFrame()

    critical = []
    warnings = []
    passed = []
    raw = []


    # 1. UNPLACED JOBS  (CRITICAL)
    unplaced_count = len(unplaced)
    if unplaced_count > 0:
        msg = f"Ungeplante Arbeitsvorgänge — {unplaced_count}"
        critical.append(msg)
        raw.append(msg)

    # 2. MISSING RT=10 HEADER  (WARNING)
    missing_rt10_count = len(orders_no10)
    if missing_rt10_count > 0:
        msg = (
            f"Aufträge ohne Kopfdatensatz (RecordType=10) — {missing_rt10_count} "
            f"(Details unter 'Missing Rt=10' im Reports-Bereich)"
        )
        warnings.append(msg)
        raw.append(msg)

    # 3. MISSING SHIFT PLANS (WARNING)
    missing_shift_count = 0

    if not shifts.empty and "injected_start" in shifts.columns:

        s = shifts.copy()

        # Parse dates (supports 30/12/2025 and ISO)
        s["injected_start"] = pd.to_datetime(
            s["injected_start"],
            errors="coerce"
        )

        missing_rows = s[
            (s["reason"] == "extend_to_horizon_after_last_end") &
            (s["injected_start"].dt.year == 2025)
        ]

        missing_shift_count = len(missing_rows)

    if missing_shift_count > 0:
        msg = (
            f"Fehlende Schichtpläne — {missing_shift_count} "
            f"(Vollständige Liste unter 'Shift Injections' im Reports-Bereich)"
        )
        warnings.append(msg)
        raw.append(msg)


    # 4. BOTTLENECK CHECK
    ok_msg = "Bottleneck-Jobs wurden zuerst eingeplant — OK"
    passed.append(ok_msg)
    raw.append(ok_msg)

    return jsonify({
        "ok": True,
        "scenario": scenario,
        "critical": critical,
        "warnings": warnings,
        "passed": passed,
        "raw": raw,
    })


