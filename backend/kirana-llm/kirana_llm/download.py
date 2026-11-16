"""Fetch the model weights from Hugging Face using only the standard library.

Kept dependency-free on purpose: this runs inside `pip install` (see setup.py),
where nothing but Python itself is guaranteed to be available.
"""

import os
import sys
import threading
import urllib.error
import urllib.request

from . import config

_CHUNK = 1024 * 1024
_download_lock = threading.Lock()


def model_file() -> str:
    """Where the weights live on disk (whether or not they are there yet)."""
    if config.MODEL_PATH:
        return config.MODEL_PATH
    name = f"{config.MODEL_REPO.replace('/', '--')}--{config.MODEL_FILE}"
    return os.path.join(config.MODEL_DIR, name)


def _fetch(url: str, part: str, progress: bool) -> None:
    have = os.path.getsize(part) if os.path.exists(part) else 0
    headers = {"User-Agent": "kirana-llm"}
    if have:
        headers["Range"] = f"bytes={have}-"  # resume an interrupted download

    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=60) as response:
        if have and response.status != 206:
            have = 0  # server ignored the range: start over
        total = have + int(response.headers.get("Content-Length") or 0)
        next_report = 0.0
        with open(part, "ab" if have else "wb") as out:
            while True:
                chunk = response.read(_CHUNK)
                if not chunk:
                    break
                out.write(chunk)
                have += len(chunk)
                if progress and total and have / total >= next_report:
                    print(
                        f"[kirana-llm] downloading model: {have / total:4.0%} "
                        f"of {total / 1e9:.1f} GB",
                        file=sys.stderr,
                        flush=True,
                    )
                    next_report += 0.1
    if total and have != total:
        raise OSError(f"download incomplete ({have} of {total} bytes); run again to resume")


def download(progress: bool = True) -> str:
    """Download the weights if they are not on disk yet; return their path."""
    target = model_file()
    if os.path.isfile(target):
        return target
    if config.MODEL_PATH:
        raise FileNotFoundError(f"KIRANA_MODEL_PATH does not exist: {target}")

    url = (
        f"{config.HF_ENDPOINT}/{config.MODEL_REPO}/resolve/"
        f"{config.MODEL_REVISION}/{config.MODEL_FILE}"
    )
    part = target + ".part"
    with _download_lock:
        if os.path.isfile(target):
            return target
        os.makedirs(os.path.dirname(target), exist_ok=True)
        try:
            _fetch(url, part, progress)
        except urllib.error.HTTPError as exc:
            if exc.code != 416:  # 416 = stale partial file; retry from scratch
                raise
            os.remove(part)
            _fetch(url, part, progress)
        os.replace(part, target)
    return target
