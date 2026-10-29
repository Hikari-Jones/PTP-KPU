import asyncio
from datetime import date, datetime
import httpx
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import select, delete

from app.main import app
from app.core.database import engine, AsyncSessionLocal
from app.models.schema import Bagian, Pegawai, DokumenArsip

async def seed_data(session: AsyncSession):
    # Check or create Bagian
    res_b1 = await session.execute(select(Bagian).where(Bagian.nama_bagian == "Sub Bagian Keuangan"))
    b1 = res_b1.scalar_one_or_none()
    if not b1:
        b1 = Bagian(nama_bagian="Sub Bagian Keuangan")
        session.add(b1)

    res_b2 = await session.execute(select(Bagian).where(Bagian.nama_bagian == "Sub Bagian Hukum"))
    b2 = res_b2.scalar_one_or_none()
    if not b2:
        b2 = Bagian(nama_bagian="Sub Bagian Hukum")
        session.add(b2)

    await session.commit()
    await session.refresh(b1)
    await session.refresh(b2)

    # Check or create Pegawai
    res_p1 = await session.execute(select(Pegawai).where(Pegawai.nama == "Ahmad Ramdhani"))
    p1 = res_p1.scalar_one_or_none()
    if not p1:
        p1 = Pegawai(id_bagian=b1.id_bagian, nama="Ahmad Ramdhani", password="hash1", role="operator")
        session.add(p1)

    res_p2 = await session.execute(select(Pegawai).where(Pegawai.nama == "Dewi Kusuma"))
    p2 = res_p2.scalar_one_or_none()
    if not p2:
        p2 = Pegawai(id_bagian=b2.id_bagian, nama="Dewi Kusuma", password="hash2", role="admin")
        session.add(p2)

    await session.commit()
    await session.refresh(p1)
    await session.refresh(p2)

    # Clean existing test dokumen_arsip
    await session.execute(delete(DokumenArsip))
    await session.commit()

    # Seed realistic dokumen_arsip data
    sample_docs = [
        DokumenArsip(
            nama_dokumen="Laporan Keuangan Triwulan I 2026.pdf",
            nomor_dokumen="001/KU/KPU-SU/IV/2026",
            id_pegawai=p1.id_pegawai,
            kategori="Laporan",
            event="Operasional 2026",
            tanggal_dokumen=date(2026, 4, 10),
            file_path="uploads/arsip/2026/04/laporan_keuangan_tw1.pdf",
            ukuran_file=1850000,
            hak_akses="internal",
            status_hapus=False,
        ),
        DokumenArsip(
            nama_dokumen="Laporan Logistik Pemilu 2024.pdf",
            nomor_dokumen="015/LOG/KPU-SU/II/2024",
            id_pegawai=p1.id_pegawai,
            kategori="Laporan",
            event="Pemilu 2024",
            tanggal_dokumen=date(2024, 2, 20),
            file_path="uploads/arsip/2024/02/logistik_pemilu.pdf",
            ukuran_file=3200000,
            hak_akses="publik",
            status_hapus=False,
        ),
        DokumenArsip(
            nama_dokumen="Surat Keputusan Penetapan Hasil Pilkada 2024.pdf",
            nomor_dokumen="088/HK/KPU-SU/XII/2024",
            id_pegawai=p2.id_pegawai,
            kategori="Surat Keputusan",
            event="Pilkada 2024",
            tanggal_dokumen=date(2024, 12, 15),
            file_path="uploads/arsip/2024/12/sk_penetapan_pilkada.pdf",
            ukuran_file=4100000,
            hak_akses="publik",
            status_hapus=False,
        ),
        DokumenArsip(
            nama_dokumen="Berita Acara Rapat Koordinasi Operasional 2026.docx",
            nomor_dokumen="004/BA/KPU-SU/IV/2026",
            id_pegawai=p2.id_pegawai,
            kategori="Berita Acara",
            event="Operasional 2026",
            tanggal_dokumen=date(2026, 4, 25),
            file_path="uploads/arsip/2026/04/ba_rakor_2026.docx",
            ukuran_file=980000,
            hak_akses="terbatas",
            status_hapus=False,
        ),
        DokumenArsip(
            nama_dokumen="Draft Usulan Rencana Anggaran 2025.xlsx",
            nomor_dokumen="009/DRAFT/KU/2025",
            id_pegawai=p1.id_pegawai,
            kategori="Laporan",
            event="Operasional 2025",
            tanggal_dokumen=date(2025, 9, 1),
            file_path="uploads/arsip/2025/09/draft_anggaran.xlsx",
            ukuran_file=540000,
            hak_akses="internal",
            status_hapus=True,  # IN TRASH
            dihapus_oleh=p2.id_pegawai,
            dihapus_pada=datetime(2025, 9, 10, 14, 30),
        ),
    ]

    for doc in sample_docs:
        session.add(doc)
    await session.commit()
    print("Data seeded successfully!")
    return p1.id_pegawai, p2.id_pegawai

