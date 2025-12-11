import math
import pandas as pd
from .config import ORDER_RT, INDUSTRIAL_FACTOR

def make_orders_delivery_csv(plan_df, jobs, out_csv):
    cols = ["OrderNo","SupposedDeliveryDate","DeliveryAfterScheduling","DaysLate"]
    if plan_df.empty:
        pd.DataFrame(columns=cols).to_csv(out_csv, index=False, date_format="%Y-%m-%d %H:%M:%S")
        return

    ops = plan_df.copy()
    if "BufferReal" not in ops.columns:
        ops["BufferReal"] = 0

    ops_sorted = ops.sort_values(["OrderNo","OrderPos","End"])
    idx = ops_sorted.groupby("OrderNo")["OrderPos"].idxmin()
    heads = ops_sorted.loc[idx.values].copy()

    heads["DeliveryAfterScheduling"] = heads["End"] + pd.to_timedelta(heads["BufferReal"].fillna(0).astype(int), unit="m")

    o10 = jobs[jobs["RecordType"] == ORDER_RT][["OrderNo","LatestDateHead"]].drop_duplicates("OrderNo")
    order_df = heads.merge(o10, on="OrderNo", how="left").rename(columns={"LatestDateHead":"SupposedDeliveryDate"})

    def _days_late(row):
        sd = row["SupposedDeliveryDate"]; da = row["DeliveryAfterScheduling"]
        if pd.isna(sd) or pd.isna(da): return pd.NA
        if pd.to_datetime(sd, errors="coerce").year < 2025: return 0
        diff = (da - sd).total_seconds()
        return max(0, math.ceil(diff / 86400.0))

    order_df["DaysLate"] = order_df.apply(_days_late, axis=1)
    out = order_df[cols].sort_values("OrderNo")
    out.to_csv(out_csv, index=False, date_format="%Y-%m-%d %H:%M:%S")
