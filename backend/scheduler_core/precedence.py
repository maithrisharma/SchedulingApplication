import pandas as pd
from .config import SCHEDULE_RT

def _bool_scalar(val) -> bool:
    if pd.isna(val):
        return False
    s = str(val).strip().upper()
    if s in {"TRUE", "1", "X", "YES", "JA"}:
        return True
    try:
        return float(s) != 0.0
    except Exception:
        return False

def build_dependency_graph(jobs: pd.DataFrame):
    """
    Build multi-predecessor dependencies:
      1) Intra-order chain in DESCENDING OrderPos:
         op(OrderPos=11) -> op(10) -> ... -> op(1)
      2) Material edges:
         If a row has OpNeedsUpstream==True, for each order in OpUpstreamOrders,
         add an edge: upstream_lowest_schedulable_op -> this_op.

    Returns:
      pred_sets: dict[jid] -> set of predecessor jids
      succ_multi: dict[jid] -> set of successor jids
    """
    base = jobs[jobs["RecordType"].isin(SCHEDULE_RT)].copy()
    #numeric for correct descending sort
    base["OrderPos"] = pd.to_numeric(base["OrderPos"], errors="coerce")

    pred_sets = {}
    succ_multi = {}

    def _add_edge(a, b):
        if a is None or b is None:
            return
        pred_sets.setdefault(b, set()).add(a)
        succ_multi.setdefault(a, set()).add(b)
        pred_sets.setdefault(a, set())
        succ_multi.setdefault(b, set())

    #1) Intra-order edges (DESC OrderPos)
    for _, grp in base.groupby("OrderNo", sort=False):
        g = grp.sort_values("OrderPos", ascending=False)
        prev = None
        for _, r in g.iterrows():
            jid = str(r["job_id"]).strip()
            pred_sets.setdefault(jid, set())
            succ_multi.setdefault(jid, set())
            if prev is not None:
                # higher OrderPos must finish before lower OrderPos
                _add_edge(prev, jid)
            prev = jid

    # 2) Material edges to upstream orders’ LOWEST schedulable op
    # lowest per upstream order (first schedulable op in that order)
    idx_min = base.groupby("OrderNo")["OrderPos"].idxmin()
    lowest_by_order = dict(zip(base.loc[idx_min, "OrderNo"], base.loc[idx_min, "job_id"]))

    #Orders that have an effective deadline (>=2025)
    order_has_effective = {}
    heads = jobs[jobs["RecordType"] == 10][["OrderNo", "LatestDateHead"]].drop_duplicates("OrderNo")
    heads["LatestDateHead"] = pd.to_datetime(heads["LatestDateHead"], errors="coerce")
    for _, hr in heads.iterrows():
        dt = hr["LatestDateHead"]
        order_has_effective[hr["OrderNo"]] = (pd.notna(dt) and dt.year >= 2025)

    #boolean mask for OpNeedsUpstream
    if "OpNeedsUpstream" in base.columns:
        mask_need = base["OpNeedsUpstream"].apply(_bool_scalar)
    else:
        mask_need = pd.Series(False, index=base.index)

    need = base[mask_need]

    for _, r in need.iterrows():
        this_jid = str(r["job_id"]).strip()
        ups_raw = r.get("OpUpstreamOrders")
        ups = str(ups_raw or "").strip()
        if not ups:
            continue
        for u in ups.split(";"):
            u = u.strip()
            if not u:
                continue
            #If upstream order has no schedulable op (eg header-only/purchased) = nothing to wait for
            up_low = lowest_by_order.get(u)
            if up_low is None:
                continue
            #Exception: if upstream order has NO effective deadline, don't block downstream
            if not order_has_effective.get(u, False):
                continue
            _add_edge(up_low, this_jid)

    return pred_sets, succ_multi