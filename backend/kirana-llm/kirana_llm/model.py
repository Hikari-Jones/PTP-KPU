"""Lazy, in-process LLM.

Importing this module is cheap: nothing is downloaded and nothing is loaded into
memory until `generate()` / `chat()` / `stream_chat()` (or `get_llm()`) is
actually called. After the first call the model stays loaded, so later calls
skip the load and reuse the already-evaluated part of the prompt.
"""

import os
import threading
from typing import Dict, Iterator, List, Optional, Sequence

from . import config, download

Message = Dict[str, str]

_llm = None
# One lock for loading and inference: llama.cpp contexts are not thread-safe,
# so concurrent requests are answered one after another.
_lock = threading.Lock()


def downloaded_path() -> Optional[str]:
    """Path of the weights if already on disk, else None. Never downloads."""
    path = download.model_file()
    return path if os.path.isfile(path) else None


def ensure_model() -> str:
    """Return the path of the weights, downloading them if needed."""
    return download.download()


def is_loaded() -> bool:
    return _llm is not None


def get_llm():
    """Load the model into memory on first call; reuse it afterwards."""
    global _llm
    if _llm is None:
        with _lock:
            if _llm is None:
                from llama_cpp import Llama

                _llm = Llama(
                    model_path=ensure_model(),
                    n_ctx=config.N_CTX,
                    n_batch=config.N_BATCH,
                    n_gpu_layers=config.N_GPU_LAYERS,
                    n_threads=config.N_THREADS,
                    n_threads_batch=config.N_THREADS_BATCH,
                    verbose=False,
                )
    return _llm


def unload() -> None:
    """Free the model's memory. It is loaded again on the next call."""
    global _llm
    with _lock:
        _llm = None


def _count_tokens(llm, message: Message) -> int:
    text = message.get("content") or ""
    # +8 covers the role markers the chat template adds around each message.
    return len(llm.tokenize(text.encode("utf-8"), add_bos=False, special=True)) + 8


def _fit_to_context(llm, messages: Sequence[Message], max_tokens: int) -> List[Message]:
    """Drop the oldest turns until the prompt plus the answer fit in the context.

    System messages and the latest message are always kept.
    """
    kept = list(messages)
    budget = llm.n_ctx() - max_tokens - 64
    sizes = [_count_tokens(llm, m) for m in kept]
    while sum(sizes) > budget:
        for i, m in enumerate(kept[:-1]):
            if m.get("role") != "system":
                del kept[i], sizes[i]
                break
        else:
            break  # nothing left to drop
    return kept


def stream_chat(
    messages: Sequence[Message],
    *,
    temperature: float = 0.3,
    top_p: float = 0.9,
    max_tokens: Optional[int] = None,
    stop: Optional[List[str]] = None,
    cancel: Optional[threading.Event] = None,
) -> Iterator[str]:
    """Yield the answer piece by piece as it is generated.

    `messages` is [{"role": "system"|"user"|"assistant", "content": ...}, ...].
    Stop iterating (or call `.close()`) to abort generation early. `cancel` lets
    a request that was abandoned while waiting its turn skip the work entirely.
    """
    llm = get_llm()
    max_tokens = max_tokens or config.MAX_TOKENS
    with _lock:
        if cancel is not None and cancel.is_set():
            return
        stream = llm.create_chat_completion(
            messages=_fit_to_context(llm, messages, max_tokens),
            temperature=temperature,
            top_p=top_p,
            repeat_penalty=1.05,
            max_tokens=max_tokens,
            stop=stop or [],
            stream=True,
        )
        try:
            for chunk in stream:
                if cancel is not None and cancel.is_set():
                    break
                piece = chunk["choices"][0].get("delta", {}).get("content")
                if piece:
                    yield piece
        finally:
            close = getattr(stream, "close", None)
            if close:
                close()


def chat(messages: Sequence[Message], **options) -> str:
    """Run a chat completion and return the whole answer."""
    return "".join(stream_chat(messages, **options)).strip()


def build_messages(
    prompt: str,
    *,
    system: Optional[str] = None,
    history: Optional[Sequence[Message]] = None,
) -> List[Message]:
    """Assemble a message list from a prompt, a system prompt and prior turns."""
    messages: List[Message] = []
    if system:
        messages.append({"role": "system", "content": system})
    for turn in history or []:
        role, content = turn.get("role"), turn.get("content")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": prompt})
    return messages


def generate(
    prompt: str,
    *,
    system: Optional[str] = None,
    history: Optional[Sequence[Message]] = None,
    **options,
) -> str:
    """Answer a single prompt, with an optional system prompt and prior turns."""
    return chat(build_messages(prompt, system=system, history=history), **options)
