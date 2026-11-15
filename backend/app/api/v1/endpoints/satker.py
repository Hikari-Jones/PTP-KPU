"""Cross-satker consolidation is unavailable until a verified source is integrated."""
from fastapi import APIRouter, HTTPException
router = APIRouter()

@router.get('/')
async def list_satker():
    raise HTTPException(503, 'Data lintas Satker belum terhubung ke sumber terverifikasi. Gunakan laporan anggaran internal untuk data aplikasi ini.')
