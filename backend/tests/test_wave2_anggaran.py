"""Wave 2 TDD suite: Realisasi Anggaran upgrades (pagu_blokir & RPD, composite Akun key,
POK zero-sum revision, expenditure chain + pajak bruto/netto, Koreksi/SSPB, DB verify_budget grant,
FinancialAuditLog endpoint, and Triwulan RPD deviation report)."""
import os
import tempfile
import unittest
from datetime import date
from decimal import Decimal
from pathlib import Path

os.environ.setdefault("SECRET_KEY", "unit-test-only-secret-not-for-production-12345")

import httpx
from sqlalchemy.dialects.mysql import LONGTEXT
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.pool import StaticPool


@compiles(LONGTEXT, "sqlite")
def _compile_longtext_sqlite(element, compiler, **kw):
    return "TEXT"


import app.main as main_module
from app.api.v1.endpoints import files as files_endpoint
from app.api.v1.endpoints.auth import create_access_token
from app.core import database as db_module
from app.core.config import settings
from app.core.database import Base
import app.models  # noqa: F401
from app.models.schema import AkunAnggaran, Bagian, PaguAnggaran, Pegawai, TahunAnggaran


class Wave2AnggaranTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.upload_dir = Path(self.tmpdir.name) / "uploads"
        self.upload_dir.mkdir(parents=True, exist_ok=True)

        self.engine = create_async_engine(
            "sqlite+aiosqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            echo=False,
        )
        self.session_factory = async_sessionmaker(self.engine, expire_on_commit=False, class_=AsyncSession)

        self._orig_db_session = db_module.AsyncSessionLocal
        self._orig_main_session = main_module.AsyncSessionLocal
        self._orig_storage = files_endpoint.STORAGE_ROOT
        self._orig_grants = list(settings.AUTHORITY_GRANTS)

        db_module.AsyncSessionLocal = self.session_factory
        main_module.AsyncSessionLocal = self.session_factory
        files_endpoint.STORAGE_ROOT = self.upload_dir.resolve()
        settings.AUTHORITY_GRANTS = []

        async def _override_get_db():
            async with self.session_factory() as session:
                yield session

        main_module.app.dependency_overrides[db_module.get_db] = _override_get_db

        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        async with self.session_factory() as db:
            b_admin = Bagian(kode_bagian="ADMIN", nama_bagian="Administrasi Sistem")
            b_rendatin = Bagian(kode_bagian="BAG-02", nama_bagian="Subbagian RENDATIN")
            b_keu = Bagian(kode_bagian="BAG-06", nama_bagian="Subbagian Keuangan")
            b_teknis = Bagian(kode_bagian="BAG-03", nama_bagian="Subbagian Teknis")
            b_hukum = Bagian(kode_bagian="BAG-04", nama_bagian="Subbagian Hukum")
            db.add_all([b_admin, b_rendatin, b_keu, b_teknis, b_hukum])
            await db.flush()
            self.bagian = {
                "admin": b_admin.id_bagian,
                "rendatin": b_rendatin.id_bagian,
                "keu": b_keu.id_bagian,
                "teknis": b_teknis.id_bagian,
                "hukum": b_hukum.id_bagian,
            }

            users = [
                Pegawai(nama="Sys Admin", nip="admin01", role="Admin", id_bagian=b_admin.id_bagian, jabatan="Admin", password="test"),
                Pegawai(nama="Kasubbag RENDATIN", nip="rendatin01", role="Admin", id_bagian=b_rendatin.id_bagian, jabatan="Kasubbag RENDATIN", password="test"),
                Pegawai(nama="Operator Keuangan", nip="keu01", role="Pegawai", id_bagian=b_keu.id_bagian, jabatan="Bendahara", password="test"),
                Pegawai(nama="Staf Teknis", nip="teknis01", role="Pegawai", id_bagian=b_teknis.id_bagian, jabatan="Staf", password="test"),
            ]
            db.add_all(users)
            await db.flush()
            self.users = {u.nip: u.id_pegawai for u in users}
            self.tokens = {
                u.nip: {"Authorization": "Bearer " + create_access_token({"sub": u.nip, "role": u.role, "id": u.id_pegawai, "sv": 0})}
                for u in users
            }

            ta = TahunAnggaran(tahun=2026, status="active", tanggal_mulai=date(2026, 1, 1), tanggal_selesai=date(2026, 12, 31))
            db.add(ta)
            await db.flush()
            self.ta_id = ta.id_tahun_anggaran

            ak1 = AkunAnggaran(id_bagian=b_teknis.id_bagian, kode_akun="524111", nama_akun="Perjalanan Dinas Teknis", status="active")
            ak2 = AkunAnggaran(id_bagian=b_hukum.id_bagian, kode_akun="524111", nama_akun="Perjalanan Dinas Hukum", status="active")
            db.add_all([ak1, ak2])
            await db.flush()
            self.ak1_id = ak1.id_akun_anggaran
            self.ak2_id = ak2.id_akun_anggaran

            p1 = PaguAnggaran(
                id_tahun_anggaran=ta.id_tahun_anggaran,
                id_akun_anggaran=ak1.id_akun_anggaran,
                pagu_awal=Decimal("100000000.00"),
                pagu_aktif=Decimal("100000000.00"),
                pagu_blokir=Decimal("20000000.00"),
                rpd_triwulan_1=Decimal("25000000.00"),
                rpd_triwulan_2=Decimal("25000000.00"),
                rpd_triwulan_3=Decimal("20000000.00"),
                rpd_triwulan_4=Decimal("10000000.00"),
            )
            p2 = PaguAnggaran(
                id_tahun_anggaran=ta.id_tahun_anggaran,
                id_akun_anggaran=ak2.id_akun_anggaran,
                pagu_awal=Decimal("50000000.00"),
                pagu_aktif=Decimal("50000000.00"),
            )
            db.add_all([p1, p2])
            await db.commit()
            self.p1_id = p1.id_pagu
            self.p2_id = p2.id_pagu

        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=main_module.app), base_url="http://test")

    async def asyncTearDown(self):
        await self.client.aclose()
        main_module.app.dependency_overrides.clear()
        db_module.AsyncSessionLocal = self._orig_db_session
        main_module.AsyncSessionLocal = self._orig_main_session
        files_endpoint.STORAGE_ROOT = self._orig_storage
        settings.AUTHORITY_GRANTS = self._orig_grants
        await self.engine.dispose()
        self.tmpdir.cleanup()

    async def test_composite_akun_key_allows_same_mak_across_bagian_but_blocks_duplicate_in_same_bagian(self):
        # Same MAK 524111 in a DIFFERENT bagian (Keuangan) succeeds
        ok = await self.client.post(
            "/api/v1/akun-anggaran/",
            headers=self.tokens["rendatin01"],
            json={"id_bagian": self.bagian["keu"], "kode_akun": "524111", "nama_akun": "Perjadin Keuangan", "status": "active"},
        )
        self.assertEqual(ok.status_code, 201, ok.text)

        # Duplicate MAK 524111 in the SAME bagian (Keuangan) returns 400
        dup = await self.client.post(
            "/api/v1/akun-anggaran/",
            headers=self.tokens["rendatin01"],
            json={"id_bagian": self.bagian["keu"], "kode_akun": "524111", "nama_akun": "Perjadin Keuangan Dup", "status": "active"},
        )
        self.assertEqual(dup.status_code, 400, dup.text)

    async def test_pagu_blokir_blocks_overspending_and_pok_zero_sum_transfer_balances(self):
        # p1 has pagu_aktif=100M, pagu_blokir=20M -> pagu_efektif = 80M!
        up = await self.client.post(
            "/api/v1/files/upload",
            headers=self.tokens["keu01"],
            files={"file": ("sp2d.pdf", b"%PDF-1.4 sp2d", "application/pdf")},
            data={"category": "realisasi"},
        )
        fid = up.json()["file_id"]

        # Spending 85M must fail because 20M is blocked (only 80M effective!)
        over = await self.client.post(
            "/api/v1/realisasi-anggaran/",
            headers=self.tokens["keu01"],
            json={
                "id_pagu": self.p1_id,
                "tanggal_transaksi": "2026-02-10",
                "nomor_dokumen": "SPP-OVER-01",
                "uraian_kegiatan": "Belanja melebihi pagu efektif",
                "jumlah_realisasi": "85000000.00",
                "bukti_file_path": f"/api/v1/files/{fid}",
            },
        )
        self.assertEqual(over.status_code, 400, over.text)

        # Zero-sum POK transfer: shift 10M from p1 -> p2
        pok = await self.client.post(
            "/api/v1/revisi-anggaran/pok",
            headers=self.tokens["rendatin01"],
            json={
                "id_pagu_asal": self.p1_id,
                "id_pagu_tujuan": self.p2_id,
                "nominal_geser": "10000000.00",
                "nomor_revisi": "POK-01/2026",
                "tanggal_revisi": "2026-02-15",
                "alasan_revisi": "Pergeseran POK antar subbagian untuk dukungan hukum",
            },
        )
        self.assertEqual(pok.status_code, 201, pok.text)
        data = pok.json()
        self.assertEqual(Decimal(str(data["asal"]["pagu_sesudah"])), Decimal("90000000.00"))
        self.assertEqual(Decimal(str(data["tujuan"]["pagu_sesudah"])), Decimal("60000000.00"))
        self.assertEqual(data["asal"]["jenis_revisi"], "POK")
        self.assertEqual(data["asal"]["batch_kode"], data["tujuan"]["batch_kode"])

    async def test_expenditure_chain_db_verify_grant_koreksi_sspb_rpd_and_audit_logs(self):
        # Register DB-backed verify_budget authority for rendatin01 (no env AUTHORITY_GRANTS)
        today = date.today().isoformat()
        grant = await self.client.post(
            "/api/v1/authority-grants",
            headers=self.tokens["admin01"],
            json={
                "pegawai_id": self.users["rendatin01"],
                "action": "verify_budget",
                "jabatan_penugasan": "PPSPM KPU Sulut",
                "document_reference": "SK-PPSPM-2026",
                "valid_from": today,
                "valid_until": today,
            },
        )
        self.assertEqual(grant.status_code, 201, grant.text)

        caps = await self.client.get("/api/v1/realisasi-anggaran/capabilities", headers=self.tokens["rendatin01"])
        self.assertTrue(caps.json()["can_review"])

        # Upload proof & create LS/SP2D draft with PPh tax deduction
        up = await self.client.post(
            "/api/v1/files/upload",
            headers=self.tokens["keu01"],
            files={"file": ("bukti_ls.pdf", b"%PDF-1.4 ls", "application/pdf")},
            data={"category": "realisasi"},
        )
        fid = up.json()["file_id"]

        cr = await self.client.post(
            "/api/v1/realisasi-anggaran/",
            headers=self.tokens["keu01"],
            json={
                "id_pagu": self.p1_id,
                "tanggal_transaksi": "2026-02-20",
                "nomor_dokumen": "SP2D-LS-2026-001",
                "uraian_kegiatan": "Pengadaan Jasa Konsultansi",
                "jumlah_realisasi": "20000000.00",
                "mekanisme_bayar": "LS",
                "jenis_dokumen_bayar": "SP2D",
                "nomor_sp2d": "2601234567890",
                "penerima_pembayaran": "CV Maju Sulut",
                "potongan_pajak": "1500000.00",
                "bukti_file_path": f"/api/v1/files/{fid}",
            },
        )
        self.assertEqual(cr.status_code, 201, cr.text)
        tx = cr.json()
        self.assertEqual(tx["mekanisme_bayar"], "LS")
        self.assertEqual(Decimal(str(tx["jumlah_netto"])), Decimal("18500000.00"))
        tx_id = tx["id_realisasi"]

        # Submit & verify via DB-backed grant
        sub = await self.client.post(f"/api/v1/realisasi-anggaran/{tx_id}/submit", headers=self.tokens["keu01"])
        self.assertEqual(sub.status_code, 200, sub.text)
        ver = await self.client.post(f"/api/v1/realisasi-anggaran/{tx_id}/verify", headers=self.tokens["rendatin01"], json={"catatan_verifikasi": "Sah"})
        self.assertEqual(ver.status_code, 200, ver.text)

        # Record formal Koreksi / SSPB refund of 5,000,000
        kor = await self.client.post(
            f"/api/v1/realisasi-anggaran/{tx_id}/koreksi",
            headers=self.tokens["rendatin01"],
            json={
                "nomor_dokumen": "SSPB-2026-001",
                "tanggal_transaksi": "2026-03-05",
                "nominal_koreksi": "5000000.00",
                "alasan": "Pengembalian kelebihan bayar perjalanan dinas via SSPB",
            },
        )
        self.assertEqual(kor.status_code, 201, kor.text)
        self.assertTrue(kor.json()["is_koreksi"])
        self.assertEqual(Decimal(str(kor.json()["jumlah_realisasi"])), Decimal("-5000000.00"))

        # Triwulan RPD report reflects net 15M realized in Q1 vs 25M RPD target
        rpd = await self.client.get(
            f"/api/v1/anggaran/triwulan-rpd?id_tahun_anggaran={self.ta_id}",
            headers=self.tokens["rendatin01"],
        )
        self.assertEqual(rpd.status_code, 200, rpd.text)
        q1 = rpd.json()["triwulan"][0]
        self.assertEqual(Decimal(str(q1["target_rpd"])), Decimal("25000000.00"))
        self.assertEqual(Decimal(str(q1["realisasi_verified"])), Decimal("15000000.00"))
        self.assertEqual(Decimal(str(rpd.json()["total_pagu_blokir"])), Decimal("20000000.00"))

        # Financial Audit Log readable by RENDATIN/Keuangan, blocked (403) for non-finance Teknis
        al_forb = await self.client.get("/api/v1/anggaran/audit-logs", headers=self.tokens["teknis01"])
        self.assertEqual(al_forb.status_code, 403)
        al_ok = await self.client.get(f"/api/v1/anggaran/audit-logs?id_tahun_anggaran={self.ta_id}", headers=self.tokens["rendatin01"])
        self.assertEqual(al_ok.status_code, 200, al_ok.text)
        self.assertGreaterEqual(len(al_ok.json()["items"]), 2)


if __name__ == "__main__":
    unittest.main()
