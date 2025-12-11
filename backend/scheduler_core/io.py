import pandas as pd
from .config import (
    SCHEDULE_RT,
    ORDER_RT,
    NOW,
)
import re


def normalize_wp(s):
    if pd.isna(s):
        return s
    t = str(s).strip()
    # normalize weird dash/unicode dashes to '-'
    return (
        t.replace("\u2010", "-")
        .replace("\u2011", "-")
        .replace("\u2012", "-")
        .replace("\u2013", "-")
        .replace("\u2014", "-")
        .replace("\u2015", "-")
        .replace("–", "-")
        .replace("—", "-")
    )


def load_cleaned_inputs(jobs_path, shifts_path, unlimited_path, outsourcing_path):

    print("Loading CSVs…")
    jobs = pd.read_csv(jobs_path)
    shifts = pd.read_csv(shifts_path)

    # normalize types
    jobs["job_id"] = jobs["job_id"].astype(str).str.strip()
    jobs["OrderNo"] = jobs["OrderNo"].astype(str).str.strip()
    jobs["WorkPlaceNo"] = (
        jobs["WorkPlaceNo"].astype(str).str.strip().map(normalize_wp).str.upper()
    )
    jobs["OrderPos"] = (
        pd.to_numeric(jobs.get("OrderPos"), errors="coerce").fillna(-1).astype(int)
    )

    for col in [
        "OrderPos",
        "duration_min",
        "buffer_min",
        "PriorityGroup",
        "Orderstate",
        "RecordType",
    ]:
        jobs[col] = (
            pd.to_numeric(jobs.get(col, 0), errors="coerce").fillna(0).astype(int)
        )

    # dates
    for c in ["effective_deadline", "LatestDateHead", "DateStart"]:
        if c in jobs.columns:
            jobs[c] = pd.to_datetime(jobs[c], errors="coerce")

    if "OpNeedsUpstream" in jobs.columns:
        jobs["OpNeedsUpstream"] = (
            jobs["OpNeedsUpstream"]
            .astype(str)
            .str.upper()
            .isin(["1", "TRUE", "T", "Y", "YES"])
        )
    else:
        jobs["OpNeedsUpstream"] = False

    if "OpUpstreamOrders" not in jobs.columns:
        jobs["OpUpstreamOrders"] = ""

    # keep 10/60/115 (10 only for headers)
    jobs = jobs.loc[jobs["RecordType"].isin({ORDER_RT, *SCHEDULE_RT})].copy()

    # pre-scheduling counters (eligible ops = 60/115)
    eligible_ops = int(jobs.loc[jobs["RecordType"].isin(SCHEDULE_RT)].shape[0])

    ops_mask = jobs["RecordType"].isin(SCHEDULE_RT) & jobs["effective_deadline"].notna()
    already_late_ops = int(
        (jobs.loc[ops_mask, "effective_deadline"] < NOW).sum()
    )

    ord_mask = (
        (jobs["RecordType"] == ORDER_RT)
        & jobs["LatestDateHead"].notna()
        & (jobs["LatestDateHead"].dt.year >= 2025)
    )
    already_late_orders = int(
        jobs.loc[ord_mask & (jobs["LatestDateHead"] < NOW), "OrderNo"].nunique()
    )

    # shifts
    for c in ["WorkPlaceNo", "start", "end"]:
        if c not in shifts.columns:
            raise ValueError(f"shifts_clean.csv missing column: {c}")

    shifts["WorkPlaceNo"] = (
        shifts["WorkPlaceNo"].astype(str).str.strip().map(normalize_wp)
    )
    shifts["start"] = pd.to_datetime(shifts["start"], errors="coerce")
    shifts["end"] = pd.to_datetime(shifts["end"], errors="coerce")
    shifts = shifts.loc[
        (shifts["start"].notna())
        & (shifts["end"].notna())
        & (shifts["end"] > shifts["start"])
    ]

    # debug: hidden/dash variants
    bad = shifts.loc[
        shifts["WorkPlaceNo"]
        .astype(str)
        .str.contains(r"[\u200B-\u200D\uFEFF]", regex=True)
        | shifts["WorkPlaceNo"]
        .astype(str)
        .str.contains(r"[\u2010-\u2015–—‒]", regex=True)
    ]
    print("hidden/dash variants after normalization:", bad.shape[0])

    # machine sets (now from explicit files)
    try:
        unlimited = set(
            pd.read_csv(unlimited_path)["WorkPlaceNo"]
            .astype(str)
            .str.strip()
            .unique()
        )
        unlimited = {normalize_wp(wp) for wp in unlimited if str(wp).strip()}
        unlimited = {wp for wp in unlimited if wp.upper() != "TBA"}
    except Exception:
        unlimited = set()

    try:
        outsourcing = set(
            pd.read_csv(outsourcing_path)["WorkPlaceNo"]
            .astype(str)
            .str.strip()
            .unique()
        )
        outsourcing = {normalize_wp(wp) for wp in outsourcing if str(wp).strip()}
    except Exception:
        outsourcing = set()

    return (
        jobs,
        shifts,
        unlimited,
        outsourcing,
        already_late_ops,
        already_late_orders,
        eligible_ops,
    )
