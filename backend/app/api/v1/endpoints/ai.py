import asyncio
import json
import os
import threading
from contextlib import aclosing
import logging
from typing import AsyncIterator, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from app.core.auth import get_current_user
from app.models.schema import Pegawai

logger = logging.getLogger(__name__)

router = APIRouter()

FALLBACK_MODEL_NAME = "KIRANA"


_inference_slots = asyncio.Semaphore(2)
# Last inference failure (e.g. a corrupt model file). Reported by /ai/status so an
# administrator is not told "ready" while every question fails; cleared on success.
_last_inference_error: Optional[str] = None


def _record_inference(error: Optional[BaseException]) -> None:
    global _last_inference_error
    _last_inference_error = None if error is None else f"{type(error).__name__}: {error}"[:300]


class HistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=8000)


class ChatRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    message: str = Field(min_length=1, max_length=8000)
    context: Optional[str] = Field(None, max_length=12000)
    history: List[HistoryMessage] = Field(default_factory=list, max_length=12)


async def _acquire_slot():
    try:
        await asyncio.wait_for(_inference_slots.acquire(), timeout=0.1)
    except asyncio.TimeoutError as exc:
        raise HTTPException(429, "Asisten sedang sibuk. Coba lagi sebentar.") from exc


class GeneratedFileOut(BaseModel):
    name: str
    content: str
    mimeType: str
    sizeStr: str


class ChatResponse(BaseModel):
    reply: str
    model_used: str
    source: str  # "local_model" or "fallback_agent"
    used_database: bool = False
    fileAttachment: Optional[GeneratedFileOut] = None


def _fallback_reply(query: str) -> str:
    """Rule-based answer used only when the local model cannot run."""
    return (
        "Maaf, model AI lokal KIRANA sedang tidak tersedia sehingga saya belum dapat "
        "menjawab pertanyaan ini. Pastikan dependensi backend sudah terpasang "
        "(`pip install -r requirements.txt`) dan periksa `/api/v1/ai/status`. "
        "Data surat, arsip, dan anggaran tetap dapat dilihat langsung pada modul masing-masing."
    )


# Background model download, so a chat request never blocks on a 2 GB transfer.
_download_thread: Optional[threading.Thread] = None
_download_error: Optional[str] = None


def _start_background_download(llm) -> None:
    global _download_thread, _download_error
    if _download_thread is not None and _download_thread.is_alive():
        return

    def work():
        global _download_error
        try:
            _download_error = None
            llm.ensure_model()
            logger.info("KIRANA model download finished")
        except Exception as exc:  # offline server, disk full, ...
            _download_error = str(exc)
            logger.error("KIRANA model download failed: %s", exc)

    _download_thread = threading.Thread(target=work, name="kirana-model-download", daemon=True)
    _download_thread.start()


def _model_unavailable_message() -> Optional[str]:
    """None when the weights are on disk; otherwise a message for the user."""
    try:
        import kirana_llm as llm
    except Exception:
        return None  # let the agent fail and use the regular fallback
    if llm.downloaded_path() is not None:
        return None
    if os.environ.get("KIRANA_AUTO_DOWNLOAD", "1") != "0":
        _start_background_download(llm)
        return ("Model AI KIRANA sedang disiapkan (diunduh sekitar 2 GB) dan belum dapat menjawab. "
                "Silakan coba lagi beberapa menit lagi. Administrator dapat menyiapkannya lebih dulu dengan "
                "`python -m kirana_llm --download`." + (f" Unduhan terakhir gagal: {_download_error}" if _download_error else ""))
    return ("Model AI KIRANA belum terpasang di server. Administrator perlu menjalankan "
            "`python -m kirana_llm --download` atau mengatur KIRANA_MODEL_PATH.")


async def _unavailable_events(message: str) -> AsyncIterator[dict]:
    yield {"type": "token", "text": message}
    yield {"type": "done", "model": f"{FALLBACK_MODEL_NAME} (model belum tersedia)",
           "source": "fallback_agent", "used_database": False}


def _run_agent(payload: ChatRequest, user: Pegawai) -> AsyncIterator[dict]:
    unavailable = _model_unavailable_message()
    if unavailable:
        return _unavailable_events(unavailable)
    # Imported here so the API still starts (and falls back) if the model
    # package or its dependencies are missing.
    from app.services.kirana_agent import run_agent

    return run_agent(payload.message.strip(), [turn.model_dump() for turn in payload.history], payload.context, user=user)


