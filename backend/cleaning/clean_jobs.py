import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from pathlib import Path



#GLOBAL CONSTANTS
INDUSTRIAL_FACTOR = 0.6   # 100 industrial mins => 60 real mins
UNLIMITED_EXTRA = {"AP0031"}      # always unlimited even if shifts present
FORCE_OUTSOURCING = {"AP0031"}    # always outsourcing
BUF_AFTER_DAYS = 14

# "german"  = 1.234,56
# "intl"    = 1,234.56
# "auto"    = smart detection
NUM_FORMAT = "auto"



#HELPER FUNCTIONS

def parse_number_german(x):
    if pd.isna(x):
        return np.nan
    if isinstance(x, (int, float, np.number)):
        return float(x)
    s = str(x).strip()
    if s == "":
        return np.nan
    s = s.replace(".", "")      # thousands sep
    s = s.replace(",", ".")     # decimal comma
    try:
        return float(s)
    except Exception:
        return np.nan


def parse_number_intl(x):
    if pd.isna(x):
        return np.nan
    if isinstance(x, (int, float, np.number)):
        return float(x)
    s = str(x).strip().replace(",", "")  # remove thousands
    if s == "":
        return np.nan
    try:
        return float(s)
    except Exception:
        return np.nan


def parse_number_auto(x):
    """Decide automatically between German-style or Intl-style numbers."""
    if pd.isna(x):
        return np.nan
    if isinstance(x, (int, float, np.number)):
        return float(x)

    s = str(x).strip()
    if s == "":
        return np.nan

    has_dot = "." in s
    has_com = "," in s

    if has_com and not has_dot:
        # German decimal comma
        try:
            return float(s.replace(",", "."))
        except Exception:
            return np.nan

    if has_dot and has_com:
        # decide by last occurrence
        if s.rfind(",") > s.rfind("."):
            # German: 1.234,56
            try:
                return float(s.replace(".", "").replace(",", "."))
            except Exception:
                return np.nan
        else:
            # Intl: 1,234.56
            try:
                return float(s.replace(",", ""))
            except Exception:
                return np.nan

    # default intl
    try:
        return float(s.replace(",", ""))
    except Exception:
        return np.nan


def parse_series(series: pd.Series, mode: str) -> pd.Series:
    if mode == "german":
        return series.map(parse_number_german)
    elif mode == "intl":
        return series.map(parse_number_intl)
    elif mode == "auto":
        return series.map(parse_number_auto)
    else:
        raise ValueError("NUM_FORMAT must be 'german', 'intl', or 'auto'")


def to_boolish_flag(val):
    """Recognize X, JA, YES, TRUE, and nonzero numbers as True."""
    if pd.isna(val):
        return False
    s = str(val).strip().upper()
    if s in {"X", "JA", "YES", "TRUE"}:
        return True
    try:
        return float(s) != 0.0
    except Exception:
        return False


def normalize_wp(s):
    """Normalize unicode dashes in WorkPlaceNo."""
    if pd.isna(s):
        return s
    t = str(s).strip()
    return (
        t.replace("\u2010","-").replace("\u2011","-").replace("\u2012","-")
         .replace("\u2013","-").replace("\u2014","-").replace("\u2015","-")
         .replace("–","-").replace("—","-")
    )


def parse_iso(s):
    return pd.to_datetime(s, format="%Y-%m-%d %H:%M:%S.%f", errors="coerce")


def parse_dflex(s):
    return pd.to_datetime(s, errors="coerce")


def is_nullish(x):
    return (pd.isna(x)) or (str(x).strip() == "")



