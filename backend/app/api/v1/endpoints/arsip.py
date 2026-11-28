from datetime import date, datetime
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.authority import has_authority_async
from app.core.auth import get_current_user, require_admin, is_admin
from app.core.config import settings
from app.core.database import get_db
from app.models.operations import ArsipAccessGrant, ArsipAuditLog, ArsipPenyusutan, WorkflowLetter
from app.models.schema import DokumenArsip, FileRecord, KodeKlasifikasiArsip, Pegawai, RealisasiAnggaran
from app.schemas.arsip import (
    ArsipAccessGrantCreate,
    ArsipAccessGrantResponse,
    ArsipAuditLogResponse,
    ArsipNewVersionCreate,
    ArsipPenyusutanCreate,
    ArsipPenyusutanExecute,
    ArsipPenyusutanResponse,
    DokumenArsipCreate,
    DokumenArsipUpdate,
    DokumenArsipResponse,
    FilterOptionsResponse,
    PermintaanHapusRequest,
    TolakHapusRequest,
)
from app.services.arsip import arsip
from app.services.arsip_utils import (
    build_berita_acara_penyusutan_pdf,
    compute_jra,
    extract_text_from_file,
)

router = APIRouter()


async def _validate_uploaded_file_for_arsip(
    db: AsyncSession, file_path: Optional[str], current_user: Pegawai
) -> Optional[FileRecord]:
    if not file_path:
        return None
    try:
        file_id = int(file_path)
    except ValueError:
        raise HTTPException(422, "file_path harus berupa ID berkas upload")
    record = await db.get(FileRecord, file_id)
    if not record or (record.uploaded_by != current_user.id_pegawai and not is_admin(current_user)):
        raise HTTPException(403, "Berkas bukan milik pengguna")
    used_in_letter = await db.scalar(select(WorkflowLetter.id).where(WorkflowLetter.file_id == file_id).limit(1))
    used_in_budget = await db.scalar(
        select(RealisasiAnggaran.id_realisasi)
        .where(RealisasiAnggaran.bukti_file_path == f"/api/v1/files/{file_id}")
        .limit(1)
    )
    if used_in_letter or used_in_budget:
        raise HTTPException(409, "Berkas sudah terikat pada dokumen surat atau realisasi anggaran")
    return record


async def _can_manage_disposal(db: AsyncSession, user: Pegawai) -> bool:
    if is_admin(user):
        return True
    return await has_authority_async(db, settings.AUTHORITY_GRANTS, user.id_pegawai, "approve_disposal")


async def _serialize_penyusutan(db: AsyncSession, item: ArsipPenyusutan) -> dict:
    pengaju = await db.get(Pegawai, item.diajukan_oleh) if item.diajukan_oleh else None
    penyetuju = await db.get(Pegawai, item.disetujui_oleh) if item.disetujui_oleh else None
    return {
        "id": item.id,
        "nomor_ba": item.nomor_ba,
        "jenis_penyusutan": item.jenis_penyusutan,
        "status": item.status,
        "alasan": item.alasan,
        "dokumen_ids": item.dokumen_ids or [],
        "dokumen_snapshot": item.dokumen_snapshot or [],
        "diajukan_oleh": item.diajukan_oleh,
        "nama_pengaju": pengaju.nama if pengaju else None,
        "disetujui_oleh": item.disetujui_oleh,
        "nama_penyetuju": penyetuju.nama if penyetuju else None,
        "catatan_persetujuan": item.catatan_persetujuan,
        "tanggal_eksekusi": item.tanggal_eksekusi,
        "created_at": item.created_at,
    }


# =========================================================
# STATIC / COLLECTION ROUTES (must appear before /{id_dokumen})
# =========================================================


