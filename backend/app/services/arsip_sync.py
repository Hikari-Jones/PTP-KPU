"""Mirror documents from the letter and budget modules into the archive.

Each source record gets exactly one archive row, keyed by (ref_tipe, ref_id),
so syncing is idempotent: it can run after every save and again at startup to
backfill older data. Rows a user moved to the trash stay in the trash.
"""
import logging
import re
from datetime import date
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.operations import WorkflowLetter
from app.models.schema import (
    AkunAnggaran,
    DokumenArsip,
    FileRecord,
    RealisasiAnggaran,
    SuratKeluar,
)

logger = logging.getLogger("ptp_kpu.arsip_sync")

SUMBER_SURAT = "surat"
SUMBER_REALISASI = "realisasi"
KATEGORI = {SUMBER_SURAT: "Surat Menyurat", SUMBER_REALISASI: "Realisasi Anggaran"}
# Letters and budget evidence are restricted to the owner's section (and admins).
HAK_AKSES_MODUL = "terbatas"


def _cut(value: Optional[str], length: int) -> Optional[str]:
    return value[:length] if value else value


async def _upsert(
    db: AsyncSession,
    *,
    ref_tipe: str,
    ref_id: int,
    sumber: str,
    sub_kategori: str,
    id_pegawai: int,
    nama: str,
    nomor: str,
    tanggal: date,
    file_id: Optional[int] = None,
    event: Optional[str] = None,
    id_surat_keluar: Optional[int] = None,
    id_klasifikasi: Optional[int] = None,
    cache: Optional["_SyncCache"] = None,
) -> DokumenArsip:
    if cache is not None:
        doc = cache.docs.get((ref_tipe, ref_id))
        ukuran = cache.sizes.get(file_id, 0) if file_id is not None else 0
    else:
        doc = await db.scalar(
            select(DokumenArsip).where(DokumenArsip.ref_tipe == ref_tipe, DokumenArsip.ref_id == ref_id)
        )
        ukuran = 0
        if file_id is not None:
            record = await db.get(FileRecord, file_id)
            ukuran = record.file_size if record else 0
    values = dict(
        sumber_modul=sumber,
        sub_kategori=_cut(sub_kategori, 150),
        kategori=KATEGORI[sumber],
        id_pegawai=id_pegawai,
        nama_dokumen=_cut(nama, 255) or "(tanpa judul)",
        nomor_dokumen=_cut(nomor, 100) or "-",
        tanggal_dokumen=tanggal,
        file_path=str(file_id) if file_id is not None else None,
        ukuran_file=ukuran,
        event=_cut(event, 150),
        id_surat_keluar=id_surat_keluar,
        id_klasifikasi=id_klasifikasi,
    )
    if doc is None:
        doc = DokumenArsip(ref_tipe=ref_tipe, ref_id=ref_id, hak_akses=HAK_AKSES_MODUL, **values)
        db.add(doc)
        if cache is not None:
            cache.docs[(ref_tipe, ref_id)] = doc
    else:
        for key, value in values.items():
            if getattr(doc, key) != value:  # only changed rows produce an UPDATE
                setattr(doc, key, value)
    return doc


class _SyncCache:
    """Everything a full sync needs, loaded in a few bulk queries instead of per record."""

    def __init__(self, docs, sizes, akun):
        self.docs = docs
        self.sizes = sizes
        self.akun = akun

    @classmethod
    async def load(cls, db: AsyncSession) -> "_SyncCache":
        docs = {(d.ref_tipe, d.ref_id): d for d in (await db.scalars(
            select(DokumenArsip).where(DokumenArsip.ref_tipe.is_not(None)))).all()}
        sizes = dict((await db.execute(select(FileRecord.id_file, FileRecord.file_size))).all())
        akun = {a.id_akun_anggaran: a for a in (await db.scalars(select(AkunAnggaran))).all()}
        return cls(docs, sizes, akun)


async def sync_workflow_letter(db: AsyncSession, letter: WorkflowLetter, cache: Optional[_SyncCache] = None) -> Optional[DokumenArsip]:
    """Registered letters (Surat Masuk / draft Surat Keluar from the Alur module)."""
    return await _upsert(
        db,
        ref_tipe="workflow_letter",
        ref_id=letter.id,
        sumber=SUMBER_SURAT,
        sub_kategori="Surat Masuk" if letter.kind == "masuk" else "Surat Keluar",
        id_pegawai=letter.owner_id,
        nama=letter.subject,
        nomor=letter.number or f"ALUR-{letter.id}",
        tanggal=letter.date,
        file_id=letter.file_id,
        event=f"{letter.sender} → {letter.recipient}",
        cache=cache,
    )


