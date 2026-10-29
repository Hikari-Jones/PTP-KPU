import asyncio
from datetime import date
from decimal import Decimal
import httpx
from sqlalchemy import select, delete

from app.main import app
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

async def cleanup_test_data(session):
    """Clean up all records related to tests."""
    await session.execute(delete(RevisiAnggaran))
    await session.execute(delete(RealisasiAnggaran))
    await session.execute(delete(PaguAnggaran))
    await session.execute(delete(AkunAnggaran).where(AkunAnggaran.kode_akun.like("521%")))
    await session.execute(delete(TahunAnggaran).where(TahunAnggaran.tahun.in_([2026, 2027])))
    await session.execute(delete(Pegawai).where(Pegawai.nip.in_(["99900101", "99900202"])))
    await session.execute(delete(Bagian).where(Bagian.kode_bagian == "BAG-P3"))
    await session.commit()

async def run_phase3_api_tests():
    print("==================================================")
    print("STARTING PHASE 3 AUTOMATED API INTEGRATION TESTS")
    print("==================================================")

    # 1. Seed base Bagian & Pegawai (Operator & Admin Verifier)
    async with AsyncSessionLocal() as session:
        await cleanup_test_data(session)

        bagian = Bagian(kode_bagian="BAG-P3", nama_bagian="Divisi Perencanaan Phase 3")
        session.add(bagian)
        await session.flush()

        operator = Pegawai(
            id_bagian=bagian.id_bagian,
            nama="Operator Phase 3",
            nip="99900101",
            jabatan="Staff Perencanaan",
            password="pwd",
            role="operator",
        )
        admin_verifier = Pegawai(
            id_bagian=bagian.id_bagian,
            nama="Admin Verifier Phase 3",
            nip="99900202",
            jabatan="Kepala Subbagian",
            password="pwd",
            role="admin",
        )
        session.add_all([operator, admin_verifier])
        await session.commit()
        await session.refresh(bagian)
        await session.refresh(operator)
        await session.refresh(admin_verifier)
        
        id_bagian = bagian.id_bagian
        id_op = operator.id_pegawai
        id_ver = admin_verifier.id_pegawai

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        op_headers = {"X-User-Id": str(id_op)}
        admin_headers = {"X-User-Id": str(id_ver)}

        # ----------------------------------------------------------------------
        # Test 1: POST Tahun Anggaran (Admin Success)
        # ----------------------------------------------------------------------
        payload_t2026 = {
            "tahun": 2026,
            "status": "active",
            "tanggal_mulai": "2026-01-01",
            "tanggal_selesai": "2026-12-31",
            "deskripsi": "Tahun Anggaran 2026 APBN",
        }
        res = await client.post("/api/v1/tahun-anggaran/", json=payload_t2026, headers=admin_headers)
        assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.text}"
        data_t2026 = res.json()
        id_tahun_2026 = data_t2026["id_tahun_anggaran"]
        assert data_t2026["tahun"] == 2026
        print(f"[TEST 1 PASSED] POST /tahun-anggaran/ -> 201 Created (ID: {id_tahun_2026})")

        # ----------------------------------------------------------------------
        # Test 2: GET Tahun Anggaran (Filtering & Pagination)
        # ----------------------------------------------------------------------
        res = await client.get("/api/v1/tahun-anggaran/?search=2026&status=active")
        assert res.status_code == 200
        assert "x-total-count" in res.headers
        data_t = res.json()
        items = data_t["items"] if isinstance(data_t, dict) and "items" in data_t else data_t
        assert len(items) >= 1
        assert items[0]["tahun"] == 2026
        print(f"[TEST 2 PASSED] GET /tahun-anggaran/ -> 200 OK (X-Total-Count: {res.headers['x-total-count']})")

        # ----------------------------------------------------------------------
        # Test 3: Duplicate Tahun Anggaran -> 400 Bad Request
        # ----------------------------------------------------------------------
        res = await client.post("/api/v1/tahun-anggaran/", json=payload_t2026, headers=admin_headers)
        assert res.status_code == 400, f"Expected 400, got {res.status_code}: {res.text}"
        print(f"[TEST 3 PASSED] Duplicate Tahun Anggaran rejected with 400: {res.json()['detail']}")

        # ----------------------------------------------------------------------
        # Test 4: POST & GET Akun Anggaran
        # ----------------------------------------------------------------------
        payload_akun = {
            "id_bagian": id_bagian,
            "kode_akun": "521219",
            "nama_akun": "Belanja Non Operasional Lainnya",
            "total_pagu": "50000000.00",
            "jenis_belanja": "Belanja Barang",
            "program": "Program Dukungan Manajemen",
            "sub_program": "Pelaksanaan Kegiatan",
            "status": "active",
        }
        res = await client.post("/api/v1/akun-anggaran/", json=payload_akun, headers=admin_headers)
        assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.text}"
        data_akun = res.json()
        id_akun = data_akun["id_akun_anggaran"]
        assert data_akun["kode_akun"] == "521219"

        # GET Akun with filter
        res_get_akun = await client.get(f"/api/v1/akun-anggaran/?kode_akun=521219&id_bagian={id_bagian}")
        assert res_get_akun.status_code == 200
        akun_json = res_get_akun.json()
        akun_items = akun_json["items"] if isinstance(akun_json, dict) and "items" in akun_json else akun_json
        assert len(akun_items) >= 1
        print(f"[TEST 4 PASSED] POST & GET /akun-anggaran/ -> 201 & 200 OK (ID: {id_akun})")

        # ----------------------------------------------------------------------
        # Test 5: POST Pagu Anggaran
        # ----------------------------------------------------------------------
        payload_pagu = {
            "id_tahun_anggaran": id_tahun_2026,
            "id_akun_anggaran": id_akun,
            "pagu_awal": "100000000.00",
            "pagu_aktif": "100000000.00",
            "nomor_sk": "SK-DIPA-2026/001",
            "tanggal_sk": "2026-01-02",
            "keterangan": "Pagu awal DIPA 2026",
        }
        res = await client.post("/api/v1/pagu-anggaran/", json=payload_pagu, headers=admin_headers)
        assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.text}"
        data_pagu = res.json()
        id_pagu = data_pagu["id_pagu"]
        assert Decimal(data_pagu["pagu_awal"]) == Decimal("100000000.00")
        assert Decimal(data_pagu["sisa_anggaran"]) == Decimal("100000000.00")
        print(f"[TEST 5 PASSED] POST /pagu-anggaran/ -> 201 Created (ID: {id_pagu})")

        # ----------------------------------------------------------------------
        # Test 6: Duplicate Pagu Anggaran -> 400 Bad Request
        # ----------------------------------------------------------------------
        res = await client.post("/api/v1/pagu-anggaran/", json=payload_pagu, headers=admin_headers)
        assert res.status_code == 400
        print(f"[TEST 6 PASSED] Duplicate Pagu rejected with 400: {res.json()['detail']}")

        # ----------------------------------------------------------------------
        # Test 7: GET Pagu Summary
        # ----------------------------------------------------------------------
        res = await client.get(f"/api/v1/pagu-anggaran/{id_pagu}/summary")
        assert res.status_code == 200
        summary_data = res.json()
        assert summary_data["id_pagu"] == id_pagu
        assert Decimal(summary_data["pagu_aktif"]) == Decimal("100000000.00")
        assert Decimal(summary_data["total_realisasi_verified"]) == Decimal("0.00")
        assert summary_data["persentase_serapan"] == 0.0
        print(f"[TEST 7 PASSED] GET /pagu-anggaran/{id_pagu}/summary -> 200 OK (Sisa: {summary_data['sisa_anggaran']})")

        # ----------------------------------------------------------------------
        # Test 8: POST Realisasi Draft
        # ----------------------------------------------------------------------
        payload_realisasi = {
            "id_pagu": id_pagu,
            "tanggal_transaksi": "2026-02-15",
            "nomor_dokumen": "SPM-2026-001",
            "uraian_kegiatan": "Pengadaan Konsumsi Rapat Koordinasi",
            "jumlah_realisasi": "15000000.00",
            "periode": "Triwulan I",
        }
        res = await client.post("/api/v1/realisasi-anggaran/", json=payload_realisasi, headers=op_headers)
        assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.text}"
        data_realisasi = res.json()
        id_realisasi = data_realisasi["id_realisasi"]
        assert data_realisasi["status"] == "draft"
        assert data_realisasi["id_pegawai"] == id_op
        print(f"[TEST 8 PASSED] POST /realisasi-anggaran/ -> 201 Created (ID: {id_realisasi}, Status: draft)")

        # ----------------------------------------------------------------------
        # Test 9: PUT Realisasi Draft
        # ----------------------------------------------------------------------
        update_payload = {
            "jumlah_realisasi": "20000000.00",
            "uraian_kegiatan": "Pengadaan Konsumsi Rapat Koordinasi (Revisi Nominal)",
        }
        res = await client.put(f"/api/v1/realisasi-anggaran/{id_realisasi}", json=update_payload, headers=op_headers)
        assert res.status_code == 200
        assert Decimal(res.json()["jumlah_realisasi"]) == Decimal("20000000.00")
        print(f"[TEST 9 PASSED] PUT /realisasi-anggaran/{id_realisasi} -> 200 OK (Updated to 20,000,000.00)")

        # ----------------------------------------------------------------------
        # Test 10: POST Submit (Draft -> Submitted)
        # ----------------------------------------------------------------------
        res = await client.post(f"/api/v1/realisasi-anggaran/{id_realisasi}/submit", headers=op_headers)
        assert res.status_code == 200
        assert res.json()["status"] == "submitted"
        print(f"[TEST 10 PASSED] POST /realisasi-anggaran/{id_realisasi}/submit -> 200 OK (Status: submitted)")

        # ----------------------------------------------------------------------
        # Test 11: Verify Realisasi (Submitted -> Verified)
        # ----------------------------------------------------------------------
        verify_payload = {
            "catatan_verifikasi": "Dokumen lengkap dan sah sesuai SPJ",
        }
        res = await client.post(f"/api/v1/realisasi-anggaran/{id_realisasi}/verify", json=verify_payload, headers=admin_headers)
        assert res.status_code == 200
        data_ver = res.json()
        assert data_ver["status"] == "verified"
        assert data_ver["id_verifier"] == id_ver
        assert data_ver["verified_at"] is not None

        # Verify budget deduction in summary
        res_sum = await client.get(f"/api/v1/pagu-anggaran/{id_pagu}/summary")
        assert Decimal(res_sum.json()["total_realisasi_verified"]) == Decimal("20000000.00")
        assert Decimal(res_sum.json()["sisa_anggaran"]) == Decimal("80000000.00")
        assert res_sum.json()["persentase_serapan"] == 20.0
        print(f"[TEST 11 PASSED] POST /verify -> 200 OK (Verified by user {id_ver}, Pagu sisa: 80,000,000.00)")

        # ----------------------------------------------------------------------
        # Test 12: Reject Realisasi Flow
        # ----------------------------------------------------------------------
        # Create second draft to test rejection
        p2 = {
            "id_pagu": id_pagu,
            "tanggal_transaksi": "2026-03-01",
            "nomor_dokumen": "SPM-2026-002",
            "uraian_kegiatan": "Belanja Perlengkapan Kantor",
            "jumlah_realisasi": "10000000.00",
        }
        res = await client.post("/api/v1/realisasi-anggaran/", json=p2, headers=op_headers)
        id_r2 = res.json()["id_realisasi"]
        # Submit
        await client.post(f"/api/v1/realisasi-anggaran/{id_r2}/submit", headers=op_headers)
        # Reject with mandatory reason
        reject_payload = {"catatan_verifikasi": "Kuitansi belum bertandatangan PPK"}
        res_reject = await client.post(f"/api/v1/realisasi-anggaran/{id_r2}/reject", json=reject_payload, headers=admin_headers)
        assert res_reject.status_code == 200
        assert res_reject.json()["status"] == "rejected"
        assert res_reject.json()["catatan_verifikasi"] == "Kuitansi belum bertandatangan PPK"
        print(f"[TEST 12 PASSED] POST /reject -> 200 OK (Status: rejected, Note: {res_reject.json()['catatan_verifikasi']})")

        # ----------------------------------------------------------------------
        # Test 13: Invalid State Transition (Draft cannot be directly verified)
        # ----------------------------------------------------------------------
        p3 = {
            "id_pagu": id_pagu,
            "tanggal_transaksi": "2026-03-05",
            "nomor_dokumen": "SPM-2026-003",
            "uraian_kegiatan": "Belanja Langsung Tanpa Submit",
            "jumlah_realisasi": "5000000.00",
        }
        res = await client.post("/api/v1/realisasi-anggaran/", json=p3, headers=op_headers)
        id_r3 = res.json()["id_realisasi"]
        res_invalid_ver = await client.post(f"/api/v1/realisasi-anggaran/{id_r3}/verify", json={"catatan_verifikasi": "ok"}, headers=admin_headers)
        assert res_invalid_ver.status_code == 400
        print(f"[TEST 13 PASSED] Invalid state transition rejected with 400: {res_invalid_ver.json()['detail']}")

        # ----------------------------------------------------------------------
        # Test 14: Overbudget Protection
        # ----------------------------------------------------------------------
        p_over = {
            "id_pagu": id_pagu,
            "tanggal_transaksi": "2026-03-10",
            "nomor_dokumen": "SPM-2026-OVER",
            "uraian_kegiatan": "Transaksi Melebihi Sisa Pagu",
            "jumlah_realisasi": "90000000.00",  # Available is only 80,000,000.00
        }
        res_over = await client.post("/api/v1/realisasi-anggaran/", json=p_over, headers=op_headers)
        id_r_over = res_over.json()["id_realisasi"]
        # Submission should fail because 90M > 80M
        res_sub_over = await client.post(f"/api/v1/realisasi-anggaran/{id_r_over}/submit", headers=op_headers)
        assert res_sub_over.status_code == 400
        print(f"[TEST 14 PASSED] Overbudget submission rejected with 400: {res_sub_over.json()['detail']}")

        # ----------------------------------------------------------------------
        # Test 15: Closed Fiscal Year Protection
        # ----------------------------------------------------------------------
        # Create closed year
        p_closed = {
            "tahun": 2027,
            "status": "closed",
            "tanggal_mulai": "2027-01-01",
            "tanggal_selesai": "2027-12-31",
            "deskripsi": "Tahun Tutup Buku",
        }
        res = await client.post("/api/v1/tahun-anggaran/", json=p_closed, headers=admin_headers)
        id_t_closed = res.json()["id_tahun_anggaran"]

        # Attempt to create pagu in closed year -> rejected
        p_pagu_closed = {
            "id_tahun_anggaran": id_t_closed,
            "id_akun_anggaran": id_akun,
            "pagu_awal": "50000000.00",
        }
        res = await client.post("/api/v1/pagu-anggaran/", json=p_pagu_closed, headers=admin_headers)
        assert res.status_code == 400
        print(f"[TEST 15 PASSED] Closed fiscal year operation rejected with 400: {res.json()['detail']}")

        # ----------------------------------------------------------------------
        # Test 16: Unauthorized / Forbidden Request
        # ----------------------------------------------------------------------
        # Operator cannot create Tahun Anggaran
        p_forbidden = {
            "tahun": 2028,
            "status": "draft",
            "tanggal_mulai": "2028-01-01",
            "tanggal_selesai": "2028-12-31",
        }
        res = await client.post("/api/v1/tahun-anggaran/", json=p_forbidden, headers=op_headers)
        assert res.status_code == 403, f"Expected 403, got {res.status_code}"
        print(f"[TEST 16 PASSED] Non-admin access rejected with 403 Forbidden")

        # ----------------------------------------------------------------------
        # Test 17: Resource Not Found (404)
        # ----------------------------------------------------------------------
        res = await client.get("/api/v1/pagu-anggaran/999999")
        assert res.status_code == 404
        print(f"[TEST 17 PASSED] Non-existent resource returns 404 Not Found")

        # ----------------------------------------------------------------------
        # Test 18: Pagination & Total Count Header
        # ----------------------------------------------------------------------
        res = await client.get("/api/v1/realisasi-anggaran/?skip=0&limit=2")
        assert res.status_code == 200
        assert "x-total-count" in res.headers
        real_json = res.json()
        real_items = real_json["items"] if isinstance(real_json, dict) and "items" in real_json else real_json
        assert len(real_items) <= 2
        print(f"[TEST 18 PASSED] Pagination returns max 2 items, X-Total-Count: {res.headers['x-total-count']}")

        # ----------------------------------------------------------------------
        # Test 19: Filtering Realisasi Anggaran
        # ----------------------------------------------------------------------
        res = await client.get(f"/api/v1/realisasi-anggaran/?status=verified&id_pagu={id_pagu}")
        assert res.status_code == 200
        filter_json = res.json()
        filter_items = filter_json["items"] if isinstance(filter_json, dict) and "items" in filter_json else filter_json
        assert all(item["status"] == "verified" for item in filter_items)
        print(f"[TEST 19 PASSED] Filtering returns verified realization items only")

        # ----------------------------------------------------------------------
        # Test 20: Revision Creation (Atomic Transaction)
        # ----------------------------------------------------------------------
        payload_revisi = {
            "id_pagu": id_pagu,
            "nomor_revisi": "REV/2026/001",
            "tanggal_revisi": "2026-03-20",
            "pagu_baru": "120000000.00",  # Increase from 100M to 120M
            "alasan_revisi": "Penambahan alokasi anggaran logistik operasional",
        }
        res = await client.post("/api/v1/revisi-anggaran/", json=payload_revisi, headers=admin_headers)
        assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.text}"
        data_rev = res.json()
        assert Decimal(data_rev["pagu_sebelum"]) == Decimal("100000000.00")
        assert Decimal(data_rev["pagu_sesudah"]) == Decimal("120000000.00")
        assert Decimal(data_rev["perubahan_netto"]) == Decimal("20000000.00")
        id_revisi = data_rev["id_revisi"]

        # Check that PaguAnggaran.pagu_aktif was atomically updated
        res_pagu_updated = await client.get(f"/api/v1/pagu-anggaran/{id_pagu}")
        assert Decimal(res_pagu_updated.json()["pagu_aktif"]) == Decimal("120000000.00")
        assert Decimal(res_pagu_updated.json()["sisa_anggaran"]) == Decimal("100000000.00")  # 120M - 20M verified
        print(f"[TEST 20 PASSED] Revision atomically increased pagu_aktif to 120,000,000.00 (Sisa: 100,000,000.00)")

        # ----------------------------------------------------------------------
        # Test 21: Revision History Immutability (PUT not allowed)
        # ----------------------------------------------------------------------
        res_put_rev = await client.put(f"/api/v1/revisi-anggaran/{id_revisi}", json={"pagu_baru": "130000000.00"})
        assert res_put_rev.status_code == 405, f"Expected 405 Method Not Allowed, got {res_put_rev.status_code}"
        print(f"[TEST 21 PASSED] PUT /revisi-anggaran/{id_revisi} is blocked with 405 Method Not Allowed")

        # ----------------------------------------------------------------------
        # Test 22: Revision History Immutability (DELETE not allowed)
        # ----------------------------------------------------------------------
        res_del_rev = await client.delete(f"/api/v1/revisi-anggaran/{id_revisi}")
        assert res_del_rev.status_code == 405, f"Expected 405 Method Not Allowed, got {res_del_rev.status_code}"
        print(f"[TEST 22 PASSED] DELETE /revisi-anggaran/{id_revisi} is blocked with 405 Method Not Allowed")

        # ----------------------------------------------------------------------
        # Test 23: Dashboard Summary Macro API
        # ----------------------------------------------------------------------
        res_dash = await client.get(f"/api/v1/anggaran/summary?id_tahun_anggaran={id_tahun_2026}")
        assert res_dash.status_code == 200
        d_data = res_dash.json()
        assert d_data["tahun"] == 2026
        assert Decimal(d_data["total_pagu_aktif"]) == Decimal("120000000.00")
        assert Decimal(d_data["total_realisasi_verified"]) == Decimal("20000000.00")
        assert Decimal(d_data["total_sisa_anggaran"]) == Decimal("100000000.00")
        assert d_data["total_transaksi_verified"] >= 1
        print(f"[TEST 23 PASSED] GET /anggaran/summary -> 200 OK (Macro Total Pagu: {d_data['total_pagu_aktif']}, Verified: {d_data['total_realisasi_verified']})")

    # Cleanup test data after tests complete
    async with AsyncSessionLocal() as session:
        await cleanup_test_data(session)
        print("[CLEANUP] Database cleaned up successfully.")

    print("==================================================")
    print("ALL 23 PHASE 3 API INTEGRATION TESTS PASSED!")
    print("==================================================")

if __name__ == "__main__":
    asyncio.run(run_phase3_api_tests())
