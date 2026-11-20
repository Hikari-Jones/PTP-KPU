import re
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, is_admin
from app.core.config import settings
from app.core.database import get_db
from app.models.schema import FileRecord, Pegawai

router = APIRouter(prefix="/files", tags=["Berkas"])
BASE_DIR = Path(__file__).resolve().parents[4]
STORAGE_ROOT = (BASE_DIR / settings.UPLOAD_DIR).resolve()
ALLOWED_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".jpg", ".jpeg", ".png"
}


def _safe_category(category: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9_-]", "", category.strip().lower())
    return value or "general"


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(...),
    category: str = Form("general"),
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
):
    original_name = Path(file.filename or "").name
    extension = Path(original_name).suffix.lower()
    if not original_name or extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Jenis berkas tidak didukung")

    category_name = _safe_category(category)
    stored_name = f"{uuid4().hex}{extension}"
    relative_path = Path(category_name) / stored_name
    destination = STORAGE_ROOT / relative_path
    destination.parent.mkdir(parents=True, exist_ok=True)
    max_size = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    file_size = 0

    try:
        with destination.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                file_size += len(chunk)
                if file_size > max_size:
                    raise HTTPException(
                        status_code=413,
                        detail=(
                            f"Ukuran berkas melebihi "
                            f"{settings.MAX_UPLOAD_SIZE_MB} MB"
                        ),
                    )
                output.write(chunk)
    except HTTPException:
        destination.unlink(missing_ok=True)
        raise
    except OSError as exc:
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="Berkas gagal disimpan") from exc
    finally:
        await file.close()

    record = FileRecord(
        original_name=original_name,
        stored_name=stored_name,
        relative_path=relative_path.as_posix(),
        mime_type=file.content_type,
        file_size=file_size,
        category=category_name,
        uploaded_by=current_user.id_pegawai,
    )
    try:
        db.add(record)
        await db.commit()
    except Exception:
        await db.rollback()
        destination.unlink(missing_ok=True)
        raise
    await db.refresh(record)
    return {
        "file_id": record.id_file,
        "filename": record.original_name,
        "mime_type": record.mime_type,
        "size": record.file_size,
        "category": record.category,
    }


@router.get("/{file_id}")
async def download_file(
    file_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
):
    record = await db.get(FileRecord, file_id)
    if not record:
        raise HTTPException(status_code=404, detail="Berkas tidak ditemukan")
    if not is_admin(current_user) and record.uploaded_by != current_user.id_pegawai:
        from sqlalchemy import select
        from app.models.schema import DokumenArsip
        from app.models.operations import WorkflowLetter
        from app.services.arsip import arsip
        permitted = False
        docs = (await db.scalars(select(DokumenArsip).where(DokumenArsip.file_path == str(file_id), DokumenArsip.status_hapus == False))).all()
        for doc in docs:
            owner = await db.get(Pegawai, doc.id_pegawai)
            if doc.hak_akses in ('internal', 'publik') or (doc.hak_akses == 'terbatas' and owner and current_user.id_bagian is not None and owner.id_bagian == current_user.id_bagian):
                permitted = True
        letters = (await db.scalars(select(WorkflowLetter).where(WorkflowLetter.file_id == file_id))).all()
        if any(current_user.id_pegawai in (x.owner_id, x.assignee_id) for x in letters): permitted = True
        from app.models.schema import RealisasiAnggaran
        from app.core.authority import has_authority
        if has_authority(settings.AUTHORITY_GRANTS, current_user.id_pegawai, 'verify_budget'):
            linked = await db.scalar(select(RealisasiAnggaran.id_realisasi).where(
                RealisasiAnggaran.bukti_file_path == f'/api/v1/files/{file_id}').limit(1))
            permitted = permitted or linked is not None
        if not permitted: raise HTTPException(403, 'Akses berkas ditolak')
    path = (STORAGE_ROOT / record.relative_path).resolve()
    if STORAGE_ROOT not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="Berkas fisik tidak ditemukan")
    return FileResponse(
        path,
        media_type=record.mime_type or "application/octet-stream",
        filename=record.original_name,
    )


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_unused_file(
    file_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
):
    """Roll back an upload whose follow-up save failed.

    Only the uploader (or an admin) may delete, and only while no archive,
    workflow letter or budget transaction references the file.
    """
    from sqlalchemy import select
    from app.models.schema import DokumenArsip, RealisasiAnggaran
    from app.models.operations import WorkflowLetter

    record = await db.get(FileRecord, file_id)
    if not record:
        return None
    if record.uploaded_by != current_user.id_pegawai and not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Berkas bukan milik pengguna")
    referenced = (
        await db.scalar(select(DokumenArsip.id_dokumen).where(DokumenArsip.file_path == str(file_id)).limit(1))
        or await db.scalar(select(WorkflowLetter.id).where(WorkflowLetter.file_id == file_id).limit(1))
        or await db.scalar(select(RealisasiAnggaran.id_realisasi).where(
            RealisasiAnggaran.bukti_file_path == f"/api/v1/files/{file_id}").limit(1))
    )
    if referenced:
        raise HTTPException(status_code=409, detail="Berkas masih digunakan dan tidak dapat dihapus")
    path = (STORAGE_ROOT / record.relative_path).resolve()
    await db.delete(record)
    await db.commit()
    if STORAGE_ROOT in path.parents:
        path.unlink(missing_ok=True)
    return None
