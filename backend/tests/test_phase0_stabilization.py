"""Phase 0 stabilization regression suite (end-to-end against real FastAPI + async SQLite)."""
import asyncio
import os
import tempfile
import unittest
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

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
from app.core.auth import get_effective_subbagian_id, is_rendatin_or_keuangan
from app.core.config import settings
from app.core.database import Base
from app.core.passwords import hash_password
from app.core.reference_data import ensure_reference_data
import app.models  # noqa: F401
from app.models.schema import (
    AkunAnggaran,
    Bagian,
    DokumenArsip,
    FileRecord,
    JenisSurat,
    KodeKlasifikasiArsip,
    PaguAnggaran,
    Pegawai,
    RealisasiAnggaran,
    RevisiAnggaran,
    SuratKeluar,
    SuratTugas,
    TahunAnggaran,
)
from app.services import kirana_db


class Phase0StabilizationTests(unittest.IsolatedAsyncioTestCase):
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
        self._orig_official = settings.OFFICIAL_ISSUANCE_ENABLED
        self._orig_grants = list(settings.AUTHORITY_GRANTS)

        db_module.AsyncSessionLocal = self.session_factory
        main_module.AsyncSessionLocal = self.session_factory
        files_endpoint.STORAGE_ROOT = self.upload_dir.resolve()

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
            b_umlog = Bagian(kode_bagian="BAG-05", nama_bagian="Subbagian Umum dan Logistik (UMLOG)")
            b_teknis = Bagian(kode_bagian="BAG-03", nama_bagian="Subbagian Teknis Penyelenggaraan Pemilu")
            b_hukum = Bagian(kode_bagian="BAG-04", nama_bagian="Subbagian Hukum")
            db.add_all([b_admin, b_rendatin, b_keu, b_umlog, b_teknis, b_hukum])
            await db.flush()
            self.bagian = {
                "admin": b_admin.id_bagian,
                "rendatin": b_rendatin.id_bagian,
                "keu": b_keu.id_bagian,
                "umlog": b_umlog.id_bagian,
                "teknis": b_teknis.id_bagian,
                "hukum": b_hukum.id_bagian,
            }

            users = [
                Pegawai(nama="Sys Admin", nip="admin01", role="Admin", id_bagian=b_admin.id_bagian, jabatan="Administrator", password="test"),
                Pegawai(nama="Rendatin Admin", nip="rendatin01", role="Admin", id_bagian=b_rendatin.id_bagian, jabatan="Kasubbag RENDATIN", password="test"),
                Pegawai(nama="Keuangan Staff", nip="keu01", role="Pegawai", id_bagian=b_keu.id_bagian, jabatan="Staf Keuangan", password="test"),
                Pegawai(nama="Teknis Admin", nip="teknisadmin", role="Admin", id_bagian=b_teknis.id_bagian, jabatan="Kasubbag Teknis", password="test"),
                Pegawai(nama="Teknis Staff", nip="teknis01", role="Pegawai", id_bagian=b_teknis.id_bagian, jabatan="Staf Teknis", password="test"),
                Pegawai(nama="Teknis Colleague", nip="teknis02", role="Pegawai", id_bagian=b_teknis.id_bagian, jabatan="Staf Teknis", password="test"),
                Pegawai(nama="Hukum Staff", nip="hukum01", role="Pegawai", id_bagian=b_hukum.id_bagian, jabatan="Staf Hukum", password="test"),
                Pegawai(nama="Kabag Tanpa Subbag", nip="kabag01", role="Pegawai", id_bagian=None, jabatan="Kepala Bagian Teknis dan Hukum", password="test"),
            ]
            db.add_all(users)
            await db.flush()
            self.users = {u.nip: u.id_pegawai for u in users}
            self.tokens = {
                u.nip: {"Authorization": "Bearer " + create_access_token({"sub": u.nip, "role": u.role, "id": u.id_pegawai, "sv": 0})}
                for u in users
            }
            self.klasifikasi, self.jenis = await ensure_reference_data(db)

            ta_closed = TahunAnggaran(tahun=2025, status="closed", tanggal_mulai=date(2025, 1, 1), tanggal_selesai=date(2025, 12, 31))
            ta_active = TahunAnggaran(tahun=2026, status="active", tanggal_mulai=date(2026, 1, 1), tanggal_selesai=date(2026, 12, 31))
            db.add_all([ta_closed, ta_active])
            await db.flush()
            self.ta_closed_id = ta_closed.id_tahun_anggaran
            self.ta_active_id = ta_active.id_tahun_anggaran

            ak_teknis = AkunAnggaran(id_bagian=b_teknis.id_bagian, kode_akun="521211", nama_akun="Belanja Bahan Teknis", status="active")
            ak_hukum = AkunAnggaran(id_bagian=b_hukum.id_bagian, kode_akun="524111", nama_akun="Perjalanan Dinas Hukum", status="active")
            db.add_all([ak_teknis, ak_hukum])
            await db.flush()
            self.ak_teknis_id = ak_teknis.id_akun_anggaran
            self.ak_hukum_id = ak_hukum.id_akun_anggaran

            pagu_closed = PaguAnggaran(id_tahun_anggaran=ta_closed.id_tahun_anggaran, id_akun_anggaran=ak_teknis.id_akun_anggaran, pagu_awal=Decimal("10000000.00"), pagu_aktif=Decimal("10000000.00"))
            pagu_teknis = PaguAnggaran(id_tahun_anggaran=ta_active.id_tahun_anggaran, id_akun_anggaran=ak_teknis.id_akun_anggaran, pagu_awal=Decimal("50000000.00"), pagu_aktif=Decimal("50000000.00"))
            pagu_hukum = PaguAnggaran(id_tahun_anggaran=ta_active.id_tahun_anggaran, id_akun_anggaran=ak_hukum.id_akun_anggaran, pagu_awal=Decimal("20000000.00"), pagu_aktif=Decimal("20000000.00"))
            db.add_all([pagu_closed, pagu_teknis, pagu_hukum])
            await db.flush()
            self.pagu_closed_id = pagu_closed.id_pagu
            self.pagu_teknis_id = pagu_teknis.id_pagu
            self.pagu_hukum_id = pagu_hukum.id_pagu

            tx_closed = RealisasiAnggaran(
                id_pagu=pagu_closed.id_pagu,
                id_akun_anggaran=ak_teknis.id_akun_anggaran,
                id_pegawai=self.users["keu01"],
                id_verifier=self.users["rendatin01"],
                tanggal_transaksi=date(2025, 6, 15),
                nomor_dokumen="SP2D-2025-001",
                uraian_kegiatan="Belanja historis tahun ditutup",
                jumlah_realisasi=Decimal("1000000.00"),
                status="verified",
                verified_at=datetime(2025, 6, 16, 10, 0, 0),
            )
            db.add(tx_closed)
            await db.commit()
            self.tx_closed_id = tx_closed.id_realisasi

        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=main_module.app), base_url="http://test")

    async def asyncTearDown(self):
        await self.client.aclose()
        main_module.app.dependency_overrides.clear()
        db_module.AsyncSessionLocal = self._orig_db_session
        main_module.AsyncSessionLocal = self._orig_main_session
        files_endpoint.STORAGE_ROOT = self._orig_storage
        settings.OFFICIAL_ISSUANCE_ENABLED = self._orig_official
        settings.AUTHORITY_GRANTS = self._orig_grants
        await self.engine.dispose()
        self.tmpdir.cleanup()

    # --- 1. SURAT MENYURAT SECURITY & NUMBERING ---

    async def test_operations_letters_are_row_scoped_and_private_attachments_do_not_leak(self):
        # Teknis Staff uploads private incoming letter attachment
        up = await self.client.post(
            "/api/v1/files/upload",
            headers=self.tokens["teknis01"],
            files={"file": ("rahasia.pdf", b"%PDF-1.4 rahasia", "application/pdf")},
            data={"category": "surat"},
        )
        self.assertEqual(up.status_code, 201, up.text)
        fid = up.json()["file_id"]

        created = await self.client.post(
            "/api/v1/operations/letters",
            headers=self.tokens["teknis01"],
            json={
                "kind": "masuk",
                "subject": "Surat Rahasia Teknis",
                "sender": "Bawaslu",
                "recipient": "Teknis",
                "content": "Konten rahasia",
                "date": "2026-11-10",
                "file_id": fid,
            },
        )
        self.assertEqual(created.status_code, 201, created.text)
        lid = created.json()["id"]

        # Unrelated user AND same-department colleague must NOT list this letter or download its attachment
        res_hukum = await self.client.get("/api/v1/operations/letters", headers=self.tokens["hukum01"])
        self.assertEqual(res_hukum.status_code, 200)
        self.assertEqual(res_hukum.json(), [])

        res_colleague = await self.client.get("/api/v1/operations/letters", headers=self.tokens["teknis02"])
        self.assertEqual(res_colleague.status_code, 200)
        self.assertEqual(res_colleague.json(), [])

        dl_colleague = await self.client.get(f"/api/v1/files/{fid}", headers=self.tokens["teknis02"])
        self.assertEqual(dl_colleague.status_code, 403, "Same-dept colleague must NOT download private WorkflowLetter attachment via arsip mirror")

        # Assign to Hukum Staff -> assignee CAN read letter & download attachment, and history records assignee
        assign = await self.client.post(
            f"/api/v1/operations/letters/{lid}/actions",
            headers=self.tokens["admin01"],
            json={"action": "assign", "version": 1, "assignee_id": self.users["hukum01"], "note": "Tindak lanjuti"},
        )
        self.assertEqual(assign.status_code, 200, assign.text)
        self.assertEqual(assign.json()["history"][-1].get("assignee_id"), self.users["hukum01"])

        res_hukum_after = await self.client.get("/api/v1/operations/letters", headers=self.tokens["hukum01"])
        self.assertEqual(len(res_hukum_after.json()), 1)
        self.assertEqual((await self.client.get(f"/api/v1/files/{fid}", headers=self.tokens["hukum01"])).status_code, 200)

    async def test_surat_keluar_draft_blocks_cross_department_spoofing_and_returns_lampiran(self):
        res = await self.client.post(
            "/api/v1/surat-keluar/draft",
            headers=self.tokens["teknis01"],
            json={
                "id_bagian": self.bagian["hukum"],
                "id_klasifikasi": self.klasifikasi["PL.01.1"],
                "id_jenis_surat": self.jenis["SD"],
                "perihal": "Spoof Bagian Lain",
                "tujuan_surat": "KPU RI",
                "lampiran": "2 berkas",
                "tanggal_surat": "2026-11-15",
            },
        )
        self.assertEqual(res.status_code, 403, res.text)

        ok = await self.client.post(
            "/api/v1/surat-keluar/draft",
            headers=self.tokens["teknis01"],
            json={
                "id_bagian": self.bagian["teknis"],
                "id_klasifikasi": self.klasifikasi["PL.01.1"],
                "id_jenis_surat": self.jenis["SD"],
                "perihal": "Surat Resmi Teknis",
                "tujuan_surat": "KPU RI",
                "lampiran": "2 berkas",
                "tanggal_surat": "2026-11-15",
            },
        )
        self.assertEqual(ok.status_code, 201, ok.text)
        self.assertEqual(ok.json().get("lampiran"), "2 berkas")

    async def test_finalisasi_uses_jenis_format_nomor_avoids_multi_bagian_crash_and_updates_surat_tugas(self):
        settings.OFFICIAL_ISSUANCE_ENABLED = True
        today = date.today().isoformat()
        settings.AUTHORITY_GRANTS = [{
            "pegawai_id": self.users["admin01"],
            "action": "number_official_letter",
            "document_reference": "SK-TEST-01",
            "valid_from": today,
            "valid_until": today,
        }]

        # 1. Nota Dinas (ND) format: {nomor_urut}/ND-{kode_bagian}/71/{bulan_romawi}/{tahun}
        nd1 = await self.client.post(
            "/api/v1/surat-keluar/draft",
            headers=self.tokens["admin01"],
            json={
                "id_bagian": self.bagian["teknis"],
                "id_klasifikasi": self.klasifikasi["PL.01.1"],
                "id_jenis_surat": self.jenis["ND"],
                "perihal": "Nota Dinas Teknis",
                "tujuan_surat": "Sekretaris",
                "tanggal_surat": "2026-11-15",
            },
        )
        self.assertEqual(nd1.status_code, 201, nd1.text)
        fin_nd1 = await self.client.post(f"/api/v1/surat-keluar/{nd1.json()['id_surat_keluar']}/finalisasi", headers=self.tokens["admin01"], json={})
        self.assertEqual(fin_nd1.status_code, 200, fin_nd1.text)
        self.assertEqual(fin_nd1.json()["nomor_surat"], "001/ND-BAG-03/71/XI/2026")

        # Second Nota Dinas from DIFFERENT bagian must NOT crash with MultipleResultsFound
        nd2 = await self.client.post(
            "/api/v1/surat-keluar/draft",
            headers=self.tokens["admin01"],
            json={
                "id_bagian": self.bagian["hukum"],
                "id_klasifikasi": self.klasifikasi["HK.01.1"],
                "id_jenis_surat": self.jenis["ND"],
                "perihal": "Nota Dinas Hukum",
                "tujuan_surat": "Sekretaris",
                "tanggal_surat": "2026-11-15",
            },
        )
        fin_nd2 = await self.client.post(f"/api/v1/surat-keluar/{nd2.json()['id_surat_keluar']}/finalisasi", headers=self.tokens["admin01"], json={})
        self.assertEqual(fin_nd2.status_code, 200, fin_nd2.text)
        self.assertEqual(fin_nd2.json()["nomor_surat"], "001/ND-BAG-04/71/XI/2026")

        # 2. Keputusan (Kpt) format omits bulan_romawi: {nomor_urut}/{kode_klasifikasi}-Kpt/71/{tahun}
        kpt = await self.client.post(
            "/api/v1/surat-keluar/draft",
            headers=self.tokens["admin01"],
            json={
                "id_bagian": self.bagian["hukum"],
                "id_klasifikasi": self.klasifikasi["HK.01.1"],
                "id_jenis_surat": self.jenis["Kpt"],
                "perihal": "Keputusan Uji",
                "tujuan_surat": "Umum",
                "tanggal_surat": "2026-11-15",
            },
        )
        fin_kpt = await self.client.post(f"/api/v1/surat-keluar/{kpt.json()['id_surat_keluar']}/finalisasi", headers=self.tokens["admin01"], json={})
        self.assertEqual(fin_kpt.status_code, 200, fin_kpt.text)
        self.assertEqual(fin_kpt.json()["nomor_surat"], "001/HK.01.1-Kpt/71/2026")

        # 3. Finalizing Surat Tugas updates SuratTugas.nomor_tugas (never stays DRAFT/ST/...)
        st = await self.client.post(
            "/api/v1/surat-tugas",
            headers=self.tokens["admin01"],
            json={
                "maksud_tugas": "Supervisi data pemilih",
                "tempat_tugas": "KPU Manado",
                "tanggal_mulai": "2026-11-20",
                "tanggal_selesai": "2026-11-21",
                "id_klasifikasi": self.klasifikasi["HR.01.2"],
                "pelaksana": [self.users["teknis01"]],
            },
        )
        self.assertEqual(st.status_code, 201, st.text)
        st_sk_id = st.json()["id_surat_keluar"]
        fin_st = await self.client.post(f"/api/v1/surat-keluar/{st_sk_id}/finalisasi", headers=self.tokens["admin01"], json={})
        self.assertEqual(fin_st.status_code, 200, fin_st.text)
        official_st_no = fin_st.json()["nomor_surat"]

        st_list = await self.client.get("/api/v1/surat-tugas", headers=self.tokens["admin01"])
        self.assertEqual(st_list.json()[0]["nomor_tugas"], official_st_no)

    # --- 2. REALISASI ANGGARAN SECURITY, CRASHES & 4-EYES WORKFLOW ---

    async def test_revisi_anggaran_awaits_rendatin_check_and_returns_akun_metadata(self):
        # Non-finance Admin (Teknis Admin) MUST get 403 on POST /revisi-anggaran/
        res_forbidden = await self.client.post(
            "/api/v1/revisi-anggaran/",
            headers=self.tokens["teknisadmin"],
            json={
                "id_pagu": self.pagu_teknis_id,
                "nomor_revisi": "REV-ILLEGAL",
                "tanggal_revisi": "2026-05-01",
                "pagu_baru": "55000000.00",
                "alasan_revisi": "Percobaan bypass non-keuangan",
            },
        )
        self.assertEqual(res_forbidden.status_code, 403, f"Expected 403 for non-finance admin, got {res_forbidden.status_code}: {res_forbidden.text}")

        # RENDATIN Admin succeeds cleanly without MissingGreenlet
        res_ok = await self.client.post(
            "/api/v1/revisi-anggaran/",
            headers=self.tokens["rendatin01"],
            json={
                "id_pagu": self.pagu_teknis_id,
                "nomor_revisi": "REV-001/2026",
                "tanggal_revisi": "2026-05-01",
                "pagu_baru": "55000000.00",
                "alasan_revisi": "Penambahan pagu operasional resmi",
            },
        )
        self.assertEqual(res_ok.status_code, 201, res_ok.text)
        self.assertEqual(res_ok.json().get("nama_pegawai"), "Rendatin Admin")
        self.assertEqual(res_ok.json().get("kode_akun"), "521211")

    async def test_publish_report_serializes_decimals_and_versions_requires_finance_role(self):
        pub = await self.client.post(
            "/api/v1/anggaran/publish",
            headers=self.tokens["rendatin01"],
            json={"id_tahun_anggaran": self.ta_active_id, "periode_laporan": "Triwulan I", "alasan": "Rilis resmi"},
        )
        self.assertEqual(pub.status_code, 200, pub.text)
        self.assertEqual(pub.json()["nomor_versi"], 1)

        # Non-finance user MUST get 403 on GET /anggaran/versions
        unauth = await self.client.get(
            f"/api/v1/anggaran/versions?id_tahun_anggaran={self.ta_active_id}",
            headers=self.tokens["teknis01"],
        )
        self.assertEqual(unauth.status_code, 403, unauth.text)

        auth_ok = await self.client.get(
            f"/api/v1/anggaran/versions?id_tahun_anggaran={self.ta_active_id}",
            headers=self.tokens["rendatin01"],
        )
        self.assertEqual(auth_ok.status_code, 200)
        self.assertEqual(len(auth_ok.json()), 1)

    async def test_budget_maker_checker_flow_history_isolation_and_closed_year_delete_block(self):
        proof = await self.client.post(
            "/api/v1/files/upload",
            headers=self.tokens["keu01"],
            files={"file": ("kuitansi.pdf", b"%PDF-1.4 kuitansi", "application/pdf")},
            data={"category": "realisasi"},
        )
        self.assertEqual(proof.status_code, 201)
        fid = proof.json()["file_id"]

        # POST creates DRAFT (not auto-verified!)
        created = await self.client.post(
            "/api/v1/realisasi-anggaran/",
            headers=self.tokens["keu01"],
            json={
                "id_pagu": self.pagu_teknis_id,
                "tanggal_transaksi": "2026-04-10",
                "nomor_dokumen": "SPBY-2026-001",
                "uraian_kegiatan": "Pengadaan ATK Pleno",
                "jumlah_realisasi": "5000000.00",
                "bukti_file_path": f"/api/v1/files/{fid}",
            },
        )
        self.assertEqual(created.status_code, 201, created.text)
        tx_id = created.json()["id_realisasi"]
        self.assertEqual(created.json()["status"], "draft")
        self.assertIsNone(created.json()["id_verifier"])

        # History endpoint MUST block unrelated department (Hukum reading Teknis tx)
        hist_hukum = await self.client.get(f"/api/v1/realisasi-anggaran/{tx_id}/history", headers=self.tokens["hukum01"])
        self.assertEqual(hist_hukum.status_code, 403, hist_hukum.text)

        # Operator edits draft & submits
        edited = await self.client.put(
            f"/api/v1/realisasi-anggaran/{tx_id}",
            headers=self.tokens["keu01"],
            json={"uraian_kegiatan": "Pengadaan ATK Pleno Revisi", "jumlah_realisasi": "4500000.00"},
        )
        self.assertEqual(edited.status_code, 200, edited.text)
        sub = await self.client.post(f"/api/v1/realisasi-anggaran/{tx_id}/submit", headers=self.tokens["keu01"])
        self.assertEqual(sub.status_code, 200, sub.text)
        self.assertEqual(sub.json()["status"], "submitted")

        # Verify requires AUTHORITY_GRANTS; self-verify forbidden; separate reviewer succeeds
        today = date.today().isoformat()
        settings.AUTHORITY_GRANTS = [
            {"pegawai_id": self.users["keu01"], "action": "verify_budget", "document_reference": "SK-PPK", "valid_from": today, "valid_until": today},
            {"pegawai_id": self.users["rendatin01"], "action": "verify_budget", "document_reference": "SK-PPSPM", "valid_from": today, "valid_until": today},
        ]
        self_ver = await self.client.post(f"/api/v1/realisasi-anggaran/{tx_id}/verify", headers=self.tokens["keu01"], json={})
        self.assertEqual(self_ver.status_code, 403)

        ok_ver = await self.client.post(f"/api/v1/realisasi-anggaran/{tx_id}/verify", headers=self.tokens["rendatin01"], json={"catatan_verifikasi": "Lengkap"})
        self.assertEqual(ok_ver.status_code, 200, ok_ver.text)
        self.assertEqual(ok_ver.json()["status"], "verified")
        self.assertEqual(ok_ver.json()["id_verifier"], self.users["rendatin01"])

        # Closed fiscal year deletion MUST be blocked (not HTTP 500 or 200!)
        del_closed = await self.client.delete(f"/api/v1/realisasi-anggaran/{self.tx_closed_id}", headers=self.tokens["rendatin01"])
        self.assertEqual(del_closed.status_code, 400, f"Closed year delete must return 400, got {del_closed.status_code}: {del_closed.text}")

        # Active fiscal year RENDATIN delete succeeds cleanly (no MissingGreenlet) AND cleans archive mirror
        del_active = await self.client.delete(f"/api/v1/realisasi-anggaran/{tx_id}", headers=self.tokens["rendatin01"])
        self.assertEqual(del_active.status_code, 200, del_active.text)
        async with self.session_factory() as db:
            from sqlalchemy import select
            orphan = await db.scalar(select(DokumenArsip).where(DokumenArsip.ref_tipe == "realisasi", DokumenArsip.ref_id == tx_id))
            self.assertIsNone(orphan, "Deleting realisasi must remove mirrored DokumenArsip row")

    async def test_kabag_without_id_bagian_cannot_bypass_budget_isolation(self):
        # Kabag with id_bagian=None must NOT see Teknis & Hukum pagu
        res = await self.client.get(f"/api/v1/pagu-anggaran/?id_tahun_anggaran={self.ta_active_id}", headers=self.tokens["kabag01"])
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["items"], [], "User with id_bagian=None leaked all departments' pagu!")

    async def test_monthly_summary_remaining_budget_uses_annual_verified_total(self):
        # Insert 2 verified tx in different months: Jan 10M, Feb 5M on 50M pagu
        async with self.session_factory() as db:
            db.add_all([
                RealisasiAnggaran(id_pagu=self.pagu_teknis_id, id_akun_anggaran=self.ak_teknis_id, id_pegawai=self.users["keu01"], tanggal_transaksi=date(2026, 1, 10), nomor_dokumen="M1", uraian_kegiatan="Jan", jumlah_realisasi=Decimal("10000000.00"), status="verified"),
                RealisasiAnggaran(id_pagu=self.pagu_teknis_id, id_akun_anggaran=self.ak_teknis_id, id_pegawai=self.users["keu01"], tanggal_transaksi=date(2026, 2, 10), nomor_dokumen="M2", uraian_kegiatan="Feb", jumlah_realisasi=Decimal("5000000.00"), status="verified"),
            ])
            await db.commit()

        feb = await self.client.get(
            f"/api/v1/anggaran/summary?id_tahun_anggaran={self.ta_active_id}&id_akun_anggaran={self.ak_teknis_id}&bulan=2",
            headers=self.tokens["rendatin01"],
        )
        self.assertEqual(feb.status_code, 200, feb.text)
        data = feb.json()
        self.assertEqual(Decimal(str(data["total_realisasi_verified"])), Decimal("5000000.00"))
        # Remaining DIPA budget must be 50M - (10M + 5M) = 35M, NOT 45M!
        self.assertEqual(Decimal(str(data["total_sisa_anggaran"])), Decimal("35000000.00"))

    # --- 3. ARSIP DATA SECURITY, CLASSIFICATION, RAHASIA & CLEANUP ---

    async def test_arsip_filter_options_scoped_rahasia_no_500_no_silent_pl01_and_permanent_delete_cleans_file(self):
        up = await self.client.post(
            "/api/v1/files/upload",
            headers=self.tokens["teknis01"],
            files={"file": ("secret.pdf", b"%PDF-1.4 secret", "application/pdf")},
            data={"category": "arsip"},
        )
        self.assertEqual(up.status_code, 201)
        fid = up.json()["file_id"]

        # Create arsip with hak_akses="rahasia" and NO id_klasifikasi
        cr = await self.client.post(
            "/api/v1/arsip/",
            headers=self.tokens["teknis01"],
            json={
                "nama_dokumen": "Dokumen Rahasia Khusus",
                "nomor_dokumen": "RHS-001",
                "id_pegawai": 0,
                "kategori": "Investigasi",
                "event": "Audit Khusus Rahasia",
                "tanggal_dokumen": "2026-11-10",
                "file_path": str(fid),
                "ukuran_file": 999999999,  # server must ignore client size
                "hak_akses": "rahasia",
            },
        )
        self.assertEqual(cr.status_code, 201, cr.text)
        doc = cr.json()
        self.assertIsNone(doc["id_klasifikasi"], "Omitted id_klasifikasi must stay None, not silently PL.01.1")
        self.assertEqual(doc["ukuran_file"], len(b"%PDF-1.4 secret"))
        doc_id = doc["id_dokumen"]

        # Filter options for Hukum must NOT leak restricted event/kategori
        opts_hukum = await self.client.get("/api/v1/arsip/filter-options", headers=self.tokens["hukum01"])
        self.assertEqual(opts_hukum.status_code, 200, opts_hukum.text)
        self.assertNotIn("Audit Khusus Rahasia", opts_hukum.json()["events"])
        self.assertNotIn("Investigasi", opts_hukum.json()["kategori"])

        # Reading list with a rahasia doc must NOT crash with 500
        lst = await self.client.get("/api/v1/arsip/", headers=self.tokens["teknis01"])
        self.assertEqual(lst.status_code, 200, lst.text)
        self.assertTrue(any(d["id_dokumen"] == doc_id for d in lst.json()))

        # Move to trash then admin permanently deletes -> physical file & FileRecord MUST be cleaned up
        await self.client.patch(f"/api/v1/arsip/{doc_id}/delete", headers=self.tokens["teknis01"])
        perm = await self.client.delete(f"/api/v1/arsip/{doc_id}/permanent", headers=self.tokens["admin01"])
        self.assertEqual(perm.status_code, 200, perm.text)

        dl_after = await self.client.get(f"/api/v1/files/{fid}", headers=self.tokens["admin01"])
        self.assertEqual(dl_after.status_code, 404, "Deleted archive file must no longer be downloadable")

    # --- 4. KIRANA BUDGET ISOLATION ---

    async def test_kirana_scopes_budget_tables_for_non_finance_users(self):
        teknis_user = SimpleNamespace(
            id_pegawai=self.users["teknis01"],
            id_bagian=self.bagian["teknis"],
            role="Pegawai",
            bagian=SimpleNamespace(kode_bagian="BAG-03", nama_bagian="Subbagian Teknis Penyelenggaraan Pemilu"),
        )
        for tbl in ("pagu_anggaran", "realisasi_anggaran", "revisi_anggaran", "akun_anggaran"):
            sql = kirana_db._scoped_relation(tbl, teknis_user)
            self.assertIn(f"id_bagian = {self.bagian['teknis']}", sql, f"KIRANA did not scope {tbl} for non-finance user")


if __name__ == "__main__":
    unittest.main()
