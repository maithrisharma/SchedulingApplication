import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from pathlib import Path

BUF_AFTER_DAYS = 14
INDUSTRIAL_FACTOR = 0.6  # industrial → real (100 industrial = 60 real)


#HELPER FUNCTIONS
def split_hhmm(val):
    try:
        n = int(val)
    except Exception:
        return None, None, None
    sign = -1 if n < 0 else 1
    n_abs = abs(n)
    hh, mm = divmod(n_abs, 100)
    if not (0 <= hh <= 23 and 0 <= mm <= 59):
        return None, None, None
    return sign, hh, mm


def dt_for(day, sign, hh, mm):
    if sign is None or pd.isna(day):
        return pd.NaT
    if sign >= 0:
        return datetime(day.year, day.month, day.day, int(hh), int(mm))
    else:
        base = day - timedelta(days=1)
        neg_minutes = int(hh) * 60 + int(mm)
        mins = (24 * 60) - neg_minutes
        h2, m2 = divmod(mins, 60)
        return datetime(base.year, base.month, base.day, int(h2), int(m2))


def is_zero(x):
    try:
        return int(x) == 0
    except Exception:
        return False


def hhmm_to_minutes_ta(x):
    try:
        n = int(x)
    except Exception:
        return None
    if n < 0:
        return None
    if n in (0, 1):
        return n
    if n % 100 != 0:
        return None
    return (n // 100) * 60


def log_injection(log_list, wp, s, e, reason):
    """Record an injected or extended 24/7 window."""
    log_list.append({
        "WorkPlaceNo": wp,
        "injected_start": pd.to_datetime(s),
        "injected_end": pd.to_datetime(e),
        "injected_minutes":
            int((pd.to_datetime(e) - pd.to_datetime(s)).total_seconds() // 60),
        "reason": reason
    })



#MAIN CLEAN FUNCTION
def clean_shifts(input_file_path: str,
                 output_dir: str,
                 unlimited_csv_path: str = None) -> dict:
    """
    Clean shifts.xlsx or shifts.csv into:
        - shifts_clean.csv
        - shifts_injection_log.csv
    """

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    OUT_SHIFTS = output_dir / "shifts_clean.csv"
    OUT_LOG    = output_dir / "shifts_injection_log.csv"

    # LOAD INPUT (supports CSV or Excel)
    path_lower = str(input_file_path).lower()

    if path_lower.endswith(".csv"):
        shifts = pd.read_csv(input_file_path)
    else:
        shifts = pd.read_excel(input_file_path)

    print("Shifts shape:", shifts.shape)
    print(shifts.info())


    # BASIC NORMALIZATION
    shifts["WorkPlaceNo"] = shifts.get("WorkPlaceNo", np.nan).astype(str).str.strip()
    shifts["DateStart_parsed"] = pd.to_datetime(
        shifts["DateStart"], errors="coerce"
    ).dt.normalize()

    rows = []
    dropped_zero = 0
    fixed_overnight = 0
    neg_start_seen = 0
    neg_end_seen = 0


    # CONVERT EACH SHIFT ROW
    for _, r in shifts.iterrows():
        d = r["DateStart_parsed"]
        if pd.isna(d):
            continue

        ts = r.get("TimeStart", np.nan)
        te = r.get("TimeEnd",   np.nan)
        ta = r.get("TimeAvailable", np.nan)

        # Drop true zero-capacity windows
        if is_zero(ta):
            dropped_zero += 1
            continue

        s_sign, s_h, s_m = split_hhmm(ts)
        e_sign, e_h, e_m = split_hhmm(te)

        start_dt = dt_for(d, s_sign, s_h, s_m)
        end_dt   = dt_for(d, e_sign, e_h, e_m)

        if s_sign == -1: neg_start_seen += 1
        if e_sign == -1: neg_end_seen   += 1

        # apply TimeAvailable if valid
        avail_min = hhmm_to_minutes_ta(ta)
        if (avail_min is not None) and pd.notna(start_dt):
            end_dt = start_dt + timedelta(minutes=int(avail_min))
        else:
            # same-day cross-midnight fix
            if (s_sign is not None and e_sign is not None
                and s_sign >= 0 and e_sign >= 0
                and pd.notna(start_dt) and pd.notna(end_dt)
                and end_dt <= start_dt):
                end_dt = end_dt + timedelta(days=1)
                fixed_overnight += 1

        rows.append({
            "WorkPlaceNo": r["WorkPlaceNo"],
            "start": start_dt,
            "end": end_dt,
            "DateStart": r.get("DateStart"),
            "TimeStart": ts,
            "TimeEnd": te,
            "TimeAvailable": ta,
            "_StartSign": s_sign,
            "_EndSign": e_sign,
        })

    shifts_clean = pd.DataFrame(rows)


    # DROP INVALID WINDOWS WITHOUT TA FIX
    bad_same_day = (
        (shifts_clean["_StartSign"] >= 0) &
        (shifts_clean["_EndSign"]   >= 0) &
        shifts_clean["start"].notna() &
        shifts_clean["end"].notna() &
        (shifts_clean["end"] < shifts_clean["start"]) &
        shifts_clean["TimeAvailable"].isna()
    )

    if bad_same_day.any():
        print("Dropping invalid same-day windows:", int(bad_same_day.sum()))

    shifts_clean = shifts_clean.loc[~bad_same_day].copy()


    # BASIC SORT
    shifts_clean = shifts_clean.sort_values(
        ["WorkPlaceNo", "start"], na_position="last"
    ).reset_index(drop=True)

    print("Dropped zero-capacity rows:", dropped_zero)
    print("Rows with negative start:", neg_start_seen)
    print("Rows with negative end:",   neg_end_seen)


    # DETERMINE HORIZON
    if shifts_clean["start"].notna().any():
        earliest_shift_start = shifts_clean["start"].min().normalize()
    else:
        earliest_shift_start = pd.Timestamp("2025-08-31")

    candidates_max = []

    if shifts_clean["end"].notna().any():
        candidates_max.append(shifts_clean["end"].max())

    if candidates_max:
        horizon_end = max(candidates_max)
    else:
        horizon_end = earliest_shift_start + pd.Timedelta(days=30)

    print("Earliest shift start:", earliest_shift_start)
    print("Horizon end:", horizon_end)

    # INJECTION LOG STORAGE
    injection_log_rows = []


    # UNLIMITED MACHINES HANDLING
    if unlimited_csv_path is None:
        unlimited_csv_path = str(output_dir / "unlimited_machines.csv")

    try:
        unl = pd.read_csv(unlimited_csv_path)
        unlimited_machines = set(unl["WorkPlaceNo"].astype(str).str.strip())
        unlimited_machines = {wp for wp in unlimited_machines if wp.upper() != "TBA"}

        have_rows = set(
            shifts_clean.loc[
                shifts_clean["WorkPlaceNo"].isin(unlimited_machines),
                "WorkPlaceNo"
            ].unique()
        )

        missing_unlimited = sorted(unlimited_machines - have_rows)

        if missing_unlimited:
            print(f"Injecting 24/7 windows for unlimited machines with NO shifts: {len(missing_unlimited)}")
            ext_rows = []
            for wp in missing_unlimited:
                s = earliest_shift_start
                e = horizon_end
                ext_rows.append({
                    "WorkPlaceNo": wp,
                    "start": s,
                    "end": e,
                    "DateStart": pd.NaT,
                    "TimeStart": 0,
                    "TimeEnd": 0,
                    "TimeAvailable": 1
                })
                log_injection(injection_log_rows, wp, s, e, "unlimited_missing_no_shifts")

            shifts_clean = pd.concat([shifts_clean, pd.DataFrame(ext_rows)],
                                     ignore_index=True)

    except Exception:
        print("WARNING: unlimited_machines.csv not found; skipping unlimited handling.")


    # EXTEND MACHINES TO HORIZON END
    if shifts_clean["end"].notna().any():
        last_end = shifts_clean.groupby("WorkPlaceNo", as_index=False)["end"].max()
        last_end = last_end.rename(columns={"end": "last_end"})

        needs_extension = last_end[last_end["last_end"] < horizon_end]

        if not needs_extension.empty:
            print(f"Extending {len(needs_extension)} machines to horizon end.")
            ext2_rows = []
            for _, rr in needs_extension.iterrows():
                wp = rr["WorkPlaceNo"]
                s  = rr["last_end"]
                e  = horizon_end
                ext2_rows.append({
                    "WorkPlaceNo": wp,
                    "start": s,
                    "end": e,
                    "DateStart": pd.NaT,
                    "TimeStart": 0,
                    "TimeEnd": 0,
                    "TimeAvailable": 1
                })
                log_injection(injection_log_rows, wp, s, e, "extend_to_horizon_after_last_end")

            shifts_clean = pd.concat([shifts_clean, pd.DataFrame(ext2_rows)],
                                     ignore_index=True)


    # SAVE OUTPUTS
    shifts_clean = shifts_clean.drop(columns=["_StartSign", "_EndSign"])
    shifts_clean = shifts_clean.sort_values(
        ["WorkPlaceNo", "start"]
    ).reset_index(drop=True)

    shifts_clean.to_csv(OUT_SHIFTS, index=False, date_format="%Y-%m-%d %H:%M:%S")
    print(f"Saved shifts_clean → {OUT_SHIFTS}")

    log_df = pd.DataFrame(injection_log_rows)
    if not log_df.empty:
        log_df = log_df.sort_values(
            ["WorkPlaceNo", "injected_start"]
        ).reset_index(drop=True)

    log_df.to_csv(OUT_LOG, index=False, date_format="%Y-%m-%d %H:%M:%S")
    print(f"Saved shifts injection log → {OUT_LOG}")

    return {
        "shifts_clean": str(OUT_SHIFTS),
        "injection_log": str(OUT_LOG)
    }
