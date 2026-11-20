"""
src/federated/fl_metrics_store.py — Federated Learning Results Persistence
==========================================================================
Provides save/load helpers for fl_results.json.

Results path: models/federated/fl_results.json
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional

from src.federated.facility_config import FL_RESULTS_PATH

logger = logging.getLogger(__name__)

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
_FL_RESULTS_ABS = _PROJECT_ROOT / FL_RESULTS_PATH


def save_fl_results(data: Dict[str, Any]) -> None:
    """Persist fl_results dict to JSON file.

    Parameters:
        data: dict containing full simulation results
    """
    _FL_RESULTS_ABS.parent.mkdir(parents=True, exist_ok=True)
    with open(_FL_RESULTS_ABS, "w") as f:
        json.dump(data, f, indent=2, default=str)
    logger.info("FL results saved to %s", _FL_RESULTS_ABS)


def load_fl_results() -> Optional[Dict[str, Any]]:
    """Load fl_results from JSON file.

    Returns:
        dict if file exists and is valid JSON, else None
    """
    if not _FL_RESULTS_ABS.exists():
        return None
    try:
        with open(_FL_RESULTS_ABS, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        logger.warning("Failed to load FL results: %s", e)
        return None


def fl_simulation_has_run() -> bool:
    """Return True if fl_results.json exists and contains data."""
    data = load_fl_results()
    return data is not None and "simulation_timestamp" in data
