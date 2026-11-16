"""KIRANA local LLM. Runs in-process, standalone or from the backend.

    import kirana_llm
    print(kirana_llm.generate("Apa itu nota dinas?"))

    for piece in kirana_llm.stream_chat([{"role": "user", "content": "Halo"}]):
        print(piece, end="", flush=True)

The model is only loaded when one of these functions is called.
"""

from .config import MODEL_NAME
from .model import (
    build_messages,
    chat,
    downloaded_path,
    ensure_model,
    generate,
    get_llm,
    is_loaded,
    stream_chat,
    unload,
)

__all__ = [
    "MODEL_NAME",
    "build_messages",
    "chat",
    "downloaded_path",
    "ensure_model",
    "generate",
    "get_llm",
    "is_loaded",
    "stream_chat",
    "unload",
]
