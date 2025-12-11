# backend/scheduler_state.py
from threading import Lock

# Status dictionaries (per-scenario)
active_jobs = {}       # scenario -> True/False (scheduler running)
progress = {}          # scenario -> int (0–100)
cancel_flag = {}       # scenario -> True/False
errors = {}            # scenario -> str or None

# Optional: track thread references (useful for debugging)
threads = {}           # scenario -> Thread object

# Locks
_locks = {}            # scenario -> Lock
_global_lock = Lock()


def get_lock(scenario: str) -> Lock:
    """Return (or create) a reusable per-scenario lock."""
    with _global_lock:
        if scenario not in _locks:
            _locks[scenario] = Lock()
        return _locks[scenario]


def init_scenario_state(scenario: str):
    """Reset state for a new run."""
    active_jobs[scenario] = False
    cancel_flag[scenario] = False
    progress[scenario] = 0
    errors[scenario] = None
