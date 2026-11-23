import re
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
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
    db.add(record)
    await db.commit()
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
    path = (STORAGE_ROOT / record.relative_path).resolve()
    if STORAGE_ROOT not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="Berkas fisik tidak ditemukan")
    return FileResponse(
        path,
        media_type=record.mime_type or "application/octet-stream",
        filename=record.original_name,
    )
