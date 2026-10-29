import asyncio
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
from app.models.schema import (
    Bagian,
    Pegawai,
    TahunAnggaran,
    AkunAnggaran,
    PaguAnggaran,
    RevisiAnggaran,
    RealisasiAnggaran,
)

async def test_budget_domain_relationships():
    print("=== Testing Budget Domain Model & Relationships ===")
    async with AsyncSessionLocal() as session:
        # 1. Bagian
        bagian = Bagian(kode_bagian="BAG-KEU", nama_bagian="Bagian Keuangan dan Logistik")
        session.add(bagian)
        await session.flush()
        print(f"[OK] Created Bagian: id={bagian.id_bagian}, nama={bagian.nama_bagian}")

        # 2. Pegawai (Operator & Verifier)
        operator = Pegawai(
            id_bagian=bagian.id_bagian,
            nama="Budi Santoso",
            nip="198501012010011001",
            jabatan="Staff Keuangan",
            password="hashed_pwd_operator",
            role="operator",
        )
        verifier = Pegawai(
            id_bagian=bagian.id_bagian,
            nama="Siti Rahmawati",
            nip="198002022005012002",
            jabatan="Kasubag Keuangan",
            password="hashed_pwd_verifier",
            role="admin",
        )
        session.add_all([operator, verifier])
        await session.flush()
        print(f"[OK] Created Operator: id={operator.id_pegawai}, Verifier: id={verifier.id_pegawai}")

        # 3. Tahun Anggaran
        tahun_2026 = TahunAnggaran(
            tahun=2026,
            status="active",
            tanggal_mulai=date(2026, 1, 1),
            tanggal_selesai=date(2026, 12, 31),
            deskripsi="Tahun Anggaran Pemilu/Operasional 2026",
            id_pegawai_pembuat=verifier.id_pegawai,
        )
        session.add(tahun_2026)
        await session.flush()
        print(f"[OK] Created TahunAnggaran: id={tahun_2026.id_tahun_anggaran}, tahun={tahun_2026.tahun}")

        # 4. Master Akun Anggaran (Menyimpan total_pagu legacy)
        akun_521211 = AkunAnggaran(
            id_bagian=bagian.id_bagian,
            kode_akun="521211",
            nama_akun="Belanja Bahan Operasional",
            total_pagu=Decimal("100000000.00"),
            jenis_belanja="Belanja Barang & Jasa",
            program="Program Penyelenggaraan Pemilu",
            sub_program="Dukungan Operasional Logistik",
            status="active",
        )
        session.add(akun_521211)
        await session.flush()
        print(f"[OK] Created AkunAnggaran: id={akun_521211.id_akun_anggaran}, kode={akun_521211.kode_akun}")

        # 5. Pagu Anggaran (Alokasi Akun untuk Tahun 2026)
        pagu_2026 = PaguAnggaran(
            id_tahun_anggaran=tahun_2026.id_tahun_anggaran,
            id_akun_anggaran=akun_521211.id_akun_anggaran,
            pagu_awal=Decimal("100000000.00"),
            pagu_aktif=Decimal("120000000.00"),  # setelah revisi
            nomor_sk="SK-DIPA/01/KPU-SU/2026",
            tanggal_sk=date(2026, 1, 5),
            keterangan="Pagu DIPA Induk 2026",
        )
        session.add(pagu_2026)
        await session.flush()
        print(f"[OK] Created PaguAnggaran: id={pagu_2026.id_pagu}, pagu_awal={pagu_2026.pagu_awal}, pagu_aktif={pagu_2026.pagu_aktif}")

        # 6. Revisi Anggaran (Audit trail)
        revisi = RevisiAnggaran(
            id_pagu=pagu_2026.id_pagu,
            id_pegawai=verifier.id_pegawai,
            nomor_revisi="REV-01/DIPA/2026",
            tanggal_revisi=date(2026, 3, 1),
            pagu_sebelum=Decimal("100000000.00"),
            pagu_sesudah=Decimal("120000000.00"),
            alasan_revisi="Penambahan volume kegiatan distribusi logistik",
        )
        session.add(revisi)
        await session.flush()
        print(f"[OK] Created RevisiAnggaran: id={revisi.id_revisi}, no_revisi={revisi.nomor_revisi}")

        # 7. Realisasi Anggaran (Transaksi dengan operator & verifier)
        realisasi = RealisasiAnggaran(
            id_pagu=pagu_2026.id_pagu,
            id_akun_anggaran=akun_521211.id_akun_anggaran,
            id_pegawai=operator.id_pegawai,
            id_verifier=verifier.id_pegawai,
            tanggal_transaksi=date(2026, 3, 15),
            nomor_dokumen="BJU/001/KU/III/2026",
            uraian_kegiatan="Pembelian ATK dan Konsumsi Rapat Logistik",
            jumlah_realisasi=Decimal("25000000.00"),
            status="verified",
            periode="Maret 2026",
            bukti_file_path="uploads/realisasi/2026/03/bju_001.pdf",
            bukti_file_nama="bju_001.pdf",
            bukti_file_ukuran=1048576,
            catatan_verifikasi="Dokumen SPJ dan kuitansi lengkap dan sah",
            verified_at=datetime(2026, 3, 16, 10, 0, 0),
        )
        session.add(realisasi)
        await session.commit()
        print(f"[OK] Created RealisasiAnggaran: id={realisasi.id_realisasi}, status={realisasi.status}")

        # Test verification of relationships without ambiguous foreign key warnings
        stmt = (
            select(RealisasiAnggaran)
            .options(
                selectinload(RealisasiAnggaran.pagu_anggaran).selectinload(PaguAnggaran.tahun_anggaran),
                selectinload(RealisasiAnggaran.akun_anggaran).selectinload(AkunAnggaran.bagian),
                selectinload(RealisasiAnggaran.operator),
                selectinload(RealisasiAnggaran.verifier),
            )
            .where(RealisasiAnggaran.id_realisasi == realisasi.id_realisasi)
        )
        res = await session.execute(stmt)
        loaded_tx = res.scalar_one()

        assert loaded_tx.operator.nama == "Budi Santoso", "Operator relationship mismatch"
        assert loaded_tx.verifier.nama == "Siti Rahmawati", "Verifier relationship mismatch"
        assert loaded_tx.pagu_anggaran.tahun_anggaran.tahun == 2026, "Tahun relationship mismatch"
        assert loaded_tx.akun_anggaran.bagian.kode_bagian == "BAG-KEU", "Bagian relationship mismatch"
        print("[SUCCESS] All SQLAlchemy relationships successfully verified with zero errors!")

        # Clean up test rows
        await session.delete(realisasi)
        await session.delete(revisi)
        await session.delete(pagu_2026)
        await session.delete(akun_521211)
        await session.delete(tahun_2026)
        await session.delete(operator)
        await session.delete(verifier)
        await session.delete(bagian)
        await session.commit()
        print("[SUCCESS] Cleaned up test data. DB back to original baseline.")

if __name__ == "__main__":
    asyncio.run(test_budget_domain_relationships())
