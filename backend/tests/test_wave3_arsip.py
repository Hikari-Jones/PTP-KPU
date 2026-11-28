"""Wave 3 integration tests for Arsip Data (PKPU 7/2021 SKKAAD, PKPU 17/2023 JRA, fixity, versioning, disposal)."""
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
from app.api.v1.endpoints import files as files_ep
from app.api.v1.endpoints.auth import create_access_token
from app.core import database as db_module
from app.core.config import settings
from app.core.database import Base, get_db
from app.core.reference_data import ensure_reference_data
import app.models  # noqa: F401
from app.models.schema import Bagian, Pegawai


class Wave3ArsipTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self._orig_grants = list(settings.AUTHORITY_GRANTS)
        self._orig_storage = files_ep.STORAGE_ROOT
        self._orig_db_session = db_module.AsyncSessionLocal
        self._orig_main_session = main_module.AsyncSessionLocal
        self._tmp = tempfile.TemporaryDirectory()
        files_ep.STORAGE_ROOT = Path(self._tmp.name).resolve()

        self.engine = create_async_engine(
            "sqlite+aiosqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        self.session_factory = async_sessionmaker(self.engine, class_=AsyncSession, expire_on_commit=False)
        db_module.AsyncSessionLocal = self.session_factory
        main_module.AsyncSessionLocal = self.session_factory

        async def _override_get_db():
            async with self.session_factory() as session:
                yield session

        main_module.app.dependency_overrides[get_db] = _override_get_db
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=main_module.app), base_url="http://test")

        async with self.session_factory() as db:
            self.klas_map, _ = await ensure_reference_data(db)
            b_teknis = Bagian(kode_bagian="BAG-03", nama_bagian="Subbagian Teknis")
            b_hukum = Bagian(kode_bagian="BAG-04", nama_bagian="Subbagian Hukum")
            b_umum = Bagian(kode_bagian="BAG-05", nama_bagian="Subbagian Umum dan Logistik")
            db.add_all([b_teknis, b_hukum, b_umum])
            await db.flush()

            users = {
                "admin01": Pegawai(nip="admin01", nama="Admin Utama", jabatan="Administrator", password="test", role="Admin", id_bagian=b_umum.id_bagian),
                "teknis01": Pegawai(nip="teknis01", nama="Staf Teknis 1", jabatan="Staf", password="test", role="Pegawai", id_bagian=b_teknis.id_bagian),
                "teknis02": Pegawai(nip="teknis02", nama="Staf Teknis 2", jabatan="Staf", password="test", role="Pegawai", id_bagian=b_teknis.id_bagian),
                "hukum01": Pegawai(nip="hukum01", nama="Staf Hukum 1", jabatan="Staf", password="test", role="Pegawai", id_bagian=b_hukum.id_bagian),
                "umum01": Pegawai(nip="umum01", nama="Arsiparis Umum 1", jabatan="Arsiparis", password="test", role="Pegawai", id_bagian=b_umum.id_bagian),
            }
            db.add_all(users.values())
            await db.commit()
            self.users = {k: v.id_pegawai for k, v in users.items()}
            self.tokens = {
                k: {"Authorization": "Bearer " + create_access_token({"sub": v.nip, "role": v.role, "id": v.id_pegawai, "sv": 0})}
                for k, v in users.items()
            }

    async def asyncTearDown(self):
        await self.client.aclose()
        main_module.app.dependency_overrides.clear()
        db_module.AsyncSessionLocal = self._orig_db_session
        main_module.AsyncSessionLocal = self._orig_main_session
        settings.AUTHORITY_GRANTS = self._orig_grants
        files_ep.STORAGE_ROOT = self._orig_storage
        await self.engine.dispose()
        self._tmp.cleanup()

    async def _upload(self, username: str, filename: str, content: bytes, mime: str = "application/pdf") -> dict:
        res = await self.client.post(
            "/api/v1/files/upload",
            headers=self.tokens[username],
            files={"file": (filename, content, mime)},
            data={"category": "arsip"},
        )
        self.assertEqual(res.status_code, 201, res.text)
        return res.json()

    async def test_skkaad_4_tier_access_grants_and_audit_logs(self):
        up = await self._upload("teknis01", "sangat_rahasia.pdf", b"%PDF-1.4 ultra secret payload")
        self.assertEqual(len(up["sha256_hash"]), 64)

        cr = await self.client.post(
            "/api/v1/arsip/",
            headers=self.tokens["teknis01"],
            json={
                "nama_dokumen": "Dokumen Sangat Rahasia Sengketa",
                "nomor_dokumen": "SR-001/2026",
                "id_pegawai": 0,
                "id_klasifikasi": self.klas_map["HK.03.1"],
                "kategori": "Sengketa",
                "tanggal_dokumen": "2026-05-01",
                "file_path": str(up["file_id"]),
                "hak_akses": "sangat_rahasia",
                "lokasi_fisik": "Brankas Utama / Laci 1",
                "nomor_berkas": "BRK-SR-01",
            },
        )
        self.assertEqual(cr.status_code, 201, cr.text)
        doc_id = cr.json()["id_dokumen"]
        self.assertEqual(cr.json()["hak_akses"], "sangat_rahasia")
        self.assertEqual(cr.json()["sha256_hash"], up["sha256_hash"])
        self.assertEqual(cr.json()["kode_klasifikasi"], "HK.03.1")

        # Same-section colleague (teknis02) and Hukum MUST NOT see or download sangat_rahasia
        self.assertEqual((await self.client.get(f"/api/v1/arsip/{doc_id}", headers=self.tokens["teknis02"])).status_code, 403)
        self.assertEqual((await self.client.get(f"/api/v1/files/{up['file_id']}", headers=self.tokens["hukum01"])).status_code, 403)
        lst_hukum = await self.client.get("/api/v1/arsip/", headers=self.tokens["hukum01"])
        self.assertFalse(any(d["id_dokumen"] == doc_id for d in lst_hukum.json()))

        # Owner grants explicit temporary SKKAAD access to hukum01
        gr = await self.client.post(
            f"/api/v1/arsip/{doc_id}/access-grants",
            headers=self.tokens["teknis01"],
            json={
                "id_pegawai": self.users["hukum01"],
                "alasan": "Pendampingan sidang PHPU",
                "valid_until": (date.today() + timedelta(days=7)).isoformat(),
            },
        )
        self.assertEqual(gr.status_code, 201, gr.text)
        grant_id = gr.json()["id"]

        # Now hukum01 CAN view, list, and download the file!
        self.assertEqual((await self.client.get(f"/api/v1/arsip/{doc_id}", headers=self.tokens["hukum01"])).status_code, 200)
        self.assertEqual((await self.client.get(f"/api/v1/files/{up['file_id']}", headers=self.tokens["hukum01"])).status_code, 200)
        lst_hukum2 = await self.client.get("/api/v1/arsip/", headers=self.tokens["hukum01"])
        self.assertTrue(any(d["id_dokumen"] == doc_id for d in lst_hukum2.json()))

        # Revoke grant -> hukum01 is blocked again
        rv = await self.client.delete(f"/api/v1/arsip/{doc_id}/access-grants/{grant_id}", headers=self.tokens["teknis01"])
        self.assertEqual(rv.status_code, 204)
        self.assertEqual((await self.client.get(f"/api/v1/arsip/{doc_id}", headers=self.tokens["hukum01"])).status_code, 403)

        # Grant DB-backed access_secret_archive authority to umum01 -> can view & inspect global audit logs
        today = date.today().isoformat()
        ag = await self.client.post(
            "/api/v1/authority-grants/",
            headers=self.tokens["admin01"],
            json={
                "pegawai_id": self.users["umum01"],
                "action": "access_secret_archive",
                "jabatan_penugasan": "Arsiparis Ahli Muda",
                "document_reference": "SK-ARSIP-01/2026",
                "valid_from": today,
                "valid_until": today,
            },
        )
        self.assertEqual(ag.status_code, 201, ag.text)
        self.assertEqual((await self.client.get(f"/api/v1/arsip/{doc_id}", headers=self.tokens["umum01"])).status_code, 200)

        logs = await self.client.get(f"/api/v1/arsip/audit-logs?id_dokumen={doc_id}", headers=self.tokens["umum01"])
        self.assertEqual(logs.status_code, 200, logs.text)
        actions = {row["aksi"] for row in logs.json()}
        self.assertTrue({"create", "grant_access", "view", "download", "revoke_access"}.issubset(actions), actions)

    async def test_jra_guards_vital_legal_hold_permanen_and_disposal_berita_acara(self):
        # 1. Permanent classification (HK.01.1 -> 5+10 yrs, permanen)
        perm_doc = await self.client.post(
            "/api/v1/arsip/",
            headers=self.tokens["admin01"],
            json={
                "nama_dokumen": "SK Penetapan Rekapitulasi",
                "nomor_dokumen": "KPT-01/2005",
                "id_pegawai": 0,
                "id_klasifikasi": self.klas_map["HK.01.1"],
                "kategori": "Keputusan",
                "tanggal_dokumen": "2005-01-10",
                "hak_akses": "publik",
            },
        )
        self.assertEqual(perm_doc.status_code, 201, perm_doc.text)
        p_data = perm_doc.json()
        self.assertEqual(p_data["nasib_akhir"], "permanen")
        self.assertEqual(p_data["status_retensi"], "siap_susut")

        # Permanent delete blocked because nasib_akhir == permanen
        await self.client.patch(f"/api/v1/arsip/{p_data['id_dokumen']}/delete", headers=self.tokens["admin01"])
        del_p = await self.client.delete(f"/api/v1/arsip/{p_data['id_dokumen']}/permanent", headers=self.tokens["admin01"])
        self.assertEqual(del_p.status_code, 409, del_p.text)
        await self.client.patch(f"/api/v1/arsip/{p_data['id_dokumen']}/restore", headers=self.tokens["admin01"])

        # 2. Recent classified doc (RT.01.1 -> 2+3=5 yrs) -> still aktif -> permanent delete blocked
        active_doc = await self.client.post(
            "/api/v1/arsip/",
            headers=self.tokens["admin01"],
            json={
                "nama_dokumen": "Nota Dinas Ketatausahaan Baru",
                "nomor_dokumen": "RT-2026-01",
                "id_pegawai": 0,
                "id_klasifikasi": self.klas_map["RT.01.1"],
                "kategori": "Ketatausahaan",
                "tanggal_dokumen": date.today().isoformat(),
                "hak_akses": "internal",
            },
        )
        self.assertEqual(active_doc.status_code, 201, active_doc.text)
        a_id = active_doc.json()["id_dokumen"]
        self.assertEqual(active_doc.json()["status_retensi"], "aktif")
        await self.client.patch(f"/api/v1/arsip/{a_id}/delete", headers=self.tokens["admin01"])
        del_a = await self.client.delete(f"/api/v1/arsip/{a_id}/permanent", headers=self.tokens["admin01"])
        self.assertEqual(del_a.status_code, 409, del_a.text)

        # 3. Vital & Legal Hold doc -> blocked from permanent delete and disposal
        vital_doc = await self.client.post(
            "/api/v1/arsip/",
            headers=self.tokens["admin01"],
            json={
                "nama_dokumen": "Sertifikat Tanah Kantor KPU",
                "nomor_dokumen": "BMN-VITAL-01",
                "id_pegawai": 0,
                "id_klasifikasi": self.klas_map["RT.01.1"],
                "kategori": "Aset",
                "tanggal_dokumen": "2010-01-01",
                "hak_akses": "terbatas",
                "arsip_vital": True,
                "legal_hold": True,
                "legal_hold_alasan": "Audit BPK & Bukti Kepemilikan Aset",
            },
        )
        self.assertEqual(vital_doc.status_code, 201, vital_doc.text)
        v_id = vital_doc.json()["id_dokumen"]
        prop_vital = await self.client.post(
            "/api/v1/arsip/penyusutan",
            headers=self.tokens["admin01"],
            json={"jenis_penyusutan": "musnah", "alasan": "Uji musnah vital", "dokumen_ids": [v_id]},
        )
        self.assertEqual(prop_vital.status_code, 409, prop_vital.text)

        # 4. Expired musnah doc (RT.01.1 from 2015 -> siap_susut) -> formal disposal workflow + Berita Acara PDF
        old_doc = await self.client.post(
            "/api/v1/arsip/",
            headers=self.tokens["admin01"],
            json={
                "nama_dokumen": "Daftar Hadir Rapat Internal 2015",
                "nomor_dokumen": "RT-2015-99",
                "id_pegawai": 0,
                "id_klasifikasi": self.klas_map["RT.01.1"],
                "kategori": "Ketatausahaan",
                "tanggal_dokumen": "2015-03-10",
                "hak_akses": "internal",
            },
        )
        self.assertEqual(old_doc.status_code, 201, old_doc.text)
        old_id = old_doc.json()["id_dokumen"]
        self.assertEqual(old_doc.json()["status_retensi"], "siap_susut")

        # Grant approve_disposal to umum01
        today = date.today().isoformat()
        await self.client.post(
            "/api/v1/authority-grants/",
            headers=self.tokens["admin01"],
            json={
                "pegawai_id": self.users["umum01"],
                "action": "approve_disposal",
                "document_reference": "SK-PANITIA-SUSUT/2026",
                "valid_from": today,
                "valid_until": today,
            },
        )

        # umum01 proposes disposal; maker-checker blocks umum01 from self-executing; admin01 executes
        prop = await self.client.post(
            "/api/v1/arsip/penyusutan",
            headers=self.tokens["umum01"],
            json={
                "jenis_penyusutan": "musnah",
                "alasan": "Telah melampaui masa retensi aktif 2 tahun dan inaktif 3 tahun sesuai PKPU 17/2023",
                "dokumen_ids": [old_id],
            },
        )
        self.assertEqual(prop.status_code, 201, prop.text)
        pid = prop.json()["id"]
        self.assertTrue(prop.json()["nomor_ba"].startswith("BA-SUSUT/"))

        self_exec = await self.client.post(
            f"/api/v1/arsip/penyusutan/{pid}/eksekusi",
            headers=self.tokens["umum01"],
            json={"catatan_persetujuan": "Self approve"},
        )
        self.assertEqual(self_exec.status_code, 403)

        ok_exec = await self.client.post(
            f"/api/v1/arsip/penyusutan/{pid}/eksekusi",
            headers=self.tokens["admin01"],
            json={"catatan_persetujuan": "Disetujui Panitia Penilai Arsip"},
        )
        self.assertEqual(ok_exec.status_code, 200, ok_exec.text)
        self.assertEqual(ok_exec.json()["status"], "dieksekusi")

        # Berita Acara PDF download
        ba_pdf = await self.client.get(f"/api/v1/arsip/penyusutan/{pid}/berita-acara", headers=self.tokens["umum01"])
        self.assertEqual(ba_pdf.status_code, 200)
        self.assertEqual(ba_pdf.headers["content-type"], "application/pdf")
        self.assertTrue(ba_pdf.content.startswith(b"%PDF-"))

    async def test_duplicate_detection_fulltext_search_and_versioning(self):
        csv_body = b"kode,uraian\n001,KPU_SULUT_REKAPITULASI_UNIK_2026\n"
        up1 = await self._upload("teknis01", "rekap_v1.csv", csv_body, "text/csv")
        cr1 = await self.client.post(
            "/api/v1/arsip/",
            headers=self.tokens["teknis01"],
            json={
                "nama_dokumen": "Rekapitulasi Data Pemilih",
                "nomor_dokumen": "DP-001/2026",
                "id_pegawai": 0,
                "kategori": "Data Pemilih",
                "tanggal_dokumen": "2026-06-01",
                "file_path": str(up1["file_id"]),
                "hak_akses": "internal",
            },
        )
        self.assertEqual(cr1.status_code, 201, cr1.text)
        doc1_id = cr1.json()["id_dokumen"]
        self.assertEqual(cr1.json()["versi_dokumen"], 1)

        # Duplicate SHA-256 detection
        dup = await self.client.get(f"/api/v1/arsip/cek-duplikat?sha256={up1['sha256_hash']}", headers=self.tokens["teknis01"])
        self.assertEqual(dup.status_code, 200, dup.text)
        self.assertEqual(len(dup.json()), 1)
        self.assertEqual(dup.json()[0]["id_dokumen"], doc1_id)

        # Full-text search hits extracted CSV body
        ft = await self.client.get("/api/v1/arsip/?search=KPU_SULUT_REKAPITULASI_UNIK_2026", headers=self.tokens["teknis01"])
        self.assertEqual(ft.status_code, 200, ft.text)
        self.assertTrue(any(d["id_dokumen"] == doc1_id for d in ft.json()))

        # Upload new version v2
        up2 = await self._upload("teknis01", "rekap_v2.csv", b"kode,uraian\n001,REVISI_FINAL_2026\n", "text/csv")
        v2 = await self.client.post(
            f"/api/v1/arsip/{doc1_id}/versi",
            headers=self.tokens["teknis01"],
            json={"file_path": str(up2["file_id"]), "catatan_versi": "Perbaikan data TPS"},
        )
        self.assertEqual(v2.status_code, 201, v2.text)
        self.assertEqual(v2.json()["versi_dokumen"], 2)
        self.assertEqual(v2.json()["parent_dokumen_id"], doc1_id)

        vers = await self.client.get(f"/api/v1/arsip/{doc1_id}/versi", headers=self.tokens["teknis01"])
        self.assertEqual(vers.status_code, 200, vers.text)
        self.assertEqual([x["versi_dokumen"] for x in vers.json()], [2, 1])


if __name__ == "__main__":
    unittest.main()