@router.get("/status")
async def get_ai_status():
    """Report the local model's state without loading it."""
    try:
        import kirana_llm as llm
    except Exception as e:
        return {
            "status": "offline",
            "active_model": FALLBACK_MODEL_NAME,
            "downloaded": False,
            "loaded": False,
            "message": "Paket kirana_llm belum terpasang. Jalankan 'pip install -r requirements.txt' di folder backend.",
            "error": str(e),
        }

    downloaded = llm.downloaded_path() is not None
    downloading = _download_thread is not None and _download_thread.is_alive()
    if downloaded and _last_inference_error:
        return {
            "status": "error",
            "active_model": llm.MODEL_NAME,
            "downloaded": True,
            "downloading": False,
            "loaded": llm.is_loaded(),
            "message": ("Berkas model ada, tetapi model gagal dimuat atau menjawab. Kemungkinan berkas rusak: "
                        "hapus lalu unduh ulang dengan 'python -m kirana_llm --download'."),
            "error": _last_inference_error,
        }
    if downloaded:
        message = "Model lokal siap digunakan."
    elif downloading:
        message = "Model sedang diunduh di latar belakang."
    elif _download_error:
        message = f"Unduhan model gagal: {_download_error}. Jalankan 'python -m kirana_llm --download'."
    else:
        message = "Model belum terunduh; jalankan 'python -m kirana_llm --download' sebelum digunakan."
    return {
        "status": "online" if downloaded else ("downloading" if downloading else "offline"),
        "active_model": llm.MODEL_NAME,
        "downloaded": downloaded,
        "downloading": downloading,
        "loaded": llm.is_loaded(),
        "message": message,
    }


@router.post("/chat", response_model=ChatResponse)
async def chat_with_ai(payload: ChatRequest, user: Pegawai = Depends(get_current_user)):
    """Ask KIRANA and get the whole answer at once."""
    query = payload.message.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Pesan pertanyaan tidak boleh kosong")

    await _acquire_slot()
    try:
        parts: List[str] = []
        model, used_database, source = FALLBACK_MODEL_NAME, False, "local_model"
        async for event in _run_agent(payload, user):
            if event["type"] == "token":
                parts.append(event["text"])
            elif event["type"] == "reset":
                parts.clear()
            elif event["type"] == "done":
                model, used_database = event["model"], event["used_database"]
                source = event.get("source", "local_model")
        reply = "".join(parts).strip()
        if reply:
            if source == "local_model":
                _record_inference(None)
            return ChatResponse(
                reply=reply, model_used=model, source=source, used_database=used_database
            )
    except Exception as exc:
        logger.exception("Local model inference failed; using rule-based fallback")
        _record_inference(exc)
    finally:
        _inference_slots.release()

    return ChatResponse(
        reply=_fallback_reply(query),
        model_used=f"{FALLBACK_MODEL_NAME} (Rule-Based Fallback)",
        source="fallback_agent",
    )


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


@router.post("/chat/stream")
async def chat_with_ai_stream(payload: ChatRequest, user: Pegawai = Depends(get_current_user)):
    """Ask KIRANA and receive the answer as it is written (Server-Sent Events).

    Each event is a JSON object: {"type": "token"|"status"|"reset"|"done"|"error", ...}.
    Closing the connection stops the generation.
    """
    query = payload.message.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Pesan pertanyaan tidak boleh kosong")

    await _acquire_slot()

    async def events() -> AsyncIterator[str]:
        wrote_text = False
        try:
            async with aclosing(_run_agent(payload, user)) as agent:
                async for event in agent:
                    if event["type"] == "token":
                        wrote_text = True
                    elif event["type"] == "reset":
                        wrote_text = False
                    if event["type"] == "done" and event.get("source", "local_model") == "local_model":
                        _record_inference(None)
                    yield _sse({"source": "local_model", **event} if event["type"] == "done" else event)
        except Exception as exc:
            logger.exception("Local model inference failed")
            _record_inference(exc)
            if wrote_text:
                yield _sse({"type": "error", "text": "Jawaban terhenti karena terjadi galat pada model."})
            else:
                yield _sse({"type": "token", "text": _fallback_reply(query)})
            yield _sse({
                "type": "done",
                "model": f"{FALLBACK_MODEL_NAME} (Rule-Based Fallback)",
                "source": "fallback_agent",
                "used_database": False,
            })

        finally:
            _inference_slots.release()

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
