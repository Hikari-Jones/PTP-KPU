"""Official reference (master) data required by the letter and archive screens.

These are not demo records: the outgoing-letter form needs at least one archive
classification code and one letter type to choose from. `ensure_reference_data`
inserts missing rows by code and never changes or deletes existing rows, so it is
safe to run on every install and upgrade.
"""
from sqlalchemy import select

from app.models.schema import JenisSurat, KodeKlasifikasiArsip

# (kode, nama, kategori_utama, retensi_aktif_tahun, retensi_inaktif_tahun, hak_akses)
KLASIFIKASI_ARSIP = [
    ("PL.01.1", "Perencanaan Pemilu & Pilkada", "Penyelenggaraan Pemilu", 2, 5, "Internal"),
    ("PL.02.1", "Pemutakhiran Data Pemilih", "Penyelenggaraan Pemilu", 3, 5, "Internal"),
    ("HR.01.2", "Surat Tugas & Kepegawaian", "SDM & Kepegawaian", 2, 5, "Internal"),
    ("HK.01.1", "Peraturan & Keputusan KPU", "Hukum", 5, 10, "Publik"),
    ("KU.01.3", "DIPA & Pertanggungjawaban Keuangan", "Keuangan", 5, 7, "Internal"),
    ("IT.01.1", "Data & Infrastruktur IT", "Data & Informasi", 2, 5, "Internal"),
]

# (kode_jenis, nama_jenis, format_nomor)
JENIS_SURAT = [
    ("SD", "Surat Dinas", "{nomor_urut}/{kode_klasifikasi}-SD/71/{bulan_romawi}/{tahun}"),
    ("ST", "Surat Tugas", "{nomor_urut}/{kode_klasifikasi}-ST/71/{bulan_romawi}/{tahun}"),
    ("ND", "Nota Dinas", "{nomor_urut}/ND-{kode_bagian}/71/{bulan_romawi}/{tahun}"),
    ("Kpt", "Keputusan KPU", "{nomor_urut}/{kode_klasifikasi}-Kpt/71/{tahun}"),
    ("Und", "Surat Undangan", "{nomor_urut}/{kode_klasifikasi}-Und/71/{bulan_romawi}/{tahun}"),
]


async def ensure_reference_data(session) -> tuple[dict, dict]:
    """Insert missing reference rows; return ({kode_klasifikasi: id}, {kode_jenis: id})."""
    klasifikasi, jenis = {}, {}
    for kode, nama, kategori, aktif, inaktif, akses in KLASIFIKASI_ARSIP:
        row = await session.scalar(select(KodeKlasifikasiArsip).where(KodeKlasifikasiArsip.kode_klasifikasi == kode))
        if row is None:
            row = KodeKlasifikasiArsip(kode_klasifikasi=kode, nama_klasifikasi=nama, kategori_utama=kategori,
                                       retensi_aktif_tahun=aktif, retensi_inaktif_tahun=inaktif, hak_akses=akses)
            session.add(row)
            await session.flush()
        klasifikasi[kode] = row.id_klasifikasi
    for kode, nama, fmt in JENIS_SURAT:
        row = await session.scalar(select(JenisSurat).where(JenisSurat.kode_jenis == kode))
        if row is None:
            row = JenisSurat(kode_jenis=kode, nama_jenis=nama, format_nomor=fmt)
            session.add(row)
            await session.flush()
        jenis[kode] = row.id_jenis_surat
    return klasifikasi, jenis
