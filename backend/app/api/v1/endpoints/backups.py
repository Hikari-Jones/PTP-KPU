import asyncio
import re
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from app.core.auth import require_admin
from app.services.backups import BACKUPS, create_backup

router = APIRouter(prefix='/backups', tags=['Backups'], dependencies=[Depends(require_admin)])
_lock = asyncio.Lock()

@router.get('')
async def list_backups():
    return [{'name': p.name, 'size': p.stat().st_size} for p in sorted(BACKUPS.glob('*.zip'), reverse=True)]

@router.post('', status_code=201)
async def backup():
    if _lock.locked(): raise HTTPException(409, 'Backup sedang berjalan')
    async with _lock:
        try:
            return await asyncio.to_thread(create_backup)
        except Exception as exc:
            raise HTTPException(503, 'Backup gagal. Periksa mysqldump, ruang disk, dan izin database pada server.') from exc

@router.get('/{name}')
async def download(name: str):
    if not re.fullmatch(r'[0-9TZ]+-[a-f0-9]{12}\.zip', name): raise HTTPException(404)
    path = BACKUPS / name
    if not path.is_file(): raise HTTPException(404)
    return FileResponse(path, filename=name, media_type='application/zip')