async def sync_surat_keluar(db: AsyncSession, surat: SuratKeluar, cache: Optional[_SyncCache] = None) -> DokumenArsip:
    """Official outgoing letters, including the letter behind each Surat Tugas."""
    tugas = surat.surat_tugas
    return await _upsert(
        db,
        ref_tipe="surat_keluar",
        ref_id=surat.id_surat_keluar,
        sumber=SUMBER_SURAT,
        sub_kategori="Surat Tugas" if tugas else "Surat Keluar",
        id_pegawai=surat.id_pegawai,
        nama=surat.perihal,
        nomor=surat.nomor_surat or (tugas.nomor_tugas if tugas else f"DRAFT-{surat.id_surat_keluar}"),
        tanggal=surat.tanggal_surat,
        event=tugas.tempat_tugas if tugas else surat.tujuan_surat,
        id_surat_keluar=surat.id_surat_keluar,
        id_klasifikasi=surat.id_klasifikasi,
        cache=cache,
    )


def _file_id_from_path(path: Optional[str]) -> Optional[int]:
    match = re.search(r"/files/(\d+)/?$", path or "")
    return int(match.group(1)) if match else None


async def sync_realisasi(db: AsyncSession, tx: RealisasiAnggaran, cache: Optional[_SyncCache] = None) -> Optional[DokumenArsip]:
    """Budget transactions that carry an evidence file (bukti realisasi)."""
    file_id = _file_id_from_path(tx.bukti_file_path)
    if file_id is None or tx.id_pegawai is None:
        return None
    akun = cache.akun.get(tx.id_akun_anggaran) if cache is not None else await db.get(AkunAnggaran, tx.id_akun_anggaran)
    sub = f"{akun.kode_akun} - {akun.nama_akun}" if akun else "Tanpa Akun"
    return await _upsert(
        db,
        ref_tipe="realisasi",
        ref_id=tx.id_realisasi,
        sumber=SUMBER_REALISASI,
        sub_kategori=sub,
        id_pegawai=tx.id_pegawai,
        nama=f"Bukti Realisasi: {tx.uraian_kegiatan}",
        nomor=tx.nomor_dokumen,
        tanggal=tx.tanggal_transaksi,
        file_id=file_id,
        event=tx.bukti_file_nama,
        cache=cache,
    )


async def safe_sync(db: AsyncSession, kind: str, ident: int) -> None:
    """Sync one record after its own transaction committed. A failure is logged and
    repaired by the next full sync; it never undoes the user's save."""
    try:
        if kind == "workflow_letter":
            row = await db.get(WorkflowLetter, ident)
            if row:
                await sync_workflow_letter(db, row)
        elif kind == "surat_keluar":
            row = await db.scalar(
                select(SuratKeluar).options(selectinload(SuratKeluar.surat_tugas))
                .where(SuratKeluar.id_surat_keluar == ident)
            )
            if row:
                await sync_surat_keluar(db, row)
        elif kind == "realisasi":
            row = await db.get(RealisasiAnggaran, ident)
            if row:
                await sync_realisasi(db, row)
        await db.commit()
    except Exception:  # noqa: BLE001 - archive mirroring must not break the source action
        await db.rollback()
        logger.exception("Sinkronisasi arsip gagal untuk %s #%s", kind, ident)


async def sync_all(db: AsyncSession) -> dict:
    """Backfill every letter and budget evidence file into the archive."""
    counts = {"surat": 0, "realisasi": 0}
    cache = await _SyncCache.load(db)
    for letter in (await db.scalars(select(WorkflowLetter))).all():
        await sync_workflow_letter(db, letter, cache)
        counts["surat"] += 1
    surat_rows = await db.scalars(select(SuratKeluar).options(selectinload(SuratKeluar.surat_tugas)))
    for surat in surat_rows.all():
        await sync_surat_keluar(db, surat, cache)
        counts["surat"] += 1
    tx_rows = await db.scalars(select(RealisasiAnggaran).where(RealisasiAnggaran.bukti_file_path.is_not(None)))
    for tx in tx_rows.all():
        if await sync_realisasi(db, tx, cache):
            counts["realisasi"] += 1
    await db.commit()
    return counts
