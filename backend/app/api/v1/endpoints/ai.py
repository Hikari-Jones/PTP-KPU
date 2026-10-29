import json
import httpx
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.config import settings

router = APIRouter()

class ChatRequest(BaseModel):
    message: str
    context: Optional[str] = None
    history: Optional[List[Dict[str, str]]] = None

class GeneratedFileOut(BaseModel):
    name: str
    content: str
    mimeType: str
    sizeStr: str

class ChatResponse(BaseModel):
    reply: str
    model_used: str
    source: str  # "local_ollama" or "fallback_agent"
    fileAttachment: Optional[GeneratedFileOut] = None

KPU_SYSTEM_PROMPT = """Anda adalah KIRANA Agent, Asisten AI Cerdas Sistem Informasi PTP-KPU (Pengelolaan Tata Persuratan & Realisasi Anggaran) Komisi Pemilihan Umum Provinsi Sulawesi Utara.
Tugas utama Anda:
1. Membantu staf KPU menyusun draf persuratan dinas (Surat Dinas, Nota Dinas, Surat Tugas, Surat Keputusan/Kpt).
2. Memberikan panduan kode klasifikasi arsip KPU (misal: PL.01 untuk Perencanaan Pemilu, HK.01 untuk Hukum, KU.01 untuk Keuangan).
3. Memberikan asistensi verifikasi dan pemantauan realisasi anggaran DIPA KPU Sulut.
4. Menjawab pertanyaan seputar alur disposisi, TTE, dan administrasi perkantoran KPU.

Gunakan bahasa Indonesia yang baku, profesional, sopan, dan jelas khas tata persuratan dinas instansi pemerintah Republik Indonesia."""

def create_document_attachment(query: str) -> Optional[GeneratedFileOut]:
    lower = query.lower()
    if "surat dinas" in lower or "surat_dinas" in lower:
        content = """KOMISI PEMILIHAN UMUM PROVINSI SULAWESI UTARA
Jl. Diponegoro No. 12, Manado, Sulawesi Utara
======================================================================
SURAT DINAS
Nomor   : 088/PL.02.1-SD/71/X/2026
Sifat   : Penting
Lampiran: 1 (satu) Berkas
Perihal : Koordinasi Pemutakhiran Data Pemilih Berkelanjutan Semester II

Kepada Yth.
Ketua KPU Kabupaten/Kota Se-Provinsi Sulawesi Utara
di Tempat

Dengan hormat,
Sehubungan dengan pelaksanaan tahapan pemutakhiran data pemilih berkelanjutan tahun anggaran 2026, bersama ini disampaikan hal-hal sebagai berikut:
1. Seluruh Satuan Kerja KPU Kabupaten/Kota agar melakukan sinkronisasi data pleno berkala.
2. Rapat koordinasi teknis wilayah akan diselenggarakan pada hari Senin, tanggal 10 November 2026 di Aula KPU Sulut.
3. Dimohon menugaskan operator Subbagian Rendatin untuk hadir tepat waktu.

Demikian disampaikan untuk menjadi perhatian dan dilaksanakan sebagaimana mestinya.

Manado, 30 Oktober 2026
Ketua KPU Provinsi Sulawesi Utara,

[TANDA TANGAN ELEKTRONIK]
"""
        return GeneratedFileOut(
            name="Draf_Surat_Dinas_KPU_Sulut.txt",
            content=content,
            mimeType="text/plain",
            sizeStr="1.4 KB"
        )
    elif "nota dinas" in lower or "nota_dinas" in lower:
        content = """KOMISI PEMILIHAN UMUM PROVINSI SULAWESI UTARA
======================================================================
NOTA DINAS
Nomor : 042/ND-RENDATIN/71/X/2026

Yth  : Sekretaris KPU Provinsi Sulawesi Utara
Dari : Kepala Subbagian Perencanaan, Data dan Informasi
Hal  : Pengadaan Lisensi dan Peremajaan Server Database Lokal PTP-KPU

Disampaikan dengan hormat bahwa untuk menunjang kelancaran sistem operasional lokal, dibutuhkan penambahan kapasitas penyimpanan data arsip digital.

Mohon arahan dan persetujuan lebih lanjut.

Manado, 30 Oktober 2026
Kasubbag RENDATIN KPU Sulut
"""
        return GeneratedFileOut(
            name="Draf_Nota_Dinas_RENDATIN.txt",
            content=content,
            mimeType="text/plain",
            sizeStr="950 B"
        )
    return None