async def run_all():
    async with AsyncSessionLocal() as session:
        p1_id, p2_id = await seed_data(session)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        print("\n========== 1. TEST GET /api/arsip (TANPA FILTER) ==========")
        r = await client.get("/api/arsip/")
        assert r.status_code == 200, f"Expected 200, got {r.status_code} {r.text}"
        data = r.json()
        print(f"Status: {r.status_code}, Active Count: {len(data)}, X-Total-Count: {r.headers.get('x-total-count')}")
        assert len(data) == 4, f"Expected 4 active documents, got {len(data)}"
        for d in data:
            assert d["status_hapus"] is False
            print(f"  - [{d['id_dokumen']}] {d['nomor_dokumen']} | {d['nama_dokumen']} | {d['tanggal_dokumen']} | Uploader: {d['nama_pengunggah']} ({d['nama_bagian']})")

        print("\n========== 2. TEST SATU FILTER: TAHUN (year=2026) ==========")
        r = await client.get("/api/arsip/?year=2026")
        assert r.status_code == 200
        data = r.json()
        print(f"Status: 200, Year 2026 Count: {len(data)}")
        assert len(data) == 2
        for d in data:
            assert d["tanggal_dokumen"].startswith("2026")
            print(f"  - {d['nomor_dokumen']} ({d['tanggal_dokumen']})")

        print("\n========== 3. TEST SATU FILTER: BULAN (month=4) ==========")
        r = await client.get("/api/arsip/?month=4")
        assert r.status_code == 200
        data = r.json()
        print(f"Status: 200, Month 4 Count: {len(data)}")
        assert len(data) == 2
        for d in data:
            print(f"  - {d['nomor_dokumen']} ({d['tanggal_dokumen']})")

        print("\n========== 4. TEST SATU FILTER: EVENT (event=Pemilu 2024) ==========")
        r = await client.get("/api/arsip/?event=Pemilu 2024")
        assert r.status_code == 200
        data = r.json()
        print(f"Status: 200, Event 'Pemilu 2024' Count: {len(data)}")
        assert len(data) == 1
        assert data[0]["event"] == "Pemilu 2024"

        print("\n========== 5. TEST SATU FILTER: KATEGORI (kategori=Surat Keputusan) ==========")
        r = await client.get("/api/arsip/?kategori=Surat Keputusan")
        assert r.status_code == 200
        data = r.json()
        print(f"Status: 200, Kategori 'Surat Keputusan' Count: {len(data)}")
        assert len(data) == 1
        assert data[0]["kategori"] == "Surat Keputusan"

        print("\n========== 6. TEST SATU FILTER: HAK AKSES (hak_akses=publik) ==========")
        r = await client.get("/api/arsip/?hak_akses=publik")
        assert r.status_code == 200
        data = r.json()
        print(f"Status: 200, Hak Akses 'publik' Count: {len(data)}")
        assert len(data) == 2

        print("\n========== 7. TEST KOMBINASI FILTER: year=2026 & month=4 & event=Operasional 2026 ==========")
        r = await client.get("/api/arsip/?year=2026&month=4&event=Operasional 2026")
        assert r.status_code == 200
        data = r.json()
        print(f"Status: 200, Kombinasi Count: {len(data)}")
        assert len(data) == 2
        for d in data:
            assert d["tanggal_dokumen"].startswith("2026-04")
            assert d["event"] == "Operasional 2026"
            print(f"  - {d['nomor_dokumen']} | {d['event']} | {d['tanggal_dokumen']}")

        print("\n========== 8. TEST SEARCH NAMA DOKUMEN & SEARCH NOMOR DOKUMEN ==========")
        r1 = await client.get("/api/arsip/?search=laporan")
        assert r1.status_code == 200
        data1 = r1.json()
        print(f"Search 'laporan' -> Count: {len(data1)}")
        assert len(data1) == 2

        r2 = await client.get("/api/arsip/?search=001/KU")
        assert r2.status_code == 200
        data2 = r2.json()
        print(f"Search '001/KU' -> Count: {len(data2)}")
        assert len(data2) == 1
        assert data2[0]["nomor_dokumen"] == "001/KU/KPU-SU/IV/2026"

        print("\n========== 9. TEST SEARCH + KOMBINASI FILTER ==========")
        r = await client.get("/api/arsip/?search=laporan&year=2026&month=4")
        assert r.status_code == 200
        data = r.json()
        print(f"Search 'laporan' + Year 2026 + Month 4 -> Count: {len(data)}")
        assert len(data) == 1
        assert data[0]["nomor_dokumen"] == "001/KU/KPU-SU/IV/2026"

        print("\n========== 10. TEST HASIL KOSONG (EMPTY RESULT) ==========")
        r = await client.get("/api/arsip/?search=kata_kunci_pasti_tidak_ada_12345")
        assert r.status_code == 200
        data = r.json()
        print(f"Status: {r.status_code}, Empty Result Count: {len(data)}")
        assert len(data) == 0

        print("\n========== 11. TEST INVALID PARAMETERS ==========")
        # Month > 12
        r_inv_month = await client.get("/api/arsip/?month=15")
        print(f"Invalid month=15 -> Status: {r_inv_month.status_code}")
        assert r_inv_month.status_code == 422

        # Year < 1900
        r_inv_year = await client.get("/api/arsip/?year=1800")
        print(f"Invalid year=1800 -> Status: {r_inv_year.status_code}")
        assert r_inv_year.status_code == 422

        # Year not an integer
        r_inv_str = await client.get("/api/arsip/?year=abc")
        print(f"Invalid year='abc' -> Status: {r_inv_str.status_code}")
        assert r_inv_str.status_code == 422

        print("\n========== 12. TEST GET /api/arsip/trash ==========")
        r_trash = await client.get("/api/arsip/trash")
        assert r_trash.status_code == 200
        trash_data = r_trash.json()
        print(f"Status: 200, Trash Count: {len(trash_data)}")
        assert len(trash_data) == 1
        assert trash_data[0]["status_hapus"] is True
        assert trash_data[0]["nama_penghapus"] == "Dewi Kusuma"
        print(f"  - Trash doc: {trash_data[0]['nama_dokumen']} | Dihapus oleh: {trash_data[0]['nama_penghapus']} ({trash_data[0]['dihapus_pada']})")

        print("\n========== 13. TEST GET /api/arsip/filter-options (DATABASE-DRIVEN) ==========")
        r_opt = await client.get("/api/arsip/filter-options")
        assert r_opt.status_code == 200
        opt_data = r_opt.json()
        print("Filter Options retrieved dynamically from MySQL:")
        print(f"  - Years: {opt_data['years']}")
        print(f"  - Months: {opt_data['months']}")
        print(f"  - Events: {opt_data['events']}")
        print(f"  - Categories: {opt_data['kategori']}")
        print(f"  - Hak Akses: {opt_data['hak_akses']}")
        print(f"  - Sub Bagian: {opt_data['sub_bagian']}")
        assert 2026 in opt_data["years"]
        assert 2024 in opt_data["years"]
        assert "Operasional 2026" in opt_data["events"]
        assert "Pilkada 2024" in opt_data["events"]

        print("\n========== 14. TEST CRUD OPERATIONS (POST, GET by ID, PUT, PATCH Delete, PATCH Restore, DELETE Permanent) ==========")
        # 1. POST
        new_doc_payload = {
            "nama_dokumen": "Surat Tugas Monitoring Coklit Pilkada 2026.pdf",
            "nomor_dokumen": "045/ST/KPU-SU/VI/2026",
            "id_pegawai": p1_id,
            "kategori": "Surat Tugas",
            "event": "Pilkada 2026",
            "tanggal_dokumen": "2026-06-01",
            "file_path": "uploads/arsip/2026/06/st_monitoring.pdf",
            "ukuran_file": 1200000,
            "hak_akses": "internal"
        }
        r_post = await client.post("/api/arsip/", json=new_doc_payload)
        assert r_post.status_code == 201
        created_doc = r_post.json()
        doc_id = created_doc["id_dokumen"]
        print(f"POST /api/arsip/ -> Created ID: {doc_id}, Nomor: {created_doc['nomor_dokumen']}")

        # 2. GET by ID
        r_get = await client.get(f"/api/arsip/{doc_id}")
        assert r_get.status_code == 200
        assert r_get.json()["nama_dokumen"] == "Surat Tugas Monitoring Coklit Pilkada 2026.pdf"
        print(f"GET /api/arsip/{doc_id} -> OK")

        # 3. PUT
        r_put = await client.put(f"/api/arsip/{doc_id}", json={"nama_dokumen": "Surat Tugas Monitoring Coklit (Revisi).pdf"})
        assert r_put.status_code == 200
        assert r_put.json()["nama_dokumen"] == "Surat Tugas Monitoring Coklit (Revisi).pdf"
        print(f"PUT /api/arsip/{doc_id} -> Updated name")

        # 4. PATCH Soft Delete
        r_del = await client.patch(f"/api/arsip/{doc_id}/delete?deleted_by={p2_id}")
        assert r_del.status_code == 200
        assert r_del.json()["status_hapus"] is True
        assert r_del.json()["dihapus_oleh"] == p2_id
        print(f"PATCH /api/arsip/{doc_id}/delete -> Moved to Trash")

        # 5. PATCH Restore
        r_rest = await client.patch(f"/api/arsip/{doc_id}/restore")
        assert r_rest.status_code == 200
        assert r_rest.json()["status_hapus"] is False
        assert r_rest.json()["dihapus_oleh"] is None
        print(f"PATCH /api/arsip/{doc_id}/restore -> Restored to Active")

        # 6. DELETE Permanent
        r_perm = await client.delete(f"/api/arsip/{doc_id}/permanent")
        assert r_perm.status_code == 200
        print(f"DELETE /api/arsip/{doc_id}/permanent -> Hard Deleted")

        # Verify 404 after permanent delete
        r_404 = await client.get(f"/api/arsip/{doc_id}")
        assert r_404.status_code == 404
        print(f"GET /api/arsip/{doc_id} after deletion -> 404 Not Found (Correct)")

        print("\n========== ALL API TESTS PASSED PERFECTLY ==========\n")

if __name__ == "__main__":
    asyncio.run(run_all())
