import asyncio
from datetime import date, datetime
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.main import app
from app.core.database import AsyncSessionLocal
from app.models.schema import Bagian, Pegawai, DokumenArsip

async def setup_test_environment(session: AsyncSession):
    # 1. Clean existing test data
    await session.execute(delete(DokumenArsip))
    await session.execute(delete(Pegawai))
    await session.execute(delete(Bagian))
    await session.commit()

    # 2. Create Bagian
    b_keuangan = Bagian(nama_bagian="Sub Bagian Keuangan")
    b_hukum = Bagian(nama_bagian="Sub Bagian Hukum")
    session.add_all([b_keuangan, b_hukum])
    await session.commit()
    await session.refresh(b_keuangan)
    await session.refresh(b_hukum)

    # 3. Create Pegawai (1 Admin, 1 Staff Keuangan, 1 Staff Hukum)
    p_admin = Pegawai(id_bagian=b_keuangan.id_bagian, nama="Admin KPU", password="hash_admin", role="admin")
    p_staff_keuangan = Pegawai(id_bagian=b_keuangan.id_bagian, nama="Ahmad Keuangan", password="hash_staff", role="operator")
    p_staff_hukum = Pegawai(id_bagian=b_hukum.id_bagian, nama="Dewi Hukum", password="hash_staff", role="operator")
    session.add_all([p_admin, p_staff_keuangan, p_staff_hukum])
    await session.commit()
    await session.refresh(p_admin)
    await session.refresh(p_staff_keuangan)
    await session.refresh(p_staff_hukum)

    # 4. Create Documents
    # Doc 1: Uploaded by Staff Keuangan (internal)
    doc1 = DokumenArsip(
        nama_dokumen="Laporan Keuangan Q1.pdf",
        nomor_dokumen="001/KU/2026",
        id_pegawai=p_staff_keuangan.id_pegawai,
        kategori="Laporan",
        event="Operasional 2026",
        tanggal_dokumen=date(2026, 4, 1),
        hak_akses="internal",
        status_hapus=False,
    )
    # Doc 2: Uploaded by Staff Hukum (terbatas/restricted)
    doc2 = DokumenArsip(
        nama_dokumen="Kajian Hukum Rahasia.pdf",
        nomor_dokumen="002/HK/2026",
        id_pegawai=p_staff_hukum.id_pegawai,
        kategori="Kajian",
        event="Pilkada 2026",
        tanggal_dokumen=date(2026, 4, 2),
        hak_akses="terbatas",
        status_hapus=False,
    )
    # Doc 3: Already in Trash
    doc3 = DokumenArsip(
        nama_dokumen="Draft SK Usang.pdf",
        nomor_dokumen="003/SK/2025",
        id_pegawai=p_staff_keuangan.id_pegawai,
        kategori="Surat Keputusan",
        event="Operasional 2025",
        tanggal_dokumen=date(2025, 1, 1),
        hak_akses="publik",
        status_hapus=True,
        dihapus_oleh=p_admin.id_pegawai,
        dihapus_pada=datetime(2025, 1, 15, 10, 0),
    )
    session.add_all([doc1, doc2, doc3])
    await session.commit()
    await session.refresh(doc1)
    await session.refresh(doc2)
    await session.refresh(doc3)

    return {
        "admin": p_admin,
        "staff_keuangan": p_staff_keuangan,
        "staff_hukum": p_staff_hukum,
        "doc1": doc1,
        "doc2": doc2,
        "doc3": doc3,
    }

