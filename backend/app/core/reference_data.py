"""Official reference (master) data required by the letter and archive screens.

These are not demo records: the outgoing-letter form needs at least one archive
classification code and one letter type to choose from. `ensure_reference_data`
inserts missing rows by code and never changes or deletes existing rows, so it is
safe to run on every install and upgrade.
"""
from sqlalchemy import select

from app.models.schema import Bagian, JenisSurat, KodeKlasifikasiArsip

# 6 Subbagian resmi Sekretariat KPU Provinsi Sulawesi Utara (dipetakan ke 3 Unit Bagian pada form Sign Up)
SUBBAGIAN_KPU = [
    ("BAG-01", "Subbagian SDM dan Partisipasi Masyarakat"),
    ("BAG-02", "Subbagian RENDATIN (Perencanaan, Data dan Informasi)"),
    ("BAG-03", "Subbagian Teknis Penyelenggaraan Pemilu"),
    ("BAG-04", "Subbagian Hukum"),
    ("BAG-05", "Subbagian Umum dan Logistik (UMLOG)"),
    ("BAG-06", "Subbagian Keuangan"),
]

# (kode, nama, kategori_utama, retensi_aktif_tahun, retensi_inaktif_tahun, hak_akses)
# Mengacu pada Keputusan KPU Nomor 1257 Tahun 2024 & PKPU 17/2023 (JRA)
KLASIFIKASI_ARSIP = [
    ("PL.01.1", "Perencanaan Pemilu & Pilkada", "Penyelenggaraan Pemilu", 2, 5, "Internal"),
    ("PL.02.1", "Pemutakhiran Data Pemilih", "Penyelenggaraan Pemilu", 3, 5, "Internal"),
    ("PL.02.2", "Pencalonan & Verifikasi Peserta Pemilu", "Penyelenggaraan Pemilu", 3, 5, "Terbatas"),
    ("PL.02.4", "Pemungutan, Penghitungan & Rekapitulasi Suara", "Penyelenggaraan Pemilu", 5, 10, "Publik"),
    ("PP.01.1", "Sosialisasi & Pendidikan Pemilih", "Partisipasi & Humas", 2, 3, "Publik"),
    ("PP.06.1", "Hubungan Masyarakat & Layanan Informasi (PPID)", "Partisipasi & Humas", 2, 3, "Publik"),
    ("HM.01.1", "Dokumentasi, Publikasi & Hubungan Kelembagaan", "Partisipasi & Humas", 2, 3, "Publik"),
    ("HR.01.2", "Surat Tugas & Kepegawaian", "SDM & Kepegawaian", 2, 5, "Internal"),
    ("SDM.02.1", "Pengembangan Kompetensi, Mutasi & Disiplin Pegawai", "SDM & Kepegawaian", 3, 5, "Terbatas"),
    ("HK.01.1", "Peraturan & Keputusan KPU", "Hukum", 5, 10, "Publik"),
    ("HK.03.1", "Advokasi, Sengketa & Bantuan Hukum", "Hukum", 5, 10, "Rahasia"),
    ("KU.01.3", "DIPA & Pertanggungjawaban Keuangan", "Keuangan", 5, 7, "Internal"),
    ("KU.02.1", "Realisasi Anggaran, SPP/SPM/SP2D & Perbendaharaan", "Keuangan", 5, 10, "Terbatas"),
    ("KU.03.1", "Laporan Keuangan, Rekonsiliasi & Akuntansi", "Keuangan", 5, 10, "Internal"),
    ("PR.01.1", "Perencanaan Program, Anggaran & Evaluasi Kinerja", "Perencanaan & Data", 3, 5, "Internal"),
    ("IT.01.1", "Data & Infrastruktur IT", "Data & Informasi", 2, 5, "Internal"),
    ("RT.01.1", "Ketatausahaan, Persuratan & Kearsipan", "Umum & Logistik", 2, 3, "Internal"),
    ("RT.02.1", "Perlengkapan, Logistik Pemilu & Pengelolaan BMN", "Umum & Logistik", 5, 5, "Internal"),
    ("PW.01.1", "Pengawasan Internal, PIPK & Tindak Lanjut Audit", "Pengawasan", 5, 5, "Rahasia"),
]

# (kode_jenis, nama_jenis, format_nomor)
# Mengacu pada PKPU 2/2021 jo. PKPU 8/2021 tentang Tata Naskah Dinas KPU
JENIS_SURAT = [
    ("SD", "Surat Dinas", "{nomor_urut}/{kode_klasifikasi}-SD/71/{bulan_romawi}/{tahun}"),
    ("ST", "Surat Tugas", "{nomor_urut}/{kode_klasifikasi}-ST/71/{bulan_romawi}/{tahun}"),
    ("ND", "Nota Dinas", "{nomor_urut}/ND-{kode_bagian}/71/{bulan_romawi}/{tahun}"),
    ("Kpt", "Keputusan KPU", "{nomor_urut}/{kode_klasifikasi}-Kpt/71/{tahun}"),
    ("Und", "Surat Undangan", "{nomor_urut}/{kode_klasifikasi}-Und/71/{bulan_romawi}/{tahun}"),
    ("SE", "Surat Edaran", "{nomor_urut}/{kode_klasifikasi}-SE/71/{tahun}"),
    ("BA", "Berita Acara", "{nomor_urut}/{kode_klasifikasi}-BA/71/{bulan_romawi}/{tahun}"),
    ("SKet", "Surat Keterangan", "{nomor_urut}/{kode_klasifikasi}-SKet/71/{bulan_romawi}/{tahun}"),
    ("Peng", "Pengumuman", "{nomor_urut}/{kode_klasifikasi}-Peng/71/{bulan_romawi}/{tahun}"),
    ("SPPD", "Surat Perjalanan Dinas", "{nomor_urut}/{kode_klasifikasi}-SPPD/71/{bulan_romawi}/{tahun}"),
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


async def ensure_subbagian_master(session) -> dict[str, int]:
    """Insert missing official KPU Sulut Subbagian rows (BAG-01..BAG-06) idempotently."""
    bagian_map: dict[str, int] = {}
    for kode, nama in SUBBAGIAN_KPU:
        row = await session.scalar(select(Bagian).where(Bagian.kode_bagian == kode))
        if row is None:
            row = Bagian(kode_bagian=kode, nama_bagian=nama)
            session.add(row)
            await session.flush()
        bagian_map[kode] = row.id_bagian
    return bagian_map
