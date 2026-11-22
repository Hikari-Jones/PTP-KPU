"""Configuration, read from environment variables (and a .env file if present)."""

import os

try:
    from dotenv import find_dotenv, load_dotenv

    load_dotenv(find_dotenv(usecwd=True))
except ImportError:  # e.g. during `pip install`, before dependencies exist
    pass


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name) or default)
    except ValueError:
        return default


# Hugging Face repo + file of the GGUF weights.
MODEL_REPO = os.environ.get("KIRANA_MODEL_REPO", "Qwen/Qwen2.5-3B-Instruct-GGUF")
MODEL_FILE = os.environ.get("KIRANA_MODEL_FILE", "qwen2.5-3b-instruct-q4_k_m.gguf")

MODEL_REVISION = os.environ.get("KIRANA_MODEL_REVISION", "main")
HF_ENDPOINT = os.environ.get("HF_ENDPOINT", "https://huggingface.co").rstrip("/")

# Optional: path to a local .gguf file. If set, nothing is downloaded.
MODEL_PATH = os.environ.get("KIRANA_MODEL_PATH") or None

# Folder the downloaded weights are kept in (shared by every virtualenv).
MODEL_DIR = os.environ.get("KIRANA_MODEL_DIR") or os.path.join(
    os.environ.get("LOCALAPPDATA") or os.path.join(os.path.expanduser("~"), ".cache"),
    "kirana-llm",
    "models",
)

# Context window in tokens (prompt + answer). 8192 costs roughly 300 MB of RAM
# on top of the weights and leaves room for chat history and database results.
N_CTX = _int("KIRANA_N_CTX", 8192)
# Tokens evaluated per batch while reading the prompt.
N_BATCH = _int("KIRANA_N_BATCH", 512)
# 0 = CPU only, -1 = offload everything to GPU (needs a GPU build of llama-cpp).
N_GPU_LAYERS = _int("KIRANA_N_GPU_LAYERS", 0)
# 0 = automatic: physical cores for generation, all logical cores for the prompt.
N_THREADS = _int("KIRANA_N_THREADS", 0) or None
N_THREADS_BATCH = _int("KIRANA_N_THREADS_BATCH", 0) or None
# Upper bound on the length of one answer, in tokens.
MAX_TOKENS = _int("KIRANA_MAX_TOKENS", 1024)
# Free the model's memory (about 3.5 GB with the default model) after this many
# minutes without use; the next question loads it again in a few seconds.
# 0 = keep it loaded until the process exits.
IDLE_UNLOAD_MINUTES = _int("KIRANA_IDLE_UNLOAD_MINUTES", 15)

MODEL_NAME = os.path.basename(MODEL_PATH) if MODEL_PATH else MODEL_FILE
