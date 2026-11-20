"""Backward-compatible entry point — delegates to src/generate_testcell_data.py."""

from pathlib import Path
import runpy

if __name__ == "__main__":
    runpy.run_path(
        str(Path(__file__).resolve().parent / "src" / "generate_testcell_data.py"),
        run_name="__main__",
    )
