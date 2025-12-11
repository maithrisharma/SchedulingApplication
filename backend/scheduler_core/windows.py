import pandas as pd
from .config import NOW
from .io import normalize_wp

def clamp_windows_to_now(shifts, now_ts=NOW):
    s = shifts.loc[~(shifts["end"] <= now_ts)].copy()
    overlap = (s["start"] < now_ts) & (s["end"] > now_ts)
    s.loc[overlap, "start"] = now_ts
    s = s.sort_values(["WorkPlaceNo","start"]).reset_index(drop=True)
    return s

def merge_overlaps_per_machine(shifts_df):
    out = []
    for wp, g in shifts_df.groupby("WorkPlaceNo", sort=False):
        t = g.sort_values("start")[["WorkPlaceNo","start","end"]].to_numpy()
        if len(t) == 0:
            continue
        cur_wp, cur_s, cur_e = t[0][0], t[0][1], t[0][2]
        for _, s, e in t[1:]:
            if s <= cur_e:
                cur_e = max(cur_e, e)
            else:
                out.append((cur_wp, cur_s, cur_e))
                cur_s, cur_e = s, e
        out.append((cur_wp, cur_s, cur_e))
    return pd.DataFrame(out, columns=["WorkPlaceNo","start","end"])

def build_windows(shifts):
    #hard normalize machine codes here
    sh = shifts.copy()
    sh["WorkPlaceNo"] = (
        sh["WorkPlaceNo"].astype(str)
        .map(normalize_wp)
        .str.replace(r"[\u200B-\u200D\uFEFF]", "", regex=True)
        .str.strip()
        .str.upper()
    )

    sh = clamp_windows_to_now(sh)
    sh = merge_overlaps_per_machine(sh)
    sh["cursor"] = sh["start"]
    sh = sh.sort_values(["WorkPlaceNo","start"]).reset_index(drop=True)

    # Ensure strictly positive windows
    sh = sh.loc[sh["end"] > sh["start"]].copy()

    by_wp = {wp: g.reset_index(drop=True) for wp, g in sh.groupby("WorkPlaceNo")}
    earliest = sh["start"].min() if len(sh) else NOW
    first_start_by_wp = sh.groupby("WorkPlaceNo")["start"].min()

    return by_wp, earliest, first_start_by_wp