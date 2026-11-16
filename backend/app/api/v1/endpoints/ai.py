import json
import logging
from typing import AsyncIterator, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter()

FALLBACK_MODEL_NAME = "KIRANA"


class ChatRequest(BaseModel):
    message: str = Field(..., max_length=8000)
    context: Optional[str] = None
    # Earlier turns of the conversation: [{"role": "user"|"assistant", "content": "..."}]
    history: Optional[List[Dict[str, str]]] = None


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
    lower = query.lower()
    if "klasifikasi" in lower:
        return (
            "Kode Klasifikasi Arsip KPU yang umum digunakan:\n"
            "- PL.01: Perencanaan Pemilu & Pilkada\n"
            "- PL.02: Pemutakhiran Data Pemilih (DPT)\n"
            "- HK.01: Peraturan & Keputusan KPU\n"
            "- KU.01: DIPA & Pertanggungjawaban Keuangan\n"
            "- HR.01: Surat Tugas & Kepegawaian\n\n"
            "(Catatan: model AI lokal sedang tidak tersedia; jawaban ini berasal dari mode rule-based.)"
        )
    return (
        "Maaf, model AI lokal KIRANA sedang tidak tersedia sehingga saya belum dapat "
        "menjawab pertanyaan ini. Pastikan dependensi backend sudah terpasang "
        "(`pip install -r requirements.txt`) dan periksa `/api/v1/ai/status`. "
        "Data surat, arsip, dan anggaran tetap dapat dilihat langsung pada modul masing-masing."
    )


def _run_agent(payload: ChatRequest) -> AsyncIterator[dict]:
    # Imported here so the API still starts (and falls back) if the model
    # package or its dependencies are missing.
    from app.services.kirana_agent import run_agent

    return run_agent(payload.message.strip(), payload.history, payload.context)


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
    return {
        "status": "online" if downloaded else "offline",
        "active_model": llm.MODEL_NAME,
        "downloaded": downloaded,
        "loaded": llm.is_loaded(),
        "message": (
            "Model lokal siap digunakan."
            if downloaded
            else "Model belum terunduh; akan diunduh otomatis saat pertama kali dipanggil."
        ),
    }


@router.post("/chat", response_model=ChatResponse)
async def chat_with_ai(payload: ChatRequest):
    """Ask KIRANA and get the whole answer at once."""
    query = payload.message.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Pesan pertanyaan tidak boleh kosong")

    try:
        parts: List[str] = []
        model, used_database = FALLBACK_MODEL_NAME, False
        async for event in _run_agent(payload):
            if event["type"] == "token":
                parts.append(event["text"])
            elif event["type"] == "reset":
                parts.clear()
            elif event["type"] == "done":
                model, used_database = event["model"], event["used_database"]
        reply = "".join(parts).strip()
        if reply:
            return ChatResponse(
                reply=reply, model_used=model, source="local_model", used_database=used_database
            )
    except Exception:
        logger.exception("Local model inference failed; using rule-based fallback")

    return ChatResponse(
        reply=_fallback_reply(query),
        model_used=f"{FALLBACK_MODEL_NAME} (Rule-Based Fallback)",
        source="fallback_agent",
    )


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


@router.post("/chat/stream")
async def chat_with_ai_stream(payload: ChatRequest):
    """Ask KIRANA and receive the answer as it is written (Server-Sent Events).

    Each event is a JSON object: {"type": "token"|"status"|"reset"|"done"|"error", ...}.
    Closing the connection stops the generation.
    """
    query = payload.message.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Pesan pertanyaan tidak boleh kosong")

    async def events() -> AsyncIterator[str]:
        wrote_text = False
        try:
            async for event in _run_agent(payload):
                if event["type"] == "token":
                    wrote_text = True
                elif event["type"] == "reset":
                    wrote_text = False
                yield _sse({**event, "source": "local_model"} if event["type"] == "done" else event)
        except Exception:
            logger.exception("Local model inference failed")
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

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
