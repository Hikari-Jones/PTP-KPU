"""Install hook: fetch the model weights while `pip install` runs.

pip executes this file when it installs the package (see `-e ./kirana-llm` in
backend/requirements.txt), so the model is downloaded as part of setting up the
virtual environment. It is stored once per user (see MODEL_DIR in
kirana_llm/config.py), so re-running pip is a no-op. If it fails (offline, etc.) the install still succeeds and the
model is fetched on first use instead.

Set KIRANA_SKIP_MODEL_DOWNLOAD=1 to skip the download at install time.
"""

import os
import sys
from pathlib import Path

from setuptools import setup

sys.path.insert(0, str(Path(__file__).parent))


def _fetch_model() -> None:
    if os.environ.get("KIRANA_SKIP_MODEL_DOWNLOAD") == "1":
        return
    try:
        from kirana_llm.model import ensure_model

        print(f"[kirana-llm] model ready at {ensure_model()}", file=sys.stderr)
    except Exception as exc:  # never break `pip install` because of the download
        print(
            f"[kirana-llm] model download skipped ({exc}); "
            "it will be downloaded on first use.",
            file=sys.stderr,
        )


_fetch_model()
setup()