#MAIN CLEAN FUNCTION
def clean_jobs(input_excel_path: str, output_dir: str) -> dict:
    """
    Clean raw jobs.xlsx using EXACT logic from your notebook.
    All outputs are written into output_dir.
    """

    # Prepare output directory
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # output file paths
    OUTPUT_JOBS  = output_dir / "jobs_clean.csv"
    OUTPUT_UNLIM = output_dir / "unlimited_machines.csv"
    OUTPUT_OUTS  = output_dir / "outsourcing_machines.csv"
    DOC_NO_RT10  = output_dir / "orders_no_recordtype10.csv"
    DOC_UNLIM_60 = output_dir / "unlimited_exceptions_recordtype60.csv"
    DOC_HDR_ONLY = output_dir / "orders_header_only.csv"


    # Load input Excel
    print("Reading Excel …")
    jobs = pd.read_excel(input_excel_path)

    # NORMALISE CORE IDS
    jobs["OrderNo"] = jobs["OrderNo"].astype(str).str.strip()
    jobs["OrderPos"] = pd.to_numeric(jobs["OrderPos"], errors="coerce")
    jobs["ItemNo"] = jobs["ItemNo"].astype(str).str.strip()
    jobs["SortPos"] = pd.to_numeric(jobs["SortPos"], errors="coerce")
    jobs["WorkPlaceNo"] = jobs["WorkPlaceNo"].astype(str).map(normalize_wp)
    jobs["WorkPlaceGroupNo"] = jobs.get("WorkPlaceGroupNo", "").astype(str).map(normalize_wp)

    jobs["LatestDateHead"] = parse_iso(jobs.get("LatestDateHead"))
    jobs["RecordType"] = pd.to_numeric(jobs.get("RecordType"), errors="coerce").fillna(0).astype(int)

    # MAP "KEINE DATEN" → WorkPlaceGroupNo
    wp_lower = jobs["WorkPlaceNo"].astype(str).str.strip().str.lower()
    mask_sched = jobs["RecordType"].isin([60, 115])
    mask_kd = wp_lower.isin({"k.d.", "k.d", "kd"})
    mask_wpg = jobs["WorkPlaceGroupNo"].notna() & (jobs["WorkPlaceGroupNo"].astype(str).str.len() > 0)
    mask_map = mask_sched & mask_kd & mask_wpg

    jobs.loc[mask_map, "WorkPlaceNo"] = jobs.loc[mask_map, "WorkPlaceGroupNo"]
    print("Mapped WorkPlaceGroupNo → WorkPlaceNo for k.D. (RT 60/115 only):", int(mask_map.sum()))


    # ORDERS MISSING RecordType=10
    orders_with_rt10 = set(jobs.loc[jobs["RecordType"] == 10, "OrderNo"])
    all_orders = set(jobs["OrderNo"])
    orders_missing_rt10 = sorted(all_orders - orders_with_rt10)

    if orders_missing_rt10:
        jobs.loc[jobs["OrderNo"].isin(orders_missing_rt10), ["OrderNo", "RecordType"]].drop_duplicates() \
            .to_csv(DOC_NO_RT10, index=False)
        print(f"Documented {len(orders_missing_rt10)} orders with no RecordType=10 → {DOC_NO_RT10}")
    else:
        print("All orders have RecordType=10.")

    # Drop all operations from orders missing RT10
    jobs = jobs[jobs["OrderNo"].isin(orders_with_rt10)].copy()
    print(f"Kept {len(jobs)} rows (orders without RecordType=10 dropped).")


    # DURATIONS
    est_ind = parse_series(jobs["DurationEstimated"], NUM_FORMAT).fillna(0.0)
    act_ind = parse_series(jobs["DurationActual"], NUM_FORMAT).fillna(0.0)

    est_real = est_ind * INDUSTRIAL_FACTOR
    act_real = act_ind * INDUSTRIAL_FACTOR

    jobs["duration_min"] = (est_real - act_real).where((est_real - act_real) > 0, 0) \
        .round().astype("Int64")

    # Ensure missing buffer columns exist
    for col in ["BufferOrder", "BufferMaschine", "BufferWaiting", "BufferTransport"]:
        if col not in jobs.columns:
            jobs[col] = 0

    buf_order = parse_series(jobs["BufferOrder"], NUM_FORMAT).fillna(0.0)
    buf_machine = parse_series(jobs["BufferMaschine"], NUM_FORMAT).fillna(0.0)
    buf_wait = parse_series(jobs["BufferWaiting"], NUM_FORMAT).fillna(0.0)
    buf_transport = parse_series(jobs["BufferTransport"], NUM_FORMAT).fillna(0.0)

    jobs["buffer_min"] = (
            (buf_order + buf_machine + buf_wait + buf_transport) * INDUSTRIAL_FACTOR
    ).round().astype("Int64")


    # DATE PARSING

    if "EventDate" in jobs.columns:
        ev = parse_iso(jobs["EventDate"])
        ev = ev.where(ev.notna(), parse_dflex(jobs["EventDate"]))
        jobs["DateStart"] = ev
    else:
        jobs["DateStart"] = parse_dflex(jobs.get("DateStart"))

    jobs["LatestStartDate"] = parse_iso(jobs.get("LatestStartDate"))

    # Remove invalid years
    for c in ["DateStart", "LatestStartDate"]:
        mask_bad = jobs[c].notna() & (jobs[c].dt.year < 2025)
        jobs.loc[mask_bad, c] = pd.NaT

    print("Dates cleaned:")
    print(" - DateStart range:", jobs["DateStart"].min(), "=>", jobs["DateStart"].max())
    print(" - LatestStartDate nulls:", int(jobs["LatestStartDate"].isna().sum()))

    jobs["LatestDateHead"] = parse_iso(jobs.get("LatestDateHead"))
    jobs["effective_deadline"] = jobs["LatestStartDate"]

    print("Effective Deadline range:", jobs["effective_deadline"].min(), "=>", jobs["effective_deadline"].max())

    # PRIORITY GROUPS (Bottleneck, Non-Bottleneck)
    jobs["IsBottleneck"] = jobs.get("BottleNeckPos").apply(
        to_boolish_flag) if "BottleNeckPos" in jobs.columns else False
    jobs["IsNonBottleneck"] = jobs.get("NonBottleNeckPos").apply(
        to_boolish_flag) if "NonBottleNeckPos" in jobs.columns else False

    jobs["PriorityGroup"] = 2
    jobs.loc[jobs["IsNonBottleneck"], "PriorityGroup"] = 1
    jobs.loc[jobs["IsBottleneck"], "PriorityGroup"] = 0

    print("PriorityGroup for 816-04 — counts:")
    print(jobs.loc[jobs["WorkPlaceNo"] == "816-04", "PriorityGroup"].value_counts(dropna=False))

    # UNLIMITED / OUTSOURCING MACHINE DETECTION
    if "BottleNeckPos" not in jobs.columns:
        jobs["BottleNeckPos"] = np.nan
    if "NonBottleNeckPos" not in jobs.columns:
        jobs["NonBottleNeckPos"] = np.nan

    both_null = jobs["BottleNeckPos"].apply(is_nullish) & jobs["NonBottleNeckPos"].apply(is_nullish)

    outsourcing_cond = (
            both_null
            & jobs.get("OutsourcingPurchaseNo").notna()
            & (pd.to_numeric(jobs.get("OutsourcingOrderRowId"), errors="coerce").fillna(0).astype(int) != 0)
    )

    outsourcing_set = set(
        jobs.loc[outsourcing_cond, "WorkPlaceNo"].dropna().astype(str).map(normalize_wp)
    ) | FORCE_OUTSOURCING

    unlimited_set = set(
        jobs.loc[both_null, "WorkPlaceNo"].dropna().astype(str).map(normalize_wp)
    )

    # Add extras
    unlimited_set |= UNLIMITED_EXTRA
    unlimited_set |= outsourcing_set
    unlimited_set = {wp for wp in unlimited_set if wp.upper() != "TBA"}

    # RecordType=60 unlimited-like cases
    is_unlim_60 = (
            jobs["RecordType"].eq(60)
            & jobs["OutsourcingPurchaseNo"].isna()
            & (pd.to_numeric(jobs.get("OutsourcingOrderRowId"), errors="coerce").fillna(0).astype(int) != 0)
            & (jobs["Orderstate"] > 3)
    )

    if is_unlim_60.any():
        jobs.loc[is_unlim_60, [
            "OrderNo", "OrderPos", "WorkPlaceNo",
            "RecordType", "OutsourcingOrderRowId",
            "OutsourcingPurchaseNo", "Orderstate"
        ]].to_csv(DOC_UNLIM_60, index=False)
        print(f"Documented {is_unlim_60.sum()} RecordType=60 ops treated as unlimited → {DOC_UNLIM_60}")

    unlimited_set |= set(jobs.loc[is_unlim_60, "WorkPlaceNo"].astype(str))

    pd.DataFrame({"WorkPlaceNo": sorted(unlimited_set)}).to_csv(OUTPUT_UNLIM, index=False)
    print(f"Saved unlimited_machines.csv with {len(unlimited_set)} rows")

    pd.DataFrame({"WorkPlaceNo": sorted(outsourcing_set)}).to_csv(OUTPUT_OUTS, index=False)
    print(f"Saved outsourcing_machines.csv with {len(outsourcing_set)} rows")


    # JOB ID & ORDERSTATE
    jobs["job_id"] = jobs["OrderNo"].astype(str).str.strip() + "-" + jobs["OrderPos"].astype(str).str.strip()

    if "Orderstate" not in jobs.columns:
        jobs["Orderstate"] = 0
    else:
        jobs["Orderstate"] = pd.to_numeric(jobs["Orderstate"], errors="coerce").fillna(0).astype(int)

    # MATERIAL FLAGS (RecordType 90)
    # Normalize PurchasedItem / ProducedItem flags
    jobs["PurchasedItem"] = pd.to_numeric(jobs.get("PurchasedItem", 0), errors="coerce").fillna(0).astype(int)
    jobs["ProducedItem"]  = pd.to_numeric(jobs.get("ProducedItem", 0), errors="coerce").fillna(0).astype(int)

    # Map ItemNo → all header (RT=10) orders producing that item
    headers_by_item = (
        jobs.loc[jobs["RecordType"] == 10, ["ItemNo", "OrderNo"]]
            .dropna()
            .groupby("ItemNo")["OrderNo"]
            .apply(lambda s: sorted(s.unique()))
            .to_dict()
    )

    # Set of producer orders (ones that have any RT=60 or RT=115 ops)
    schedulable_orders = set(jobs.loc[jobs["RecordType"].isin([60, 115]), "OrderNo"].unique())

    # Initialize material columns
    jobs["IsMaterialRT90"] = jobs["RecordType"].eq(90)
    jobs["MaterialAvailableNow"] = pd.NA
    jobs["MaterialNeedsUpstream"] = False
    jobs["UpstreamOrderNos"] = ""

    is_mat = jobs["IsMaterialRT90"]

    # Purchased material → always available now
    mask_purch_avail = is_mat & (jobs["PurchasedItem"] == 1)
    jobs.loc[mask_purch_avail, "MaterialAvailableNow"] = True
    jobs.loc[mask_purch_avail, "MaterialNeedsUpstream"] = False
    jobs.loc[mask_purch_avail, "UpstreamOrderNos"] = ""

    # Produced material → check if headers have schedulable ops
    mask_prod = is_mat & (jobs["ProducedItem"] == 1)
    print("Produced material rows (RT=90 & ProducedItem=1):", int(mask_prod.sum()))

    for idx in jobs.index[mask_prod]:
        mat_item = jobs.at[idx, "ItemNo"]
        upstream_all = headers_by_item.get(mat_item, [])
        upstream_sched = [o for o in upstream_all if o in schedulable_orders]

        if len(upstream_sched) == 0:
            jobs.at[idx, "MaterialAvailableNow"] = True
            jobs.at[idx, "MaterialNeedsUpstream"] = False
            jobs.at[idx, "UpstreamOrderNos"] = ""
        else:
            jobs.at[idx, "MaterialAvailableNow"] = False
            jobs.at[idx, "MaterialNeedsUpstream"] = True
            jobs.at[idx, "UpstreamOrderNos"] = ";".join(map(str, upstream_sched))

    # Non-material rows
    jobs.loc[~is_mat, ["MaterialAvailableNow", "MaterialNeedsUpstream", "UpstreamOrderNos"]] = [
        pd.NA, False, ""
    ]

    print("Material flags summary:")
    print(
        jobs.loc[is_mat, [
            "RecordType", "PurchasedItem", "ProducedItem",
            "MaterialAvailableNow", "MaterialNeedsUpstream"
        ]].value_counts(dropna=False)
    )


    # ATTACH MATERIAL UPSTREAM TO NEXT SCHEDULABLE OP
    jobs["OpNeedsUpstream"] = False
    jobs["OpUpstreamOrders"] = ""

    for order_no, grp in jobs.groupby("OrderNo", sort=False):
        g = grp.sort_values("OrderPos", ascending=False).copy()

        # find rows where material requires upstream production
        mat_rows = g[
            (g["RecordType"] == 90)
            & (g["ProducedItem"] == 1)
            & (g["MaterialNeedsUpstream"] == True)
        ]
        if mat_rows.empty:
            continue

        for _, r in mat_rows.iterrows():
            pos90 = r["OrderPos"]
            ups = str(r.get("UpstreamOrderNos", "") or "").strip()
            if not ups:
                continue

            # find next schedulable op below RT-90 (in DESC order)
            below = g[(g["OrderPos"] < pos90) & (g["RecordType"].isin([60, 115]))]
            if below.empty:
                continue

            target_idx = below["OrderPos"].idxmax()

            cur = str(jobs.at[target_idx, "OpUpstreamOrders"] or "").strip()
            merged = ups if not cur else (cur + ";" + ups)

            # deduplicate
            merged = ";".join(sorted(
                set([x.strip() for x in merged.split(";") if x.strip()])
            ))

            jobs.at[target_idx, "OpNeedsUpstream"] = True
            jobs.at[target_idx, "OpUpstreamOrders"] = merged


    # HEADER-ONLY ORDERS
    cnt_by_order = jobs.groupby("OrderNo").size()
    only_one_row = set(cnt_by_order[cnt_by_order == 1].index)

    header_only_orders = sorted([
        o for o in only_one_row
        if int(jobs.loc[jobs["OrderNo"] == o, "RecordType"].iloc[0]) == 10
    ])

    pd.DataFrame({"OrderNo": header_only_orders}).to_csv(DOC_HDR_ONLY, index=False)
    print(f"Saved header-only orders: {len(header_only_orders)} → {DOC_HDR_ONLY}")


    # FINAL PRUNE + SAVE jobs_clean.csv
    before = len(jobs)
    jobs = jobs.dropna(subset=["job_id", "WorkPlaceNo"]).copy()
    print(f"Dropped {before - len(jobs)} rows missing job_id or WorkPlaceNo")

    keep_cols = [
        "job_id", "OrderNo", "OrderPos", "ItemNo", "SortPos",
        "WorkPlaceNo", "WorkPlaceGroupNo",
        "duration_min", "buffer_min",
        "DateStart", "effective_deadline", "LatestDateHead",
        "PriorityGroup", "Orderstate", "RecordType",
        "PurchasedItem", "ProducedItem",
        "IsMaterialRT90", "MaterialAvailableNow", "MaterialNeedsUpstream",
        "UpstreamOrderNos",
        "OpNeedsUpstream", "OpUpstreamOrders"
    ]

    jobs[keep_cols].to_csv(
        OUTPUT_JOBS,
        index=False,
        date_format="%Y-%m-%d %H:%M:%S"
    )
    print(f"Saved {OUTPUT_JOBS}")


    # FINAL SANITY LOGS
    print("Sanity:")
    print(" - duration_min nulls:", int(jobs["duration_min"].isna().sum()))
    print(" - DateStart range:", jobs["DateStart"].min(), "→", jobs["DateStart"].max())
    print(" - PriorityGroup counts:\n", jobs["PriorityGroup"].value_counts(dropna=False).sort_index())
    print(" - Example rows:\n", jobs[keep_cols].head(5).to_string(index=False))


    # RETURN OUTPUT PATHS
    return {
        "jobs_clean": str(OUTPUT_JOBS),
        "unlimited_machines": str(OUTPUT_UNLIM),
        "outsourcing_machines": str(OUTPUT_OUTS),
        "orders_no_rt10": str(DOC_NO_RT10),
        "unlimited_exceptions_recordtype60": str(DOC_UNLIM_60),
        "header_only_orders": str(DOC_HDR_ONLY),
    }


