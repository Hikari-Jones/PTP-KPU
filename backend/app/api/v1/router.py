from fastapi import APIRouter
from app.api.v1.endpoints import bagian, pegawai, arsip, anggaran, surat, ai, auth, satker

api_router = APIRouter()

@api_router.get("/status")
async def status():
    return {"status": "v1 API is operational", "system": "PTP-KPU Sulut Operations API"}

# Authentication
api_router.include_router(auth.router, prefix="/auth", tags=["Autentikasi"])

# Master & Pegawai
api_router.include_router(bagian.router, prefix="/bagian", tags=["Bagian"])
api_router.include_router(pegawai.router, prefix="/pegawai", tags=["Pegawai"])
api_router.include_router(satker.router, prefix="/satker", tags=["Satuan Kerja"])

# Arsip
api_router.include_router(arsip.router, prefix="/arsip", tags=["Arsip"])

# Tata Persuratan (Surat Keluar, Surat Tugas, Klasifikasi, Jenis Surat)
api_router.include_router(surat.router, tags=["Persuratan"])

# AI Chatbot KIRANA (Local Ollama LLM)
api_router.include_router(ai.router, prefix="/ai", tags=["AI KIRANA Assistant"])

# Modul Realisasi Anggaran Endpoints
api_router.include_router(anggaran.tahun_router, prefix="/tahun-anggaran", tags=["Tahun Anggaran"])
api_router.include_router(anggaran.akun_router, prefix="/akun-anggaran", tags=["Akun Anggaran"])
api_router.include_router(anggaran.pagu_router, prefix="/pagu-anggaran", tags=["Pagu Anggaran"])
api_router.include_router(anggaran.revisi_router, prefix="/revisi-anggaran", tags=["Revisi Anggaran"])
api_router.include_router(anggaran.realisasi_router, prefix="/realisasi-anggaran", tags=["Realisasi Anggaran"])
api_router.include_router(anggaran.dashboard_router, prefix="/anggaran", tags=["Ringkasan Anggaran"])