async def run_auth_and_trash_tests():
    async with AsyncSessionLocal() as session:
        ctx = await setup_test_environment(session)

    admin_headers = {"X-User-Id": str(ctx["admin"].id_pegawai)}
    staff_keuangan_headers = {"X-User-Id": str(ctx["staff_keuangan"].id_pegawai)}
    staff_hukum_headers = {"X-User-Id": str(ctx["staff_hukum"].id_pegawai)}

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        print("\n====================================================================")
        print(" TEST 1: SOFT DELETE AUTHORIZATION (DELETE /api/arsip/{id})")
        print("====================================================================")

        # 1. Staff Keuangan tries to delete Doc 2 (Owned by Staff Hukum, restricted) -> MUST FAIL (403 Forbidden)
        r_unauth = await client.delete(f"/api/arsip/{ctx['doc2'].id_dokumen}", headers=staff_keuangan_headers)
        print(f"1. Staff Keuangan deleting Doc 2 (Hukum Restricted) -> Status: {r_unauth.status_code}")
        assert r_unauth.status_code == 403, f"Expected 403, got {r_unauth.status_code}: {r_unauth.text}"
        print(f"   Detail error: {r_unauth.json()['detail']}")

        # Verify Doc 2 is still active in database
        r_doc2_check = await client.get(f"/api/arsip/{ctx['doc2'].id_dokumen}", headers=admin_headers)
        assert r_doc2_check.json()["status_hapus"] is False

        # 2. Staff Keuangan deletes Doc 1 (Their own document) -> MUST SUCCEED (200 OK)
        r_own_del = await client.delete(f"/api/arsip/{ctx['doc1'].id_dokumen}", headers=staff_keuangan_headers)
        print(f"2. Staff Keuangan deleting Doc 1 (Own Document) -> Status: {r_own_del.status_code}")
        assert r_own_del.status_code == 200
        doc1_deleted = r_own_del.json()
        assert doc1_deleted["status_hapus"] is True
        assert doc1_deleted["dihapus_oleh"] == ctx["staff_keuangan"].id_pegawai
        assert doc1_deleted["dihapus_pada"] is not None
        print(f"   Success: status_hapus=True, dihapus_oleh={doc1_deleted['nama_penghapus']}, timestamp={doc1_deleted['dihapus_pada']}")

        # 3. Admin deletes Doc 2 -> MUST SUCCEED (200 OK)
        r_admin_del = await client.delete(f"/api/arsip/{ctx['doc2'].id_dokumen}", headers=admin_headers)
        print(f"3. Admin deleting Doc 2 -> Status: {r_admin_del.status_code}")
        assert r_admin_del.status_code == 200
        assert r_admin_del.json()["status_hapus"] is True

        print("\n====================================================================")
        print(" TEST 2: TRASH LISTING (GET /api/arsip/trash)")
        print("====================================================================")
        r_trash = await client.get("/api/arsip/trash", headers=admin_headers)
        assert r_trash.status_code == 200
        trash_items = r_trash.json()
        print(f"Trash total items: {len(trash_items)}")
        assert len(trash_items) == 3  # doc1, doc2, doc3
        for item in trash_items:
            assert item["status_hapus"] is True
            print(f"  - [{item['id_dokumen']}] {item['nama_dokumen']} | Dihapus oleh: {item['nama_penghapus']} ({item['dihapus_pada']})")

        print("\n====================================================================")
        print(" TEST 3: RESTORE AUTHORIZATION (PATCH /api/arsip/{id}/restore)")
        print("====================================================================")

        # 1. Staff Hukum tries to restore Doc 1 (Owned and deleted by Staff Keuangan) -> MUST FAIL (403 Forbidden)
        r_rest_unauth = await client.patch(f"/api/arsip/{ctx['doc1'].id_dokumen}/restore", headers=staff_hukum_headers)
        print(f"1. Staff Hukum restoring Doc 1 (Keuangan) -> Status: {r_rest_unauth.status_code}")
        assert r_rest_unauth.status_code == 403
        print(f"   Detail error: {r_rest_unauth.json()['detail']}")

        # 2. Staff Keuangan restores Doc 1 (Their own document) -> MUST SUCCEED (200 OK)
        r_rest_own = await client.patch(f"/api/arsip/{ctx['doc1'].id_dokumen}/restore", headers=staff_keuangan_headers)
        print(f"2. Staff Keuangan restoring Doc 1 -> Status: {r_rest_own.status_code}")
        assert r_rest_own.status_code == 200
        doc1_restored = r_rest_own.json()
        assert doc1_restored["status_hapus"] is False
        assert doc1_restored["dihapus_oleh"] is None
        assert doc1_restored["dihapus_pada"] is None
        print(f"   Success: status_hapus=False, dihapus_oleh=None, dihapus_pada=None")

        # 3. Admin restores Doc 2 -> MUST SUCCEED (200 OK)
        r_rest_admin = await client.patch(f"/api/arsip/{ctx['doc2'].id_dokumen}/restore", headers=admin_headers)
        assert r_rest_admin.status_code == 200
        assert r_rest_admin.json()["status_hapus"] is False
        print("3. Admin restoring Doc 2 -> OK")

        # Verify active listing now contains doc1 and doc2, and trash only contains doc3
        r_active = await client.get("/api/arsip/", headers=admin_headers)
        assert len(r_active.json()) == 2
        r_trash_after = await client.get("/api/arsip/trash", headers=admin_headers)
        assert len(r_trash_after.json()) == 1

        print("\n====================================================================")
        print(" TEST 4: PERMANENT DELETE AUTHORIZATION (DELETE /api/arsip/{id}/permanent)")
        print("====================================================================")

        # 1. Staff Keuangan tries to permanent delete Doc 3 -> STRICTLY FORBIDDEN (403 Forbidden)
        r_perm_staff = await client.delete(f"/api/arsip/{ctx['doc3'].id_dokumen}/permanent", headers=staff_keuangan_headers)
        print(f"1. Staff Keuangan attempting permanent delete -> Status: {r_perm_staff.status_code}")
        assert r_perm_staff.status_code == 403, f"Expected 403, got {r_perm_staff.status_code}"
        print(f"   Detail error: {r_perm_staff.json()['detail']}")

        # Verify Doc 3 is still in database
        r_check_doc3 = await client.get(f"/api/arsip/{ctx['doc3'].id_dokumen}", headers=admin_headers)
        assert r_check_doc3.status_code == 200
        print("   Verified: Doc 3 was NOT deleted by unauthorized staff attempt.")

        # 2. Admin performs permanent delete -> MUST SUCCEED (200 OK)
        r_perm_admin = await client.delete(f"/api/arsip/{ctx['doc3'].id_dokumen}/permanent", headers=admin_headers)
        print(f"2. Admin attempting permanent delete -> Status: {r_perm_admin.status_code}")
        assert r_perm_admin.status_code == 200
        print("   Success: Document permanently deleted from MySQL.")

        # 3. Verify Doc 3 no longer exists anywhere in DB
        r_check_doc3_deleted = await client.get(f"/api/arsip/{ctx['doc3'].id_dokumen}", headers=admin_headers)
        assert r_check_doc3_deleted.status_code == 404
        print(f"3. Verification after permanent delete -> Status: {r_check_doc3_deleted.status_code} (404 Not Found as expected)")

        print("\n====================================================================")
        print(" ALL DELETE, RESTORE, TRASH, AND AUTH TESTS PASSED 100% PERFECTLY!")
        print("====================================================================\n")

if __name__ == "__main__":
    asyncio.run(run_auth_and_trash_tests())
