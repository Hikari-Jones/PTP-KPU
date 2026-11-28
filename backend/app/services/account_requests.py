"""Layanan struktur Unit Bagian & Subbagian serta permintaan pendaftaran akun baru."""

from typing import Dict, List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.reference_data import ensure_subbagian_master
from app.models.schema import Bagian, PermintaanAkun


UNIT_BAGIAN_DEFS: List[Dict[str, object]] = [
    {
        "kode": "BAGIAN-1",
        "nama": "Bagian Keuangan, Umum, dan Logistik",
        "subbagian_codes": ["BAG-06", "BAG-05"],
        "keywords": ["keuangan", "umum", "logistik", "umlog"],
    },
    {
        "kode": "BAGIAN-2",
        "nama": "Bagian Perencanaan, Data dan Informasi, Partisipasi Masyarakat, dan SDM",
        "subbagian_codes": ["BAG-02", "BAG-01"],
        "keywords": ["rendatin", "perencanaan", "sdm", "partisipasi"],
    },
    {
        "kode": "BAGIAN-3",
        "nama": "Bagian Teknis Penyelenggaraan Pemilu dan Hukum",
        "subbagian_codes": ["BAG-03", "BAG-04"],
        "keywords": ["teknis", "hukum", "pengawasan"],
    },
]


async def ensure_permintaan_akun_table(db: AsyncSession) -> None:
    """Pastikan tabel permintaan_akun tersedia tanpa memerlukan migrasi manual."""
    conn = await db.connection()
    await conn.run_sync(
        lambda sync_conn: PermintaanAkun.__table__.create(sync_conn, checkfirst=True)
    )


async def ensure_is_online_column(db: AsyncSession) -> None:
    """Pastikan kolom is_online tersedia pada tabel pegawai."""
    from sqlalchemy import inspect, text

    conn = await db.connection()

    def _has_col(sync_conn):
        cols = [c["name"] for c in inspect(sync_conn).get_columns("pegawai")]
        return "is_online" in cols

    exists = await conn.run_sync(_has_col)
    if not exists:
        await db.execute(text("ALTER TABLE pegawai ADD COLUMN is_online BOOLEAN NOT NULL DEFAULT 0"))
        await db.commit()


async def get_unit_bagian_options(db: AsyncSession) -> List[Dict[str, object]]:
    """Kelompokkan daftar subbagian database ke dalam 3 Unit Bagian utama."""
    rows = (await db.execute(select(Bagian).order_by(Bagian.kode_bagian, Bagian.id_bagian))).scalars().all()
    by_code = {(b.kode_bagian or "").strip().upper(): b for b in rows}

    required_codes = {code for unit in UNIT_BAGIAN_DEFS for code in unit["subbagian_codes"]}
    if not (required_codes & set(by_code.keys())):
        await ensure_subbagian_master(db)
        await db.commit()
        rows = (await db.execute(select(Bagian).order_by(Bagian.kode_bagian, Bagian.id_bagian))).scalars().all()
        by_code = {(b.kode_bagian or "").strip().upper(): b for b in rows}

    result: List[Dict[str, object]] = []
    for unit in UNIT_BAGIAN_DEFS:
        subs: List[Dict[str, object]] = []
        for code in unit["subbagian_codes"]:
            b = by_code.get(code)
            if b:
                subs.append({
                    "id_bagian": b.id_bagian,
                    "kode_bagian": b.kode_bagian,
                    "nama_bagian": b.nama_bagian,
                })
        # Fallback keyword matching jika kode berbeda di database
        if not subs:
            kws = unit["keywords"]
            for b in rows:
                nama_low = (b.nama_bagian or "").lower()
                if any(kw in nama_low for kw in kws):
                    subs.append({
                        "id_bagian": b.id_bagian,
                        "kode_bagian": b.kode_bagian,
                        "nama_bagian": b.nama_bagian,
                    })
                if len(subs) >= 2:
                    break
        result.append({
            "kode": unit["kode"],
            "nama": unit["nama"],
            "subbagian": subs,
        })
    return result


async def resolve_bagian_for_kabag(db: AsyncSession, unit_bagian_name: str) -> Optional[int]:
    """Petakan Kepala Bagian ke id_bagian utama pada unit bagiannya agar relasi database tetap valid."""
    options = await get_unit_bagian_options(db)
    target_low = unit_bagian_name.strip().lower()
    for opt in options:
        if str(opt["nama"]).lower() == target_low:
            subs = opt["subbagian"]
            if isinstance(subs, list) and subs:
                return int(subs[0]["id_bagian"])
    return None