@router.get("/status")
async def get_ai_status():
    """Check connectivity to local Ollama model host."""
    host = settings.OLLAMA_HOST.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{host}/api/tags")
            if resp.status_code == 200:
                data = resp.json()
                models = [m.get("name") for m in data.get("models", [])]
                return {
                    "status": "online",
                    "ollama_host": host,
                    "active_model": settings.OLLAMA_MODEL,
                    "available_models": models,
                    "message": "Local Ollama LLM service is active and ready."
                }
    except Exception as e:
        return {
            "status": "offline",
            "ollama_host": host,
            "active_model": settings.OLLAMA_MODEL,
            "available_models": [],
            "message": f"Local Ollama is not currently detected at {host}. Start Ollama service on office PC to activate real-time inference.",
            "error": str(e)
        }

@router.post("/chat", response_model=ChatResponse)
async def chat_with_ai(payload: ChatRequest):
    """Interact with local AI model with fallback."""
    query = payload.message.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Pesan pertanyaan tidak boleh kosong")

    doc_attachment = create_document_attachment(query)
    host = settings.OLLAMA_HOST.rstrip("/")
    model = settings.OLLAMA_MODEL

    # Try calling local Ollama
    try:
        ollama_prompt = f"{KPU_SYSTEM_PROMPT}\n\nPertanyaan Staf KPU: {query}\n\nJawaban KIRANA:"
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{host}/api/generate",
                json={
                    "model": model,
                    "prompt": ollama_prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.3,
                        "top_p": 0.9
                    }
                }
            )
            if resp.status_code == 200:
                ollama_json = resp.json()
                reply_text = ollama_json.get("response", "").strip()
                if reply_text:
                    return ChatResponse(
                        reply=reply_text,
                        model_used=model,
                        source="local_ollama",
                        fileAttachment=doc_attachment
                    )
    except Exception:
        # Fall through to graceful intelligent fallback
        pass

    # Intelligent local fallback response
    lower = query.lower()
    if "surat" in lower and ("dinas" in lower or "draf" in lower or "buat" in lower):
        reply = (
            "KIRANA telah menyusun draf dokumen resmi sesuai tata persuratan dinas KPU Provinsi Sulawesi Utara. "
            "Anda dapat meninjau dan mengunduh berkas lengkapnya melalui lampiran di bawah ini."
        )
    elif "anggaran" in lower or "realisasi" in lower or "pagu" in lower:
        reply = (
            "Informasi Realisasi Anggaran KPU Sulut TA 2025/2026: Total pagu DIPA terdaftar sebesar Rp 45.78 Miliar "
            "dengan serapan berjalan mencapai ~69.8%. Seluruh transaksi belanja operasional dan belanja modal "
            "dapat dipantau secara real-time pada modul Realisasi Anggaran."
        )
    elif "klasifikasi" in lower or "arsip" in lower:
        reply = (
            "Kode Klasifikasi Arsip KPU yang umum digunakan:\n"
            "• PL.01: Perencanaan Pemilu & Pilkada\n"
            "• PL.02: Pemutakhiran Data Pemilih (DPT)\n"
            "• HK.01: Peraturan & Keputusan KPU\n"
            "• KU.01: DIPA & Pertanggungjawaban Keuangan\n"
            "• HR.01: Surat Tugas & Kepegawaian"
        )
    else:
        reply = (
            f"Halo! Saya KIRANA Agent (Asisten Lokal PTP-KPU). Pertanyaan Anda: \"{query}\". "
            "Sistem siap membantu proses pembuatan draf surat dinas, pemantauan DIPA anggaran, dan tata kelola arsip KPU Sulut. "
            "(Catatan: Server AI Ollama lokal dapat diaktifkan pada PC kantor dengan menjalankan perintah 'ollama run qwen2.5')."
        )

    return ChatResponse(
        reply=reply,
        model_used=f"{model} (Rule-Based Fallback)",
        source="fallback_agent",
        fileAttachment=doc_attachment
    )
