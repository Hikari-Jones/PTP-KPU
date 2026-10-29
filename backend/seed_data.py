import asyncio
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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

async def seed_all():
    print(">>> Menyiapkan skema database...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✓ Skema tabel berhasil diverifikasi.")

    async with AsyncSessionLocal() as session:
        # 1. Master Bagian
        bagian_data = [
            ("BAG-01", "Subbagian SDM dan Partisipasi Masyarakat"),
            ("BAG-02", "Subbagian RENDATIN (Perencanaan, Data dan Informasi)"),
            ("BAG-03", "Subbagian Teknis Penyelenggaraan Pemilu"),
            ("BAG-04", "Subbagian Hukum dan Pengawasan"),
            ("BAG-05", "Subbagian Keuangan, Umum dan Logistik (UMLOG)"),
        ]
        bagian_map = {}
        for kode, nama in bagian_data:
            res = await session.execute(select(Bagian).where(Bagian.kode_bagian == kode))
            b = res.scalar_one_or_none()
            if not b:
                b = Bagian(kode_bagian=kode, nama_bagian=nama)
                session.add(b)
                await session.flush()
            bagian_map[kode] = b.id_bagian
        print("✓ Master Bagian siap.")

        # 2. Master Pegawai
        pegawai_data = [
            ("198507182020031001", "Admin KPU Sulut", "Administrator Sistem", "admin123", "admin", bagian_map["BAG-02"]),
            ("199208052021011002", "Ahmad Kurniawan", "Staf Teknis Penyelenggaraan", "123456", "operator", bagian_map["BAG-03"]),
            ("199403152021022003", "Siti Rahmawati", "Staf Subbagian Hukum", "123456", "operator", bagian_map["BAG-04"]),
            ("198811202019031004", "Budi Santoso", "Staf Pengelola UMLOG", "123456", "operator", bagian_map["BAG-05"]),
        ]
        pegawai_map = {}
        for nip, nama, jabatan, pwd, role, b_id in pegawai_data:
            res = await session.execute(select(Pegawai).where(Pegawai.nip == nip))
            p = res.scalar_one_or_none()
            if not p:
                p = Pegawai(nip=nip, nama=nama, jabatan=jabatan, password=pwd, role=role, id_bagian=b_id)
                session.add(p)
                await session.flush()
            pegawai_map[nip] = p.id_pegawai
        print("✓ Master Pegawai siap.")

        # 3. Master Kode Klasifikasi Arsip
        klasifikasi_data = [
            ("PL.01.1", "Perencanaan Pemilu & Pilkada", "Penyelenggaraan Pemilu", 2, 5, "Internal"),
            ("PL.02.1", "Pemutakhiran Data Pemilih", "Penyelenggaraan Pemilu", 3, 5, "Internal"),
            ("HR.01.2", "Surat Tugas & Kepegawaian", "SDM & Kepegawaian", 2, 5, "Internal"),
            ("HK.01.1", "Peraturan & Keputusan KPU", "Hukum", 5, 10, "Publik"),
            ("KU.01.3", "DIPA & Pertanggungjawaban Keuangan", "Keuangan", 5, 7, "Internal"),
            ("IT.01.1", "Data & Infrastruktur IT", "Data & Informasi", 2, 5, "Internal"),
        ]
        klas_map = {}
        for kode, nama, kat, r_akt, r_inakt, akses in klasifikasi_data:
            res = await session.execute(select(KodeKlasifikasiArsip).where(KodeKlasifikasiArsip.kode_klasifikasi == kode))
            k = res.scalar_one_or_none()
            if not k:
                k = KodeKlasifikasiArsip(
                    kode_klasifikasi=kode,
                    nama_klasifikasi=nama,
                    kategori_utama=kat,
                    retensi_aktif_tahun=r_akt,
                    retensi_inaktif_tahun=r_inakt,
                    hak_akses=akses,
                )
                session.add(k)
                await session.flush()
            klas_map[kode] = k.id_klasifikasi
        print("✓ Master Klasifikasi Arsip siap.")

        # 4. Master Jenis Surat
        jenis_data = [
            ("SD", "Surat Dinas", "{nomor_urut}/{kode_klasifikasi}-SD/71/{bulan_romawi}/{tahun}"),
            ("ST", "Surat Tugas", "{nomor_urut}/{kode_klasifikasi}-ST/71/{bulan_romawi}/{tahun}"),
            ("ND", "Nota Dinas", "{nomor_urut}/ND-{kode_bagian}/71/{bulan_romawi}/{tahun}"),
            ("Kpt", "Keputusan KPU", "{nomor_urut}/{kode_klasifikasi}-Kpt/71/{tahun}"),
            ("Und", "Surat Undangan", "{nomor_urut}/{kode_klasifikasi}-Und/71/{bulan_romawi}/{tahun}"),
        ]
        jenis_map = {}
        for kode, nama, fmt in jenis_data:
            res = await session.execute(select(JenisSurat).where(JenisSurat.kode_jenis == kode))
            j = res.scalar_one_or_none()
            if not j:
                j = JenisSurat(kode_jenis=kode, nama_jenis=nama, format_nomor=fmt)
                session.add(j)
                await session.flush()
            jenis_map[kode] = j.id_jenis_surat
        print("✓ Master Jenis Surat siap.")

        # 5. Tahun Anggaran
        ta_data = [
            (2025, "Aktif", date(2025, 1, 1), date(2025, 12, 31), "Tahun Anggaran Berjalan 2025", "Admin KPU"),
            (2026, "Perencanaan", date(2026, 1, 1), date(2026, 12, 31), "Tahun Anggaran Pilkada Serentak 2026", "Admin KPU"),
        ]
        for thn, stat, tgl_m, tgl_s, dsk, created_by in ta_data:
            res = await session.execute(select(TahunAnggaran).where(TahunAnggaran.tahun == thn))
            if not res.scalar_one_or_none():
                ta = TahunAnggaran(
                    tahun=thn,
                    status=stat,
                    tanggal_mulai=tgl_m,
                    tanggal_selesai=tgl_s,
                    deskripsi=dsk,
                    dibuat_oleh=created_by,
                )
                session.add(ta)
        print("✓ Master Tahun Anggaran siap.")

        # 6. Akun Anggaran & Pagu Anggaran
        akun_data = [
            ("5211", "Belanja Gaji dan Tunjangan", "Belanja Pegawai", bagian_map["BAG-05"], 8500000000),
            ("5212", "Belanja Honorarium", "Belanja Pegawai Non Operasional", bagian_map["BAG-03"], 3200000000),
            ("5221", "Belanja Barang Operasional", "Belanja Barang Perkantoran", bagian_map["BAG-05"], 4800000000),
            ("5222", "Belanja Barang Non Operasional", "Belanja Pengadaan Logistik", bagian_map["BAG-03"], 6500000000),
            ("5231", "Belanja Pemeliharaan", "Pemeliharaan Gedung & Kendaraan", bagian_map["BAG-01"], 2100000000),
            ("5241", "Belanja Perjalanan Dinas", "Perjalanan Dinas Wilayah", bagian_map["BAG-04"], 4200000000),
            ("5251", "Belanja Jasa", "Jasa Konsultan & IT", bagian_map["BAG-02"], 7800000000),
            ("5311", "Belanja Modal Peralatan", "Pengadaan Server & IT", bagian_map["BAG-05"], 3680000000),
            ("5321", "Belanja Modal Gedung", "Rehabilitasi Fasilitas", bagian_map["BAG-01"], 5000000000),
        ]
        for kode_a, nama_a, kat_a, b_id, pagu_val in akun_data:
            res = await session.execute(select(AkunAnggaran).where(AkunAnggaran.kode_akun == kode_a))
            a = res.scalar_one_or_none()
            if not a:
                a = AkunAnggaran(
                    kode_akun=kode_a,
                    nama_akun=nama_a,
                    kategori=kat_a,
                    id_bagian=b_id,
                    pagu_total=Decimal(pagu_val)
                )
                session.add(a)
                await session.flush()

            # Pagu Anggaran 2025
            res_pagu = await session.execute(
                select(PaguAnggaran).where(
                    PaguAnggaran.tahun == 2025,
                    PaguAnggaran.id_akun == a.id_akun
                )
            )
            if not res_pagu.scalar_one_or_none():
                pagu_obj = PaguAnggaran(
                    tahun=2025,
                    id_akun=a.id_akun,
                    pagu_awal=Decimal(pagu_val),
                    pagu_akhir=Decimal(pagu_val),
                    dibuat_oleh=pegawai_map["198507182020031001"]
                )
                session.add(pagu_obj)
        print("✓ Master Akun & Pagu Anggaran siap.")

        # 7. Sample Initial Surat Keluar
        res_sk = await session.execute(select(SuratKeluar).limit(1))
        if not res_sk.scalar_one_or_none():
            sample_surats = [
                SuratKeluar(
                    id_pegawai=pegawai_map["198507182020031001"],
                    id_bagian=bagian_map["BAG-03"],
                    id_klasifikasi=klas_map["PL.02.1"],
                    id_jenis_surat=jenis_map["SD"],
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
                ),
                SuratKeluar(
                    id_pegawai=pegawai_map["199208052021011002"],
                    id_bagian=bagian_map["BAG-04"],
                    id_klasifikasi=klas_map["HK.01.1"],
                    id_jenis_surat=jenis_map["SD"],
                    nomor_surat="002/HK.01.1-SD/71/IX/2026",
                    nomor_urut=2,
                    tahun=2026,
                    bulan_romawi="IX",
                    sifat_surat="Penting",
                    perihal="Sosialisasi Peraturan KPU tentang Syarat Pencalonan Pilkada 2026",
                    tujuan_surat="Pimpinan Partai Politik Provinsi Sulawesi Utara",
                    status="terbit",
                    tanggal_surat=date(2026, 9, 6),
                    tanggal_terbit=datetime(2026, 9, 6, 9, 15),
                ),
                SuratKeluar(
                    id_pegawai=pegawai_map["198507182020031001"],
                    id_bagian=bagian_map["BAG-05"],
                    id_klasifikasi=klas_map["KU.01.3"],
                    id_jenis_surat=jenis_map["SD"],
                    nomor_surat="003/KU.01.3-SD/71/IX/2026",
                    nomor_urut=3,
                    tahun=2026,
                    bulan_romawi="IX",
                    sifat_surat="Penting",
                    perihal="Penyampaian Laporan Realisasi Anggaran Tahapan Pilkada Triwulan III",
                    tujuan_surat="Sekretariat Jenderal KPU Republik Indonesia",
                    status="terbit",
                    tanggal_surat=date(2026, 9, 5),
                    tanggal_terbit=datetime(2026, 9, 5, 10, 45),
                ),
            ]
            session.add_all(sample_surats)

            # Penomoran sequence initial state
            seq_sd = PenomoranSequence(
                tahun=2026,
                id_jenis_surat=jenis_map["SD"],
                id_bagian=bagian_map["BAG-01"],
                last_number=3
            )
            session.add(seq_sd)
            print("✓ Sample Surat Keluar & Sequence Penomoran siap.")

        await session.commit()
        print("\n=======================================================")
        print("✓ DATABASE BERHASIL DI-SEED LENGKAP UNTUK PC KANTOR!")
        print("=======================================================")

if __name__ == "__main__":
    asyncio.run(seed_all())
