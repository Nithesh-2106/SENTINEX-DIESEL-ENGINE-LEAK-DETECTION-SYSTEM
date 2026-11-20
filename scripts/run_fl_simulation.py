"""
scripts/run_fl_simulation.py
============================
Standalone script that runs the federated learning simulation.
Launched by the API as a detached subprocess — completely independent
of uvicorn's lifecycle.

Usage (direct):
    python3 scripts/run_fl_simulation.py --rounds 3

Usage (via API POST /federated/run):
    The API calls this script via subprocess.Popen so the simulation
    survives uvicorn --reload restarts.
"""

import argparse
import logging
import os
import sys
from pathlib import Path

# ── macOS OpenMP fork-safety — MUST be set before any ML library imports ─────
os.environ.setdefault("OBJC_DISABLE_INITIALIZE_FORK_SAFETY", "YES")
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

# ── Path setup ───────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# ── Logging ───────────────────────────────────────────────────────────────────
log_path = PROJECT_ROOT / "models" / "federated" / "simulation.log"
log_path.parent.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(str(log_path), mode="w"),
    ],
)
logger = logging.getLogger("fl_runner")

# ── Lock file ─────────────────────────────────────────────────────────────────
LOCK_FILE = PROJECT_ROOT / "models" / "federated" / "fl_running.lock"


def write_lock():
    LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
    LOCK_FILE.write_text(str(os.getpid()))


def remove_lock():
    if LOCK_FILE.exists():
        LOCK_FILE.unlink()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--rounds", type=int, default=3)
    args = parser.parse_args()

    write_lock()
    logger.info("FL simulation process started (PID %d)", os.getpid())

    try:
        from src.federated.simulation import run_federated_simulation
        run_federated_simulation(num_rounds=args.rounds)
        logger.info("FL simulation completed successfully.")
    except Exception as exc:
        logger.error("FL simulation FAILED: %s", exc, exc_info=True)
        sys.exit(1)
    finally:
        remove_lock()
        logger.info("Lock file removed.")
