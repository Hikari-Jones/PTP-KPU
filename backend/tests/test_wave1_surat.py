"""Wave 1 TDD suite: Surat Menyurat upgrades (AuthorityGrant, Surat Keluar lifecycle,
Surat Tugas conflicts & roles, Surat Masuk Lembar Disposisi PDF, Klasifikasi CRUD, Dashboard)."""
import os
import tempfile
import unittest
from datetime import date, timedelta
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
from app.core.reference_data import ensure_reference_data
import app.models  # noqa: F401
from app.models.schema import Bagian, Pegawai


class Wave1SuratTests(unittest.IsolatedAsyncioTestCase):
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
            b_umlog = Bagian(kode_bagian="BAG-05", nama_bagian="Subbagian Umum dan Logistik (UMLOG)")
            b_teknis = Bagian(kode_bagian="BAG-03", nama_bagian="Subbagian Teknis Penyelenggaraan Pemilu")
            b_hukum = Bagian(kode_bagian="BAG-04", nama_bagian="Subbagian Hukum")
            db.add_all([b_admin, b_umlog, b_teknis, b_hukum])
            await db.flush()
            self.bagian = {
                "admin": b_admin.id_bagian,
                "umlog": b_umlog.id_bagian,
                "teknis": b_teknis.id_bagian,
                "hukum": b_hukum.id_bagian,
            }

            users = [
                Pegawai(nama="Sys Admin", nip="admin01", role="Admin", id_bagian=b_admin.id_bagian, jabatan="Administrator", password="test"),
                Pegawai(nama="Kasubbag UMLOG", nip="umlog01", role="Pegawai", id_bagian=b_umlog.id_bagian, jabatan="Kasubbag Umum dan Logistik", password="test"),
                Pegawai(nama="Staf Teknis 1", nip="teknis01", role="Pegawai", id_bagian=b_teknis.id_bagian, jabatan="Penata Kelola Pemilu", password="test"),
                Pegawai(nama="Staf Teknis 2", nip="teknis02", role="Pegawai", id_bagian=b_teknis.id_bagian, jabatan="Staf Teknis", password="test"),
                Pegawai(nama="Staf Hukum", nip="hukum01", role="Pegawai", id_bagian=b_hukum.id_bagian, jabatan="Analis Hukum", password="test"),
            ]
            db.add_all(users)
            await db.flush()
            self.users = {u.nip: u.id_pegawai for u in users}
            self.tokens = {
                u.nip: {"Authorization": "Bearer " + create_access_token({"sub": u.nip, "role": u.role, "id": u.id_pegawai, "sv": 0})}
                for u in users
            }
            self.klasifikasi, self.jenis = await ensure_reference_data(db)
            await db.commit()

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

    async def test_db_backed_authority_grant_enables_numbering_and_signing_without_env(self):
        settings.OFFICIAL_ISSUANCE_ENABLED = True
        settings.AUTHORITY_GRANTS = []
        today = date.today().isoformat()
        next_year = (date.today() + timedelta(days=365)).isoformat()

        # Before grant, umlog01 has no numbering authority
        st_before = await self.client.get("/api/v1/surat-keluar/penerbitan-status", headers=self.tokens["umlog01"])
        self.assertEqual(st_before.status_code, 200)
        self.assertFalse(st_before.json()["has_numbering_authority"])

        # Admin registers SK Penunjukan Pejabat Penomoran in DB
        grant_res = await self.client.post(
            "/api/v1/authority-grants",
            headers=self.tokens["admin01"],
            json={
                "pegawai_id": self.users["umlog01"],
                "action": "number_official_letter",
                "jabatan_penugasan": "Kasubbag Umum & Logistik (Penomoran)",
                "document_reference": "SK-KPU-71/012/2026",
                "valid_from": today,
                "valid_until": next_year,
            },
        )
        self.assertEqual(grant_res.status_code, 201, grant_res.text)
        grant_id = grant_res.json()["id"]

        st_after = await self.client.get("/api/v1/surat-keluar/penerbitan-status", headers=self.tokens["umlog01"])
        self.assertTrue(st_after.json()["has_numbering_authority"])

        # Revoking removes authority immediately
        del_res = await self.client.delete(f"/api/v1/authority-grants/{grant_id}", headers=self.tokens["admin01"])
        self.assertEqual(del_res.status_code, 200, del_res.text)
        st_revoked = await self.client.get("/api/v1/surat-keluar/penerbitan-status", headers=self.tokens["umlog01"])
        self.assertFalse(st_revoked.json()["has_numbering_authority"])

    async def test_surat_keluar_full_lifecycle_edit_review_issuance_export_and_verify(self):
        settings.OFFICIAL_ISSUANCE_ENABLED = True
        today = date.today().isoformat()
        settings.AUTHORITY_GRANTS = [
            {"pegawai_id": self.users["umlog01"], "action": "number_official_letter", "document_reference": "SK-NUM", "valid_from": today, "valid_until": today},
            {"pegawai_id": self.users["umlog01"], "action": "sign_official_letter", "document_reference": "SK-SIGN", "valid_from": today, "valid_until": today},
        ]

        # 1. Teknis creates draft with tembusan & signatory metadata
        cr = await self.client.post(
            "/api/v1/surat-keluar/draft",
            headers=self.tokens["teknis01"],
            json={
                "id_bagian": self.bagian["teknis"],
                "id_klasifikasi": self.klasifikasi["PL.01.1"],
                "id_jenis_surat": self.jenis["SD"],
                "perihal": "Koordinasi Tahapan Pemilu",
                "tujuan_surat": "Ketua KPU Kabupaten/Kota se-Sulawesi Utara",
                "isi_surat": "Mohon hadir dalam rapat koordinasi tahapan.",
                "lampiran": "1 berkas",
                "tembusan": "1. Ketua KPU Provinsi Sulawesi Utara\n2. Arsip",
                "penandatangan_nama": "Sekretaris KPU Sulut",
                "penandatangan_jabatan": "Sekretaris",
                "atas_nama": "a.n.",
                "tanggal_surat": "2026-11-15",
            },
        )
        self.assertEqual(cr.status_code, 201, cr.text)
        sk_id = cr.json()["id_surat_keluar"]

        # 2. Owner edits draft via PUT
        ed = await self.client.put(
            f"/api/v1/surat-keluar/{sk_id}",
            headers=self.tokens["teknis01"],
            json={"perihal": "Koordinasi Tahapan Pemilu (Revisi Judul)"},
        )
        self.assertEqual(ed.status_code, 200, ed.text)
        self.assertEqual(ed.json()["perihal"], "Koordinasi Tahapan Pemilu (Revisi Judul)")

        # 3. Lifecycle: draft -> diajukan -> revisi -> diajukan -> disetujui -> terbit -> diarsipkan
        aj1 = await self.client.post(f"/api/v1/surat-keluar/{sk_id}/ajukan", headers=self.tokens["teknis01"], json={"catatan": "Mohon paraf"})
        self.assertEqual(aj1.status_code, 200, aj1.text)
        self.assertEqual(aj1.json()["status"], "diajukan")

        rev = await self.client.post(f"/api/v1/surat-keluar/{sk_id}/revisi", headers=self.tokens["umlog01"], json={"catatan": "Lengkapi jadwal"})
        self.assertEqual(rev.status_code, 200, rev.text)
        self.assertEqual(rev.json()["status"], "revisi")

        aj2 = await self.client.post(f"/api/v1/surat-keluar/{sk_id}/ajukan", headers=self.tokens["teknis01"], json={"catatan": "Sudah diperbaiki"})
        self.assertEqual(aj2.status_code, 200, aj2.text)

        ap = await self.client.post(f"/api/v1/surat-keluar/{sk_id}/setujui", headers=self.tokens["umlog01"], json={"catatan": "Paraf oke"})
        self.assertEqual(ap.status_code, 200, ap.text)
        self.assertEqual(ap.json()["status"], "disetujui")

        fin = await self.client.post(f"/api/v1/surat-keluar/{sk_id}/finalisasi", headers=self.tokens["umlog01"], json={"catatan": "Terbitkan"})
        self.assertEqual(fin.status_code, 200, fin.text)
        ver_code = fin.json()["verification_code"]
        self.assertTrue(fin.json().get("content_sha256"))

        # 4. Public verification includes metadata & digest
        ver = await self.client.get(f"/api/v1/verifikasi/{ver_code}")
        self.assertEqual(ver.status_code, 200, ver.text)
        self.assertEqual(ver.json()["perihal"], "Koordinasi Tahapan Pemilu (Revisi Judul)")
        self.assertEqual(ver.json()["content_sha256"], fin.json()["content_sha256"])

        # 5. Export PDF & DOCX succeed cleanly
        pdf = await self.client.get(f"/api/v1/surat-keluar/{sk_id}/export?format=pdf", headers=self.tokens["teknis01"])
        self.assertEqual(pdf.status_code, 200)
        self.assertTrue(pdf.content.startswith(b"%PDF-"))
        docx = await self.client.get(f"/api/v1/surat-keluar/{sk_id}/export?format=docx", headers=self.tokens["teknis01"])
        self.assertEqual(docx.status_code, 200)
        self.assertTrue(docx.content.startswith(b"PK\x03\x04"))

        # 6. History & Archive state
        hist = await self.client.get(f"/api/v1/surat-keluar/{sk_id}/riwayat", headers=self.tokens["teknis01"])
        self.assertEqual(hist.status_code, 200, hist.text)
        self.assertGreaterEqual(len(hist.json()), 5)

        ars = await self.client.post(f"/api/v1/surat-keluar/{sk_id}/arsipkan", headers=self.tokens["teknis01"], json={})
        self.assertEqual(ars.status_code, 200, ars.text)
        self.assertEqual(ars.json()["status"], "diarsipkan")

        # 7. Draft deletion works and cleans up
        draft2 = await self.client.post(
            "/api/v1/surat-keluar/draft",
            headers=self.tokens["teknis01"],
            json={
                "id_bagian": self.bagian["teknis"],
                "id_klasifikasi": self.klasifikasi["PL.01.1"],
                "id_jenis_surat": self.jenis["SD"],
                "perihal": "Draft Batal",
                "tujuan_surat": "Internal",
                "tanggal_surat": "2026-11-16",
            },
        )
        d2_id = draft2.json()["id_surat_keluar"]
        del_d2 = await self.client.delete(f"/api/v1/surat-keluar/{d2_id}", headers=self.tokens["teknis01"])
        self.assertEqual(del_d2.status_code, 200, del_d2.text)

    async def test_surat_tugas_custom_roles_conflict_detection_scoping_and_laporan(self):
        # 1. Create Surat Tugas with custom pelaksana roles & dasar_tugas
        st1 = await self.client.post(
            "/api/v1/surat-tugas",
            headers=self.tokens["teknis01"],
            json={
                "maksud_tugas": "Monitoring Logistik TPS",
                "dasar_tugas": "Undangan KPU RI No. 12/2026",
                "tempat_tugas": "KPU Bitung",
                "tanggal_mulai": "2026-12-01",
                "tanggal_selesai": "2026-12-03",
                "id_klasifikasi": self.klasifikasi["HR.01.2"],
                "pelaksana_detail": [
                    {"id_pegawai": self.users["teknis01"], "peran_tugas": "Ketua Tim"},
                    {"id_pegawai": self.users["teknis02"], "peran_tugas": "Anggota"},
                ],
            },
        )
        self.assertEqual(st1.status_code, 201, st1.text)
        data1 = st1.json()
        self.assertEqual(data1["dasar_tugas"], "Undangan KPU RI No. 12/2026")
        roles = {p["id_pegawai"]: p["peran_tugas"] for p in data1["pelaksana"]}
        self.assertEqual(roles[self.users["teknis01"]], "Ketua Tim")

        # 2. Non-manager Hukum staff should NOT see Teknis's unrelated Surat Tugas!
        hukum_list = await self.client.get("/api/v1/surat-tugas", headers=self.tokens["hukum01"])
        self.assertEqual(hukum_list.status_code, 200)
        self.assertEqual(hukum_list.json(), [], "Unrelated non-manager staff saw another section's Surat Tugas!")

        # UMLOG manager CAN see all Surat Tugas
        umlog_list = await self.client.get("/api/v1/surat-tugas", headers=self.tokens["umlog01"])
        self.assertEqual(len(umlog_list.json()), 1)

        # 3. Conflict check detects overlap for teknis01 on 2026-12-02..2026-12-04
        chk = await self.client.get(
            f"/api/v1/surat-tugas/cek-konflik?pelaksana={self.users['teknis01']}&tanggal_mulai=2026-12-02&tanggal_selesai=2026-12-04",
            headers=self.tokens["teknis01"],
        )
        self.assertEqual(chk.status_code, 200, chk.text)
        self.assertEqual(len(chk.json()["konflik"]), 1)

        # 4. Attach post-duty report file
        up = await self.client.post(
            "/api/v1/files/upload",
            headers=self.tokens["teknis01"],
            files={"file": ("laporan_tugas.pdf", b"%PDF-1.4 laporan", "application/pdf")},
            data={"category": "surat"},
        )
        rep = await self.client.patch(
            f"/api/v1/surat-tugas/{data1['id_surat_tugas']}/laporan",
            headers=self.tokens["teknis01"],
            json={"file_id": up.json()["file_id"]},
        )
        self.assertEqual(rep.status_code, 200, rep.text)
        self.assertEqual(rep.json()["laporan_file_id"], up.json()["file_id"])

    async def test_surat_masuk_agenda_sla_participant_retention_and_lembar_disposisi_pdf(self):
        # Create incoming letter with sifat, batas_waktu, instruksi_disposisi
        cr = await self.client.post(
            "/api/v1/operations/letters",
            headers=self.tokens["umlog01"],
            json={
                "kind": "masuk",
                "subject": "Undangan Rapat Pleno KPU RI",
                "sender": "Sekjen KPU RI",
                "recipient": "Ketua KPU Provinsi Sulawesi Utara",
                "number": "55/UND/KPU/XI/2026",
                "content": "Rapat pleno penetapan daftar pemilih.",
                "date": "2026-11-10",
                "sifat_surat": "Segera",
                "batas_waktu": "2026-11-12",
                "id_klasifikasi": self.klasifikasi["PL.01.1"],
            },
        )
        self.assertEqual(cr.status_code, 201, cr.text)
        letter = cr.json()
        self.assertTrue(letter["nomor_agenda"].startswith("AGM/2026/"))
        lid = letter["id"]

        # Assign to teknis01, then reassign to hukum01 -> teknis01 MUST keep read access as prior participant!
        a1 = await self.client.post(
            f"/api/v1/operations/letters/{lid}/actions",
            headers=self.tokens["admin01"],
            json={
                "action": "assign",
                "version": 1,
                "assignee_id": self.users["teknis01"],
                "note": "Siapkan bahan data pemilih",
                "instruksi_disposisi": ["Tindak Lanjuti", "Siapkan Bahan"],
                "batas_waktu": "2026-11-12",
            },
        )
        self.assertEqual(a1.status_code, 200, a1.text)

        a2 = await self.client.post(
            f"/api/v1/operations/letters/{lid}/actions",
            headers=self.tokens["admin01"],
            json={"action": "assign", "version": 2, "assignee_id": self.users["hukum01"], "note": "Review aspek hukum"},
        )
        self.assertEqual(a2.status_code, 200, a2.text)

        # teknis01 still sees the letter in their history list
        t1_list = await self.client.get("/api/v1/operations/letters", headers=self.tokens["teknis01"])
        self.assertEqual(len(t1_list.json()), 1)

        # Printable Lembar Disposisi PDF
        pdf = await self.client.get(f"/api/v1/operations/letters/{lid}/lembar-disposisi", headers=self.tokens["hukum01"])
        self.assertEqual(pdf.status_code, 200, pdf.text)
        self.assertTrue(pdf.content.startswith(b"%PDF-"))

    async def test_klasifikasi_expanded_catalog_and_admin_update_delete(self):
        # Expanded Kep KPU 1257/2024 catalog has >= 15 codes and >= 8 jenis surat
        kl = await self.client.get("/api/v1/klasifikasi", headers=self.tokens["admin01"])
        js = await self.client.get("/api/v1/jenis-surat", headers=self.tokens["admin01"])
        self.assertGreaterEqual(len(kl.json()), 15)
        self.assertGreaterEqual(len(js.json()), 8)

        # Create, update, delete unused klasifikasi
        created = await self.client.post(
            "/api/v1/klasifikasi",
            headers=self.tokens["admin01"],
            json={
                "kode_klasifikasi": "ZZ.99.1",
                "nama_klasifikasi": "Uji Klasifikasi",
                "kategori_utama": "Uji",
                "retensi_aktif_tahun": 2,
                "retensi_inaktif_tahun": 3,
                "hak_akses": "Biasa",
            },
        )
        self.assertEqual(created.status_code, 200, created.text)
        kid = created.json()["id_klasifikasi"]

        upd = await self.client.put(
            f"/api/v1/klasifikasi/{kid}",
            headers=self.tokens["admin01"],
            json={"nama_klasifikasi": "Uji Klasifikasi Diperbarui"},
        )
        self.assertEqual(upd.status_code, 200, upd.text)
        self.assertEqual(upd.json()["nama_klasifikasi"], "Uji Klasifikasi Diperbarui")

        dl = await self.client.delete(f"/api/v1/klasifikasi/{kid}", headers=self.tokens["admin01"])
        self.assertEqual(dl.status_code, 200, dl.text)


if __name__ == "__main__":
    unittest.main()
