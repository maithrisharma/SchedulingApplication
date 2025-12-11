from pathlib import Path
import pandas as pd

# Constants
GRACE_DAYS        = 2
INDUSTRIAL_FACTOR = 0.6
NOW               = pd.Timestamp.now().floor("min")

SCHEDULE_RT = {60, 115}
ORDER_RT    = 10

DEFAULT_WEIGHTS = {
    "w_has_ddl":        1000.0,
    "w_priority":        150.0,
    "w_orderstate":       10.0,
    "w_cont":              8.0,
    "w_ddl_minutes":       1.0,
    "w_lateness":         12.0,
    "w_duration_late":     0.25,
    "w_spt_near":          0.06,
    "w_earliest":          0.5,
    "w_duration":          0.02,
    "w_orderpos":          0.005,
}

SA_ENABLED   = True
SA_ITERS     = 45
SA_INIT_TEMP = 1.0
SA_COOLING   = 0.95
SA_STEP_SCALE= 0.25
SA_SEED      = 42

INCLUDE_NON_EFFECTIVE_IN_ONTIME = True