@router.get("/filter-options", response_model=FilterOptionsResponse)
async def get_filter_options(
    status_hapus: bool = Query(False, description="Ambil opsi filter untuk arsip aktif atau tempat sampah"),
    user: Pegawai = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    return await arsip.get_filter_options(db, status_hapus=status_hapus, viewer=user)


@router.post("/sinkronkan")
async def sinkronkan_arsip(
    user: Pegawai = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> Any:
    from app.services.arsip_sync import sync_all
    counts = await sync_all(db)
    return {"status": "success", **counts}


@router.get("/cek-duplikat", response_model=List[DokumenArsipResponse])
async def cek_duplikat_arsip(
    sha256: str = Query(..., min_length=16, max_length=64),
    current_user: Pegawai = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Check whether an active archive document with the same SHA-256 hash already exists."""
    has_secret = await arsip._has_secret_authority(db, current_user)
    conds = [
        DokumenArsip.status_hapus.is_(False),
        DokumenArsip.sha256_hash == sha256.strip().lower(),
    ]
    conds.extend(arsip._visibility_conditions(current_user, has_secret_authority=has_secret))
    from sqlalchemy.orm import selectinload
    rows = (
        await db.scalars(
            select(DokumenArsip)
            .options(
                selectinload(DokumenArsip.pegawai).selectinload(Pegawai.bagian),
                selectinload(DokumenArsip.penghapus),
                selectinload(DokumenArsip.klasifikasi),
            )
            .where(*conds)
            .limit(20)
        )
    ).all()
    return list(rows)


@router.post("/rehitung-retensi")
async def rehitung_retensi_jra(
    current_user: Pegawai = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Recalculate JRA active/inactive/siap_susut retention statuses for classified archive docs."""
    from sqlalchemy.orm import selectinload
    today = date.today()
    docs = (
        await db.scalars(
            select(DokumenArsip)
            .options(selectinload(DokumenArsip.klasifikasi))
            .where(DokumenArsip.id_klasifikasi.is_not(None), DokumenArsip.status_retensi != "disusutkan")
        )
    ).all()
    updated = 0
    for doc in docs:
        if not doc.klasifikasi:
            continue
        tgl_aktif, tgl_inaktif, status_ret, nasib = compute_jra(
            doc.tanggal_dokumen,
            doc.klasifikasi.retensi_aktif_tahun,
            doc.klasifikasi.retensi_inaktif_tahun,
            doc.klasifikasi.kode_klasifikasi,
            existing_nasib_akhir=doc.nasib_akhir,
            today=today,
        )
        if (
            doc.tanggal_retensi_aktif != tgl_aktif
            or doc.tanggal_retensi_inaktif != tgl_inaktif
            or doc.status_retensi != status_ret
            or doc.nasib_akhir != nasib
        ):
            doc.tanggal_retensi_aktif = tgl_aktif
            doc.tanggal_retensi_inaktif = tgl_inaktif
            doc.status_retensi = status_ret
            doc.nasib_akhir = nasib
            updated += 1
    await db.commit()
    return {"status": "success", "checked": len(docs), "updated": updated}


@router.get("/my-audit-logs", response_model=List[ArsipAuditLogResponse])
async def list_scoped_arsip_audit_logs(
    aksi: Optional[str] = Query(None),
    search: Optional[str] = Query(None, max_length=150),
    id_dokumen: Optional[int] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    skip: int = Query(0, ge=0),
    current_user: Pegawai = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Scoped archive audit trail for the Sidebar Audit menu.

    Administrators and holders of `access_secret_archive` see all archive audit entries;
    other staff see entries only for archives they are permitted to view or actions they performed.
    """
    from sqlalchemy import or_

    has_global = await arsip._has_secret_authority(db, current_user)
    conds = []
    if aksi:
        conds.append(ArsipAuditLog.aksi == aksi.strip())
    if id_dokumen is not None:
        conds.append(ArsipAuditLog.id_dokumen == id_dokumen)
    if search and search.strip():
        like = f"%{search.strip()}%"
        conds.append(
            or_(
                ArsipAuditLog.nama_dokumen.ilike(like),
                ArsipAuditLog.nomor_dokumen.ilike(like),
                ArsipAuditLog.actor_nama.ilike(like),
                ArsipAuditLog.detail.ilike(like),
            )
        )

    rows = (
        await db.scalars(
            select(ArsipAuditLog)
            .where(*conds)
            .order_by(desc(ArsipAuditLog.created_at), desc(ArsipAuditLog.id))
            .offset(skip if has_global else 0)
            .limit(limit if has_global else 500)
        )
    ).all()

    if has_global:
        return list(rows)

    visible_cache: dict[int, bool] = {}
    filtered = []
    for row in rows:
        if row.actor_id == current_user.id_pegawai:
            filtered.append(row)
            continue
        if row.id_dokumen is None:
            continue
        if row.id_dokumen not in visible_cache:
            doc = await arsip.get_by_id(db, row.id_dokumen)
            visible_cache[row.id_dokumen] = bool(doc and await arsip.can_view(db, doc, current_user))
        if visible_cache[row.id_dokumen]:
            filtered.append(row)
    return filtered[skip : skip + limit]


@router.get("/audit-logs", response_model=List[ArsipAuditLogResponse])
async def list_arsip_audit_logs(
    aksi: Optional[str] = Query(None),
    id_dokumen: Optional[int] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    skip: int = Query(0, ge=0),
    current_user: Pegawai = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Global immutable archive audit trail (Admin or access_secret_archive authority)."""
    if not await arsip._has_secret_authority(db, current_user):
        raise HTTPException(403, "Akses log audit arsip memerlukan hak administrator atau otoritas arsip rahasia")
    conds = []
    if aksi:
        conds.append(ArsipAuditLog.aksi == aksi.strip())
    if id_dokumen is not None:
        conds.append(ArsipAuditLog.id_dokumen == id_dokumen)
    rows = (
        await db.scalars(
            select(ArsipAuditLog)
            .where(*conds)
            .order_by(desc(ArsipAuditLog.created_at), desc(ArsipAuditLog.id))
            .offset(skip)
            .limit(limit)
        )
    ).all()
    return list(rows)


@router.get("/penyusutan", response_model=List[ArsipPenyusutanResponse])
async def list_penyusutan(
    current_user: Pegawai = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    if not await _can_manage_disposal(db, current_user):
        raise HTTPException(403, "Akses daftar penyusutan memerlukan hak administrator atau otoritas penyusutan")
    rows = (
        await db.scalars(select(ArsipPenyusutan).order_by(desc(ArsipPenyusutan.created_at), desc(ArsipPenyusutan.id)))
    ).all()
    return [await _serialize_penyusutan(db, r) for r in rows]


@router.post("/penyusutan", response_model=ArsipPenyusutanResponse, status_code=status.HTTP_201_CREATED)
async def create_penyusutan(
    payload: ArsipPenyusutanCreate,
    current_user: Pegawai = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Create formal Daftar Usul Musnah / Serah / Pindah (PKPU 17/2023)."""
    if not await _can_manage_disposal(db, current_user):
        raise HTTPException(403, "Pembuatan usulan penyusutan memerlukan hak administrator atau otoritas penyusutan")

    unique_ids = list(dict.fromkeys(payload.dokumen_ids))
    snapshots = []
    today = date.today()

    for doc_id in unique_ids:
        doc = await arsip.get_by_id(db, doc_id)
        if not doc:
            raise HTTPException(404, f"Dokumen #{doc_id} tidak ditemukan")
        if doc.arsip_vital:
            raise HTTPException(409, f"Dokumen #{doc_id} ({doc.nama_dokumen}) berstatus Arsip Vital dan dilindungi dari penyusutan")
        if doc.legal_hold:
            raise HTTPException(409, f"Dokumen #{doc_id} ({doc.nama_dokumen}) dalam status Legal Hold dan tidak dapat disusutkan")
        if payload.jenis_penyusutan == "musnah":
            if doc.nasib_akhir == "permanen":
                raise HTTPException(409, f"Dokumen #{doc_id} ({doc.nama_dokumen}) bernasib akhir PERMANEN dan tidak boleh dimusnahkan")
            if doc.tanggal_retensi_inaktif is not None and today <= doc.tanggal_retensi_inaktif:
                raise HTTPException(
                    409,
                    f"Dokumen #{doc_id} ({doc.nama_dokumen}) masih dalam masa retensi JRA hingga {doc.tanggal_retensi_inaktif}",
                )
        snapshots.append({
            "id_dokumen": doc.id_dokumen,
            "nama_dokumen": doc.nama_dokumen,
            "nomor_dokumen": doc.nomor_dokumen,
            "tanggal_dokumen": str(doc.tanggal_dokumen),
            "kode_klasifikasi": doc.kode_klasifikasi,
            "nasib_akhir": doc.nasib_akhir,
            "sha256_hash": doc.sha256_hash,
        })

    year = today.year
    existing_count = len(
        (await db.scalars(select(ArsipPenyusutan.id).where(ArsipPenyusutan.nomor_ba.like(f"BA-SUSUT/{year}/%")))).all()
    )
    nomor_ba = f"BA-SUSUT/{year}/{existing_count + 1:04d}"

    item = ArsipPenyusutan(
        nomor_ba=nomor_ba,
        jenis_penyusutan=payload.jenis_penyusutan,
        status="diajukan",
        alasan=payload.alasan.strip(),
        dokumen_ids=unique_ids,
        dokumen_snapshot=snapshots,
        diajukan_oleh=current_user.id_pegawai,
    )
    db.add(item)
    await db.flush()
    for snap in snapshots:
        db.add(
            ArsipAuditLog(
                id_dokumen=snap["id_dokumen"],
                nomor_dokumen=snap["nomor_dokumen"],
                nama_dokumen=snap["nama_dokumen"],
                aksi="disposal_propose",
                actor_id=current_user.id_pegawai,
                actor_nama=current_user.nama,
                detail=f"Usulan {payload.jenis_penyusutan} ({nomor_ba}): {payload.alasan.strip()[:200]}",
            )
        )
    await db.commit()
    await db.refresh(item)
    return await _serialize_penyusutan(db, item)


@router.post("/penyusutan/{penyusutan_id}/eksekusi", response_model=ArsipPenyusutanResponse)
async def eksekusi_penyusutan(
    penyusutan_id: int,
    payload: ArsipPenyusutanExecute,
    current_user: Pegawai = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Approve and execute a disposal proposal (Admin or approve_disposal authority)."""
    if not await _can_manage_disposal(db, current_user):
        raise HTTPException(403, "Eksekusi penyusutan memerlukan hak administrator atau otoritas approve_disposal")

    item = await db.get(ArsipPenyusutan, penyusutan_id)
    if not item:
        raise HTTPException(404, "Usulan penyusutan tidak ditemukan")
    if item.status != "diajukan":
        raise HTTPException(409, f"Usulan penyusutan sudah berstatus '{item.status}'")
    if not is_admin(current_user) and item.diajukan_oleh == current_user.id_pegawai:
        raise HTTPException(403, "Maker-checker: pengaju usulan penyusutan tidak boleh mengeksekusi usulannya sendiri")

    now = datetime.now()
    for doc_id in (item.dokumen_ids or []):
        doc = await arsip.get_by_id(db, doc_id)
        if not doc:
            continue
        if doc.arsip_vital or doc.legal_hold:
            raise HTTPException(409, f"Dokumen #{doc_id} saat ini berstatus Vital/Legal Hold; batalkan penyusutan")
        doc.status_retensi = "disusutkan"
        if item.jenis_penyusutan == "musnah":
            doc.status_hapus = True
            doc.dihapus_oleh = current_user.id_pegawai
            doc.dihapus_pada = now
        db.add(
            ArsipAuditLog(
                id_dokumen=doc.id_dokumen,
                nomor_dokumen=doc.nomor_dokumen,
                nama_dokumen=doc.nama_dokumen,
                aksi="disposal_execute",
                actor_id=current_user.id_pegawai,
                actor_nama=current_user.nama,
                detail=f"Eksekusi {item.jenis_penyusutan} ({item.nomor_ba})",
            )
        )

    item.status = "dieksekusi"
    item.disetujui_oleh = current_user.id_pegawai
    item.catatan_persetujuan = payload.catatan_persetujuan.strip() if payload.catatan_persetujuan else None
    item.tanggal_eksekusi = now
    await db.commit()
    await db.refresh(item)
    return await _serialize_penyusutan(db, item)


@router.get("/penyusutan/{penyusutan_id}/berita-acara")
async def download_berita_acara_penyusutan(
    penyusutan_id: int,
    current_user: Pegawai = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    if not await _can_manage_disposal(db, current_user):
        raise HTTPException(403, "Akses Berita Acara penyusutan memerlukan hak administrator atau otoritas penyusutan")
    item = await db.get(ArsipPenyusutan, penyusutan_id)
    if not item:
        raise HTTPException(404, "Usulan penyusutan tidak ditemukan")
    pengaju = await db.get(Pegawai, item.diajukan_oleh) if item.diajukan_oleh else None
    penyetuju = await db.get(Pegawai, item.disetujui_oleh) if item.disetujui_oleh else None

    pdf_bytes = build_berita_acara_penyusutan_pdf(
        nomor_ba=item.nomor_ba,
        jenis_penyusutan=item.jenis_penyusutan,
        status=item.status,
        alasan=item.alasan,
        dokumen_snapshot=item.dokumen_snapshot or [],
        pengaju_nama=pengaju.nama if pengaju else "-",
        penyetuju_nama=penyetuju.nama if penyetuju else None,
        tanggal_eksekusi=item.tanggal_eksekusi,
        catatan_persetujuan=item.catatan_persetujuan,
    )
    safe_name = item.nomor_ba.replace("/", "_")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.pdf"'},
    )


@router.get("/trash", response_model=List[DokumenArsipResponse])
async def read_trash_arsip(
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
    search: Optional[str] = Query(None, description="Pencarian nama, nomor, atau isi teks dokumen"),
    year: Optional[int] = Query(None, ge=1900, le=2100),
    month: Optional[int] = Query(None, ge=1, le=12),
    event: Optional[str] = Query(None),
    kategori: Optional[str] = Query(None),
    hak_akses: Optional[str] = Query(None),
    sub_bagian: Optional[str] = Query(None),
    sumber_modul: Optional[str] = Query(None, pattern="^(arsip|surat|realisasi)$"),
    sub_kategori: Optional[str] = Query(None),
    hapus_status: Optional[str] = Query(None, pattern="^(diajukan|ditolak)$"),
    status_retensi: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
) -> Any:
    items, total = await arsip.get_filtered(
        db,
        search=search,
        year=year,
        month=month,
        event=event,
        kategori=kategori,
        hak_akses=hak_akses,
        sub_bagian=sub_bagian,
        sumber_modul=sumber_modul,
        sub_kategori=sub_kategori,
        hapus_status=hapus_status,
        status_retensi=status_retensi,
        status_hapus=True,
        viewer=current_user,
        skip=skip,
        limit=limit,
    )
    response.headers["X-Total-Count"] = str(total)
    return items


@router.get("/", response_model=List[DokumenArsipResponse])
async def read_arsip(
    response: Response,
    current_user: Pegawai = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    search: Optional[str] = Query(None, description="Pencarian nama, nomor, lokasi fisik, atau isi teks dokumen"),
    year: Optional[int] = Query(None, ge=1900, le=2100),
    month: Optional[int] = Query(None, ge=1, le=12),
    event: Optional[str] = Query(None),
    kategori: Optional[str] = Query(None),
    hak_akses: Optional[str] = Query(None),
    sub_bagian: Optional[str] = Query(None),
    sumber_modul: Optional[str] = Query(None, pattern="^(arsip|surat|realisasi)$"),
    sub_kategori: Optional[str] = Query(None),
    status_retensi: Optional[str] = Query(None, pattern="^(aktif|inaktif|siap_susut|disusutkan)$"),
    arsip_vital: Optional[bool] = Query(None),
    legal_hold: Optional[bool] = Query(None),
    id_klasifikasi: Optional[int] = Query(None),
    status_hapus: bool = Query(False),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
) -> Any:
    items, total = await arsip.get_filtered(
        db,
        search=search,
        year=year,
        month=month,
        event=event,
        kategori=kategori,
        hak_akses=hak_akses,
        sub_bagian=sub_bagian,
        sumber_modul=sumber_modul,
        sub_kategori=sub_kategori,
        status_retensi=status_retensi,
        arsip_vital=arsip_vital,
        legal_hold=legal_hold,
        id_klasifikasi=id_klasifikasi,
        status_hapus=status_hapus,
        viewer=current_user,
        skip=skip,
        limit=limit,
    )
    response.headers["X-Total-Count"] = str(total)
    return items


@router.post("/", response_model=DokumenArsipResponse, status_code=status.HTTP_201_CREATED)
async def create_arsip(
    *,
    db: AsyncSession = Depends(get_db),
    arsip_in: DokumenArsipCreate,
    current_user: Pegawai = Depends(get_current_user),
) -> Any:
    """Create a new archive document with JRA retention, SHA-256 fixity, and text indexing."""
    arsip_in.id_pegawai = current_user.id_pegawai

    record = await _validate_uploaded_file_for_arsip(db, arsip_in.file_path, current_user)
    if record:
        arsip_in.ukuran_file = record.file_size
    else:
        arsip_in.ukuran_file = 0

    klas = None
    if arsip_in.id_klasifikasi is not None:
        klas = await db.get(KodeKlasifikasiArsip, arsip_in.id_klasifikasi)
        if not klas:
            raise HTTPException(422, "Kode klasifikasi arsip tidak ditemukan")

    if arsip_in.legal_hold and not is_admin(current_user):
        raise HTTPException(403, "Hanya administrator yang dapat menetapkan status Legal Hold")

    created_obj = await arsip.create(db, obj_in=arsip_in)

    # Populate JRA dates, SHA-256 fixity, and lightweight extracted full-text
    if klas:
        tgl_aktif, tgl_inaktif, status_ret, nasib = compute_jra(
            created_obj.tanggal_dokumen,
            klas.retensi_aktif_tahun,
            klas.retensi_inaktif_tahun,
            klas.kode_klasifikasi,
            existing_nasib_akhir=created_obj.nasib_akhir,
        )
        created_obj.tanggal_retensi_aktif = tgl_aktif
        created_obj.tanggal_retensi_inaktif = tgl_inaktif
        created_obj.status_retensi = status_ret
        created_obj.nasib_akhir = nasib

    if record:
        created_obj.sha256_hash = record.sha256_hash
        from app.api.v1.endpoints import files as files_ep
        disk_path = (files_ep.STORAGE_ROOT / record.relative_path).resolve()
        if files_ep.STORAGE_ROOT in disk_path.parents and disk_path.is_file():
            created_obj.extracted_text = extract_text_from_file(disk_path)

    await arsip.log_audit(
        db,
        doc=created_obj,
        aksi="create",
        actor=current_user,
        detail=f"Unggah arsip baru ({created_obj.hak_akses})",
        commit=False,
    )
    await db.commit()
    return await arsip.get_by_id(db, created_obj.id_dokumen)


# =========================================================
# DOCUMENT-SCOPED ROUTES (/{id_dokumen}...)
# =========================================================


@router.get("/{id_dokumen}", response_model=DokumenArsipResponse)
async def read_arsip_by_id(
    *,
    current_user: Pegawai = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    id_dokumen: int,
) -> Any:
    db_obj = await arsip.get_by_id(db, id_dokumen=id_dokumen)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Dokumen arsip tidak ditemukan")
    if not await arsip.can_view(db, db_obj, current_user):
        raise HTTPException(403, "Dokumen terbatas atau rahasia")
    await arsip.log_audit(db, doc=db_obj, aksi="view", actor=current_user, detail="Melihat detail dokumen")
    return db_obj


@router.get("/{id_dokumen}/audit-log", response_model=List[ArsipAuditLogResponse])
async def get_doc_audit_log(
    id_dokumen: int,
    current_user: Pegawai = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    db_obj = await arsip.get_by_id(db, id_dokumen=id_dokumen)
    if not db_obj:
        raise HTTPException(404, "Dokumen arsip tidak ditemukan")
    if not await arsip.can_view(db, db_obj, current_user):
        raise HTTPException(403, "Akses ditolak")
    rows = (
        await db.scalars(
            select(ArsipAuditLog)
            .where(ArsipAuditLog.id_dokumen == id_dokumen)
            .order_by(desc(ArsipAuditLog.created_at), desc(ArsipAuditLog.id))
            .limit(100)
        )
    ).all()
    return list(rows)


@router.get("/{id_dokumen}/access-grants", response_model=List[ArsipAccessGrantResponse])
async def list_access_grants(
    id_dokumen: int,
    current_user: Pegawai = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    db_obj = await arsip.get_by_id(db, id_dokumen=id_dokumen)
    if not db_obj:
        raise HTTPException(404, "Dokumen arsip tidak ditemukan")
    if not is_admin(current_user) and db_obj.id_pegawai != current_user.id_pegawai:
        raise HTTPException(403, "Hanya pemilik dokumen atau administrator yang dapat melihat izin akses")
    rows = (
        await db.scalars(
            select(ArsipAccessGrant)
            .where(ArsipAccessGrant.id_dokumen == id_dokumen)
            .order_by(desc(ArsipAccessGrant.created_at))
        )
    ).all()
    out = []
    for r in rows:
        grantee = await db.get(Pegawai, r.id_pegawai)
        granter = await db.get(Pegawai, r.granted_by)
        out.append({
            "id": r.id,
            "id_dokumen": r.id_dokumen,
            "id_pegawai": r.id_pegawai,
            "nama_pegawai": grantee.nama if grantee else None,
            "granted_by": r.granted_by,
            "nama_pemberi": granter.nama if granter else None,
            "alasan": r.alasan,
            "valid_until": r.valid_until,
            "created_at": r.created_at,
        })
    return out


@router.post("/{id_dokumen}/access-grants", response_model=ArsipAccessGrantResponse, status_code=status.HTTP_201_CREATED)
async def create_access_grant(
    id_dokumen: int,
    payload: ArsipAccessGrantCreate,
    current_user: Pegawai = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    db_obj = await arsip.get_by_id(db, id_dokumen=id_dokumen)
    if not db_obj:
        raise HTTPException(404, "Dokumen arsip tidak ditemukan")
    if not is_admin(current_user) and db_obj.id_pegawai != current_user.id_pegawai:
        raise HTTPException(403, "Hanya pemilik dokumen atau administrator yang dapat memberikan izin akses")
    target = await db.get(Pegawai, payload.id_pegawai)
    if not target:
        raise HTTPException(404, "Pegawai penerima akses tidak ditemukan")

    grant = ArsipAccessGrant(
        id_dokumen=id_dokumen,
        id_pegawai=payload.id_pegawai,
        granted_by=current_user.id_pegawai,
        alasan=payload.alasan.strip() if payload.alasan else None,
        valid_until=payload.valid_until,
    )
    db.add(grant)
    await arsip.log_audit(
        db,
        doc=db_obj,
        aksi="grant_access",
        actor=current_user,
        detail=f"Izin akses diberikan kepada {target.nama} (berlaku s.d. {payload.valid_until or 'tanpa batas'})",
        commit=False,
    )
    await db.commit()
    await db.refresh(grant)
    return {
        "id": grant.id,
        "id_dokumen": grant.id_dokumen,
        "id_pegawai": grant.id_pegawai,
        "nama_pegawai": target.nama,
        "granted_by": grant.granted_by,
        "nama_pemberi": current_user.nama,
        "alasan": grant.alasan,
        "valid_until": grant.valid_until,
        "created_at": grant.created_at,
    }


@router.delete("/{id_dokumen}/access-grants/{grant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_access_grant(
    id_dokumen: int,
    grant_id: int,
    current_user: Pegawai = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    db_obj = await arsip.get_by_id(db, id_dokumen=id_dokumen)
    if not db_obj:
        raise HTTPException(404, "Dokumen arsip tidak ditemukan")
    if not is_admin(current_user) and db_obj.id_pegawai != current_user.id_pegawai:
        raise HTTPException(403, "Hanya pemilik dokumen atau administrator yang dapat mencabut izin akses")
    grant = await db.get(ArsipAccessGrant, grant_id)
    if not grant or grant.id_dokumen != id_dokumen:
        raise HTTPException(404, "Izin akses tidak ditemukan")
    target = await db.get(Pegawai, grant.id_pegawai)
    await db.delete(grant)
    await arsip.log_audit(
        db,
        doc=db_obj,
        aksi="revoke_access",
        actor=current_user,
        detail=f"Izin akses dicabut dari {target.nama if target else grant.id_pegawai}",
        commit=False,
    )
    await db.commit()
    return None


@router.get("/{id_dokumen}/versi", response_model=List[DokumenArsipResponse])
async def list_document_versions(
    id_dokumen: int,
    current_user: Pegawai = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    db_obj = await arsip.get_by_id(db, id_dokumen=id_dokumen)
    if not db_obj:
        raise HTTPException(404, "Dokumen arsip tidak ditemukan")
    if not await arsip.can_view(db, db_obj, current_user):
        raise HTTPException(403, "Akses ditolak")
    root_id = db_obj.parent_dokumen_id or db_obj.id_dokumen
    from sqlalchemy.orm import selectinload
    rows = (
        await db.scalars(
            select(DokumenArsip)
            .options(
                selectinload(DokumenArsip.pegawai).selectinload(Pegawai.bagian),
                selectinload(DokumenArsip.penghapus),
                selectinload(DokumenArsip.klasifikasi),
            )
            .where(or_(DokumenArsip.id_dokumen == root_id, DokumenArsip.parent_dokumen_id == root_id))
            .order_by(desc(DokumenArsip.versi_dokumen), desc(DokumenArsip.id_dokumen))
        )
    ).all()
    return list(rows)


@router.post("/{id_dokumen}/versi", response_model=DokumenArsipResponse, status_code=status.HTTP_201_CREATED)
async def create_document_version(
    id_dokumen: int,
    payload: ArsipNewVersionCreate,
    current_user: Pegawai = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Upload a new revision version of an existing archive document (non-destructive versioning)."""
    db_obj = await arsip.get_by_id(db, id_dokumen=id_dokumen)
    if not db_obj:
        raise HTTPException(404, "Dokumen arsip tidak ditemukan")
    if db_obj.status_hapus:
        raise HTTPException(409, "Pulihkan dokumen dari tempat sampah sebelum mengunggah versi baru")
    if not is_admin(current_user) and db_obj.id_pegawai != current_user.id_pegawai:
        raise HTTPException(403, "Hanya pemilik dokumen atau administrator yang dapat mengunggah versi baru")

    record = await _validate_uploaded_file_for_arsip(db, payload.file_path, current_user)
    if not record:
        raise HTTPException(422, "Berkas upload wajib disertakan untuk versi baru")

    root_id = db_obj.parent_dokumen_id or db_obj.id_dokumen
    existing_versions = (
        await db.scalars(
            select(DokumenArsip.versi_dokumen).where(
                or_(DokumenArsip.id_dokumen == root_id, DokumenArsip.parent_dokumen_id == root_id)
            )
        )
    ).all()
    next_ver = (max(existing_versions) if existing_versions else 1) + 1

    from app.api.v1.endpoints import files as files_ep
    disk_path = (files_ep.STORAGE_ROOT / record.relative_path).resolve()
    extracted = (
        extract_text_from_file(disk_path)
        if files_ep.STORAGE_ROOT in disk_path.parents and disk_path.is_file()
        else None
    )

    new_doc = DokumenArsip(
        nama_dokumen=db_obj.nama_dokumen,
        nomor_dokumen=db_obj.nomor_dokumen,
        id_pegawai=current_user.id_pegawai,
        id_klasifikasi=db_obj.id_klasifikasi,
        kategori=db_obj.kategori,
        event=db_obj.event,
        tanggal_dokumen=payload.tanggal_dokumen or date.today(),
        file_path=str(record.id_file),
        ukuran_file=record.file_size,
        hak_akses=db_obj.hak_akses,
        status_retensi=db_obj.status_retensi,
        nasib_akhir=db_obj.nasib_akhir,
        tanggal_retensi_aktif=db_obj.tanggal_retensi_aktif,
        tanggal_retensi_inaktif=db_obj.tanggal_retensi_inaktif,
        arsip_vital=db_obj.arsip_vital,
        legal_hold=db_obj.legal_hold,
        legal_hold_alasan=db_obj.legal_hold_alasan,
        lokasi_fisik=db_obj.lokasi_fisik,
        nomor_berkas=db_obj.nomor_berkas,
        sha256_hash=record.sha256_hash,
        extracted_text=extracted,
        versi_dokumen=next_ver,
        parent_dokumen_id=root_id,
        sumber_modul="arsip",
    )
    db.add(new_doc)
    await db.flush()
    await arsip.log_audit(
        db,
        doc=new_doc,
        aksi="new_version",
        actor=current_user,
        detail=f"Versi v{next_ver} diunggah" + (f": {payload.catatan_versi}" if payload.catatan_versi else ""),
        commit=False,
    )
    await db.commit()
    return await arsip.get_by_id(db, new_doc.id_dokumen)


@router.put("/{id_dokumen}", response_model=DokumenArsipResponse)
async def update_arsip(
    *,
    db: AsyncSession = Depends(get_db),
    id_dokumen: int,
    arsip_in: DokumenArsipUpdate,
    current_user: Pegawai = Depends(get_current_user),
) -> Any:
    db_obj = await arsip.get_by_id(db, id_dokumen=id_dokumen)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Dokumen arsip tidak ditemukan")

    if db_obj.status_hapus:
        raise HTTPException(409, "Pulihkan dokumen dari tempat sampah sebelum mengubah metadata")

    if not is_admin(current_user) and db_obj.id_pegawai != current_user.id_pegawai:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akses ditolak: Anda tidak memiliki izin untuk mengedit dokumen ini",
        )

    if any(k in arsip_in.model_fields_set for k in ["id_pegawai", "status_hapus", "file_path", "ukuran_file"]):
        raise HTTPException(422, "Pemilik, berkas dan status sampah harus dikelola melalui tindakan khusus")
    if db_obj.ref_tipe and "hak_akses" in arsip_in.model_fields_set:
        raise HTTPException(409, "Hak akses dokumen sinkronisasi modul dikelola otomatis oleh sistem")
    if ("legal_hold" in arsip_in.model_fields_set or "legal_hold_alasan" in arsip_in.model_fields_set) and not is_admin(current_user):
        raise HTTPException(403, "Hanya administrator yang dapat mengubah status Legal Hold")

    klas = None
    if "id_klasifikasi" in arsip_in.model_fields_set and arsip_in.id_klasifikasi is not None:
        klas = await db.get(KodeKlasifikasiArsip, arsip_in.id_klasifikasi)
        if not klas:
            raise HTTPException(422, "Kode klasifikasi arsip tidak ditemukan")

    await arsip.update(db, db_obj=db_obj, obj_in=arsip_in)

    # Recompute JRA if classification or document date changed
    if "id_klasifikasi" in arsip_in.model_fields_set or "tanggal_dokumen" in arsip_in.model_fields_set:
        active_klas = klas or (await db.get(KodeKlasifikasiArsip, db_obj.id_klasifikasi) if db_obj.id_klasifikasi else None)
        if active_klas:
            tgl_aktif, tgl_inaktif, status_ret, nasib = compute_jra(
                db_obj.tanggal_dokumen,
                active_klas.retensi_aktif_tahun,
                active_klas.retensi_inaktif_tahun,
                active_klas.kode_klasifikasi,
                existing_nasib_akhir=db_obj.nasib_akhir,
            )
            db_obj.tanggal_retensi_aktif = tgl_aktif
            db_obj.tanggal_retensi_inaktif = tgl_inaktif
            db_obj.status_retensi = status_ret
            db_obj.nasib_akhir = nasib

    changed_keys = ", ".join(sorted(arsip_in.model_fields_set))
    await arsip.log_audit(
        db,
        doc=db_obj,
        aksi="legal_hold" if "legal_hold" in arsip_in.model_fields_set else "update",
        actor=current_user,
        detail=f"Perubahan metadata: {changed_keys}",
        commit=False,
    )
    await db.commit()
    return await arsip.get_by_id(db, id_dokumen=id_dokumen)


@router.delete("/{id_dokumen}", response_model=DokumenArsipResponse)
@router.patch("/{id_dokumen}/delete", response_model=DokumenArsipResponse)
async def delete_arsip(
    *,
    db: AsyncSession = Depends(get_db),
    id_dokumen: int,
    current_user: Pegawai = Depends(get_current_user),
) -> Any:
    db_obj = await arsip.get_by_id(db, id_dokumen=id_dokumen)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Dokumen arsip tidak ditemukan")

    if db_obj.legal_hold and not is_admin(current_user):
        raise HTTPException(409, "Dokumen dalam status Legal Hold dan tidak dapat dipindahkan ke sampah")

    if not is_admin(current_user):
        is_owner = db_obj.id_pegawai == current_user.id_pegawai
        is_same_section = (
            db_obj.ref_tipe != "workflow_letter"
            and current_user.id_bagian is not None
            and db_obj.pegawai
            and db_obj.pegawai.id_bagian == current_user.id_bagian
            and db_obj.hak_akses in ("biasa", "internal", "publik")
        )
        if not (is_owner or is_same_section):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Akses ditolak: Anda tidak memiliki hak untuk menghapus dokumen ini",
            )

    updated_obj = await arsip.soft_delete(db, id_dokumen=id_dokumen, deleted_by=current_user.id_pegawai)
    await arsip.log_audit(db, doc=updated_obj, aksi="soft_delete", actor=current_user, detail="Dipindahkan ke tempat sampah")
    return updated_obj


@router.patch("/{id_dokumen}/restore", response_model=DokumenArsipResponse)
async def restore_arsip(
    *,
    db: AsyncSession = Depends(get_db),
    id_dokumen: int,
    current_user: Pegawai = Depends(get_current_user),
) -> Any:
    db_obj = await arsip.get_by_id(db, id_dokumen=id_dokumen)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Dokumen arsip tidak ditemukan")

    if not db_obj.status_hapus:
        return db_obj

    if not is_admin(current_user):
        is_owner = db_obj.id_pegawai == current_user.id_pegawai
        is_deleter = db_obj.dihapus_oleh == current_user.id_pegawai
        if not (is_owner or is_deleter):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Akses ditolak: Anda tidak memiliki hak untuk memulihkan dokumen ini",
            )

    updated_obj = await arsip.restore(db, id_dokumen=id_dokumen)
    await arsip.log_audit(db, doc=updated_obj, aksi="restore", actor=current_user, detail="Dipulihkan dari tempat sampah")
    return updated_obj


@router.delete("/{id_dokumen}/permanent")
async def permanent_delete_arsip(
    *,
    db: AsyncSession = Depends(get_db),
    id_dokumen: int,
    current_user: Pegawai = Depends(get_current_user),
) -> Any:
    """
    Permanently delete archive document from database (Hard Delete).
    Enforces PKPU 17/2023 JRA retention, Arsip Vital, Legal Hold, and Permanen guards.
    """
    db_obj = await arsip.get_by_id(db, id_dokumen=id_dokumen)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Dokumen arsip tidak ditemukan")
    if not db_obj.status_hapus:
        raise HTTPException(409, "Pindahkan dokumen ke tempat sampah sebelum menghapus permanen")
    if not is_admin(current_user):
        raise HTTPException(403, 'Hapus permanen memerlukan persetujuan administrator. Gunakan "Ajukan Hapus Permanen".')
    if db_obj.ref_tipe:
        raise HTTPException(409, "Dokumen ini berasal dari modul Surat Menyurat/Realisasi Anggaran dan hanya dapat dipindahkan ke tempat sampah")
    if db_obj.arsip_vital:
        raise HTTPException(409, "Arsip vital dilindungi dan tidak dapat dihapus permanen")
    if db_obj.legal_hold:
        raise HTTPException(409, "Dokumen dalam status Legal Hold (sengketa/audit) dan tidak dapat dihapus permanen")
    if db_obj.nasib_akhir == "permanen":
        raise HTTPException(409, "Dokumen bernasib akhir PERMANEN tidak dapat dimusnahkan")
    if (
        db_obj.id_klasifikasi is not None
        and db_obj.tanggal_retensi_inaktif is not None
        and date.today() <= db_obj.tanggal_retensi_inaktif
    ):
        raise HTTPException(
            409,
            f"Dokumen masih dalam masa retensi JRA (hingga {db_obj.tanggal_retensi_inaktif}) dan belum siap disusutkan",
        )

    # Record immutable audit trail BEFORE deleting the row (id_dokumen becomes NULL via ON DELETE SET NULL)
    await arsip.log_audit(
        db,
        doc=db_obj,
        aksi="permanent_delete",
        actor=current_user,
        detail=f"Hapus permanen arsip {db_obj.nomor_dokumen}",
        commit=True,
    )

    file_path_str = db_obj.file_path
    await arsip.permanent_delete(db, id_dokumen=id_dokumen)

    if file_path_str and str(file_path_str).isdigit():
        from app.api.v1.endpoints import files as files_ep
        fid = int(file_path_str)
        still_used = (
            await db.scalar(select(DokumenArsip.id_dokumen).where(DokumenArsip.file_path == str(fid)).limit(1))
            or await db.scalar(select(WorkflowLetter.id).where(WorkflowLetter.file_id == fid).limit(1))
            or await db.scalar(
                select(RealisasiAnggaran.id_realisasi)
                .where(RealisasiAnggaran.bukti_file_path == f"/api/v1/files/{fid}")
                .limit(1)
            )
        )
        if not still_used:
            rec = await db.get(FileRecord, fid)
            if rec:
                disk_path = (files_ep.STORAGE_ROOT / rec.relative_path).resolve()
                await db.delete(rec)
                await db.commit()
                if files_ep.STORAGE_ROOT in disk_path.parents:
                    disk_path.unlink(missing_ok=True)

    return {"status": "success", "message": f"Dokumen {id_dokumen} berhasil dihapus permanen"}


@router.post("/{id_dokumen}/ajukan-hapus", response_model=DokumenArsipResponse)
async def ajukan_hapus_permanen(
    *,
    db: AsyncSession = Depends(get_db),
    id_dokumen: int,
    payload: PermintaanHapusRequest,
    current_user: Pegawai = Depends(get_current_user),
) -> Any:
    db_obj = await arsip.get_by_id(db, id_dokumen=id_dokumen)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Dokumen arsip tidak ditemukan")
    if not db_obj.status_hapus:
        raise HTTPException(409, "Pindahkan dokumen ke tempat sampah sebelum mengajukan hapus permanen")
    if db_obj.ref_tipe:
        raise HTTPException(409, "Dokumen ini berasal dari modul Surat Menyurat/Realisasi Anggaran dan tidak dapat dihapus permanen")
    if db_obj.arsip_vital or db_obj.legal_hold or db_obj.nasib_akhir == "permanen":
        raise HTTPException(409, "Dokumen dilindungi (Vital / Legal Hold / Permanen) dan tidak dapat diajukan hapus permanen")
    if not is_admin(current_user) and current_user.id_pegawai != db_obj.id_pegawai:
        raise HTTPException(403, "Hanya pemilik dokumen yang dapat mengajukan penghapusan permanen")
    if db_obj.hapus_status == "diajukan":
        raise HTTPException(409, "Permintaan hapus permanen sudah diajukan dan menunggu persetujuan administrator")
    db_obj.hapus_status = "diajukan"
    db_obj.pengaju_hapus = current_user
    db_obj.hapus_diajukan_pada = datetime.now()
    db_obj.hapus_alasan = payload.alasan.strip()
    db_obj.hapus_catatan_admin = None
    await db.commit()
    return await arsip.get_by_id(db, id_dokumen=id_dokumen)


@router.post("/{id_dokumen}/tolak-hapus", response_model=DokumenArsipResponse)
async def tolak_hapus_permanen(
    *,
    db: AsyncSession = Depends(get_db),
    id_dokumen: int,
    payload: TolakHapusRequest,
    current_user: Pegawai = Depends(require_admin),
) -> Any:
    db_obj = await arsip.get_by_id(db, id_dokumen=id_dokumen)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Dokumen arsip tidak ditemukan")
    if db_obj.hapus_status != "diajukan":
        raise HTTPException(409, "Tidak ada permintaan hapus permanen yang menunggu untuk dokumen ini")
    db_obj.hapus_status = "ditolak"
    db_obj.hapus_catatan_admin = payload.catatan.strip()
    await db.commit()
    return await arsip.get_by_id(db, id_dokumen=id_dokumen)
