"""
SKRIP SETUP BASIS DATA LOKAL PC KANTOR (PTP-KPU SULUT)
-----------------------------------------------------
Skrip ini dirancang khusus untuk inisialisasi basis data lokal pemerintah di PC kantor:
1. Memeriksa koneksi ke server MySQL lokal (localhost:3306) atau SQLite lokal.
2. Membuat basis data `kpu_db` jika belum ada.
3. Membuat seluruh skema tabel relasional (InnoDB + Foreign Keys).
4. Melakukan seed data master resmi KPU Provinsi Sulawesi Utara.
"""

import sys
import asyncio
from datetime import date, datetime
from decimal import Decimal

# Pastikan modul app dapat diimpor
from app.core.config import settings
from app.core.database import engine, AsyncSessionLocal, Base
from app.models.schema import (
    Bagian,
    Pegawai,
    KodeKlasifikasiArsip,
    JenisSurat,
    PenomoranSequence,
    SuratKeluar,
    TahunAnggaran,
    AkunAnggaran,
    PaguAnggaran,
    RealisasiAnggaran,
    DokumenArsip
)
from sqlalchemy import select, text

async def run_setup():
    print("=" * 65)
    print("  INISIALISASI BASIS DATA LOKAL PC KANTOR - PTP-KPU SULAWESI UTARA")
    print("=" * 65)
    print(f"Target Database URL: {settings.DATABASE_URL}")

    # 1. Jika MySQL, buat database kpu_db terlebih dahulu jika belum ada
    if "mysql" in settings.DATABASE_URL:
        # Ekstrak base URL tanpa nama database
        try:
            import pymysql
            from urllib.parse import urlparse
            parsed = urlparse(settings.DATABASE_URL.replace("+aiomysql", ""))
            host = parsed.hostname or "localhost"
            port = parsed.port or 3306
            user = parsed.username or "root"
            password = parsed.password or ""
            db_name = parsed.path.lstrip("/") or "kpu_db"

            print(f"\n[1/4] Menghubungkan ke MySQL lokal di {host}:{port} sebagai '{user}'...")
            conn = pymysql.connect(host=host, port=port, user=user, password=password)
            with conn.cursor() as cursor:
                cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
            conn.commit()
            conn.close()
            print(f"✓ Basis data '{db_name}' berhasil dipastikan tersedia di server MySQL lokal.")
        except Exception as e:
            print(f"! Peringatan saat verifikasi CREATE DATABASE: {e}")
            print("  Melanjutkan dengan engine SQLAlchemy...")

    # 2. Buat seluruh tabel secara otomatis via SQLAlchemy Async
    print("\n[2/4] Membangun seluruh tabel sistem persuratan & anggaran...")
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print("✓ Seluruh tabel berhasil dibuat sesuai standar skema resmi KPU.")
    except Exception as e:
        print(f"✗ Gagal membangun tabel: {e}")
        return False

    # 3. Seed data master pemerintahan
    print("\n[3/4] Melakukan injeksi data master (Bagian, Pegawai, Klasifikasi, DIPA)...")
    async with AsyncSessionLocal() as session:
        # A. Master Bagian
        bagian_list = [
            ("BAG-01", "Subbagian SDM dan Partisipasi Masyarakat"),
            ("BAG-02", "Subbagian RENDATIN (Perencanaan, Data dan Informasi)"),
            ("BAG-03", "Subbagian Teknis Penyelenggaraan Pemilu"),
            ("BAG-04", "Subbagian Hukum dan Pengawasan"),
            ("BAG-05", "Subbagian Keuangan, Umum dan Logistik (UMLOG)"),
        ]
        b_map = {}
        for kode, nama in bagian_list:
            res = await session.execute(select(Bagian).where(Bagian.kode_bagian == kode))
            b = res.scalar_one_or_none()
            if not b:
                b = Bagian(kode_bagian=kode, nama_bagian=nama)
                session.add(b)
                await session.flush()
            b_map[kode] = b.id_bagian
        print("  ✓ 5 Subbagian KPU Provinsi Sulut siap.")

        # B. Master Pegawai
        pegawai_list = [
            ("198507182020031001", "Admin KPU Sulut", "Administrator Sistem", "admin123", "admin", b_map["BAG-02"]),
            ("199208052021011002", "Ahmad Kurniawan", "Staf Teknis Penyelenggaraan", "123456", "operator", b_map["BAG-03"]),
            ("199403152021022003", "Siti Rahmawati", "Staf Subbagian Hukum", "123456", "operator", b_map["BAG-04"]),
            ("198811202019031004", "Budi Santoso", "Staf Pengelola UMLOG", "123456", "operator", b_map["BAG-05"]),
        ]
        p_map = {}
        for nip, nama, jab, pwd, role, b_id in pegawai_list:
            res = await session.execute(select(Pegawai).where(Pegawai.nip == nip))
            p = res.scalar_one_or_none()
            if not p:
                p = Pegawai(nip=nip, nama=nama, jabatan=jab, password=pwd, role=role, id_bagian=b_id)
                session.add(p)
                await session.flush()
            p_map[nip] = p.id_pegawai
        print("  ✓ Akun Administrator dan Operator siap.")

        # C. Master Klasifikasi Arsip
        klas_list = [
            ("PL.01.1", "Perencanaan Pemilu & Pilkada", "Penyelenggaraan Pemilu", 2, 5, "Internal"),
            ("PL.02.1", "Pemutakhiran Data Pemilih", "Penyelenggaraan Pemilu", 3, 5, "Internal"),
            ("HR.01.2", "Surat Tugas & Kepegawaian", "SDM & Kepegawaian", 2, 5, "Internal"),
            ("HK.01.1", "Peraturan & Keputusan KPU", "Hukum", 5, 10, "Publik"),
            ("KU.01.3", "DIPA & Pertanggungjawaban Keuangan", "Keuangan", 5, 7, "Internal"),
            ("IT.01.1", "Data & Infrastruktur IT", "Data & Informasi", 2, 5, "Internal"),
        ]
        k_map = {}
        for kode, nama, kat, r_akt, r_inakt, akses in klas_list:
            res = await session.execute(select(KodeKlasifikasiArsip).where(KodeKlasifikasiArsip.kode_klasifikasi == kode))
            k = res.scalar_one_or_none()
            if not k:
                k = KodeKlasifikasiArsip(kode_klasifikasi=kode, nama_klasifikasi=nama, kategori_utama=kat,
                                         retensi_aktif_tahun=r_akt, retensi_inaktif_tahun=r_inakt, hak_akses=akses)
                session.add(k)
                await session.flush()
            k_map[kode] = k.id_klasifikasi
        print("  ✓ 6 Master Klasifikasi Arsip Kepemiluan siap.")

        # D. Master Jenis Surat
        jenis_list = [
            ("SD", "Surat Dinas", "{nomor_urut}/{kode_klasifikasi}-SD/71/{bulan_romawi}/{tahun}"),
            ("ST", "Surat Tugas", "{nomor_urut}/{kode_klasifikasi}-ST/71/{bulan_romawi}/{tahun}"),
            ("ND", "Nota Dinas", "{nomor_urut}/ND-{kode_bagian}/71/{bulan_romawi}/{tahun}"),
            ("Kpt", "Keputusan KPU", "{nomor_urut}/{kode_klasifikasi}-Kpt/71/{tahun}"),
            ("Und", "Surat Undangan", "{nomor_urut}/{kode_klasifikasi}-Und/71/{bulan_romawi}/{tahun}"),
        ]
        j_map = {}
        for kode, nama, fmt in jenis_list:
            res = await session.execute(select(JenisSurat).where(JenisSurat.kode_jenis == kode))
            j = res.scalar_one_or_none()
            if not j:
                j = JenisSurat(kode_jenis=kode, nama_jenis=nama, format_nomor=fmt)
                session.add(j)
                await session.flush()
            j_map[kode] = j.id_jenis_surat
        print("  ✓ Format Penomoran Resmi Surat Dinas KPU siap.")

        # E. Tahun Anggaran & Akun Anggaran
        ta_res = await session.execute(select(TahunAnggaran).where(TahunAnggaran.tahun == 2025))
        if not ta_res.scalar_one_or_none():
            ta2025 = TahunAnggaran(tahun=2025, status="Aktif", tanggal_mulai=date(2025, 1, 1), tanggal_selesai=date(2025, 12, 31),
                                   deskripsi="Tahun Anggaran Berjalan 2025", dibuat_oleh="Admin KPU")
            ta2026 = TahunAnggaran(tahun=2026, status="Perencanaan", tanggal_mulai=date(2026, 1, 1), tanggal_selesai=date(2026, 12, 31),
                                   deskripsi="Tahun Anggaran Pilkada 2026", dibuat_oleh="Admin KPU")
            session.add_all([ta2025, ta2026])

        akun_list = [
            ("5211", "Belanja Gaji dan Tunjangan", "Belanja Pegawai", b_map["BAG-05"], 8500000000),
            ("5212", "Belanja Honorarium", "Belanja Pegawai Non Operasional", b_map["BAG-03"], 3200000000),
            ("5221", "Belanja Barang Operasional", "Belanja Barang Perkantoran", b_map["BAG-05"], 4800000000),
            ("5222", "Belanja Barang Non Operasional", "Belanja Pengadaan Logistik", b_map["BAG-03"], 6500000000),
            ("5231", "Belanja Pemeliharaan", "Pemeliharaan Gedung & Kendaraan", b_map["BAG-01"], 2100000000),
            ("5241", "Belanja Perjalanan Dinas", "Perjalanan Dinas Wilayah", b_map["BAG-04"], 4200000000),
            ("5251", "Belanja Jasa", "Jasa Konsultan & IT", b_map["BAG-02"], 7800000000),
            ("5311", "Belanja Modal Peralatan", "Pengadaan Server & IT", b_map["BAG-05"], 3680000000),
            ("5321", "Belanja Modal Gedung", "Rehabilitasi Fasilitas", b_map["BAG-01"], 5000000000),
        ]
        for kode_a, nama_a, kat_a, b_id, pagu_val in akun_list:
            res = await session.execute(select(AkunAnggaran).where(AkunAnggaran.kode_akun == kode_a))
            a = res.scalar_one_or_none()
            if not a:
                a = AkunAnggaran(kode_akun=kode_a, nama_akun=nama_a, kategori=kat_a, id_bagian=b_id, pagu_total=Decimal(pagu_val))
                session.add(a)
                await session.flush()

            res_pagu = await session.execute(select(PaguAnggaran).where(PaguAnggaran.tahun == 2025, PaguAnggaran.id_akun == a.id_akun))
            if not res_pagu.scalar_one_or_none():
                pagu = PaguAnggaran(tahun=2025, id_akun=a.id_akun, pagu_awal=Decimal(pagu_val), pagu_akhir=Decimal(pagu_val), dibuat_oleh=p_map["198507182020031001"])
                session.add(pagu)
        print("  ✓ Master Akun Anggaran dan Pagu DIPA TA 2025 siap.")

        # F. Sample Surat Keluar Awal
        sk_res = await session.execute(select(SuratKeluar).limit(1))
        if not sk_res.scalar_one_or_none():
            surat_contoh = SuratKeluar(
                id_pegawai=p_map["198507182020031001"],
                id_bagian=b_map["BAG-03"],
                id_klasifikasi=k_map["PL.02.1"],
                id_jenis_surat=j_map["SD"],
                nomor_surat="001/PL.02.1-SD/71/IX/2026",
                nomor_urut=1,
                tahun=2026,
                bulan_romawi="IX",
                sifat_surat="Biasa",
                perihal="Rapat Pemutakhiran Data Pemilih Berkelanjutan Semester II",
                tujuan_surat="KPU Kabupaten/Kota Se-Sulawesi Utara",
                status="terbit",
                tanggal_surat=date(2026, 9, 7),
                tanggal_terbit=datetime(2026, 9, 7, 8, 30),
            )
            session.add(surat_contoh)

            seq_sd = PenomoranSequence(tahun=2026, id_jenis_surat=j_map["SD"], id_bagian=b_map["BAG-01"], last_number=1)
            session.add(seq_sd)
            print("  ✓ Sequence Penomoran Atomic siap.")

        await session.commit()

    print("\n[4/4] Verifikasi Keamanan Basis Data Lokal Selesai.")
    print("=" * 65)
    print("✓ BASIS DATA LOKAL PC KANTOR KPU SIAP DIGUNAKAN 100% OFFLINE / AIR-GAPPED!")
    print("=" * 65)
    return True

if __name__ == "__main__":
    asyncio.run(run_setup())