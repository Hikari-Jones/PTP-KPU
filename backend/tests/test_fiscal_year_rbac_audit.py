import asyncio
import os
import sys
from datetime import datetime

# Ensure backend root is on sys.path
sys.path.insert(0, "/app")

from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.models.schema import Base, Pegawai, Bagian, TahunAnggaran, AkunAnggaran, PaguAnggaran, RealisasiAnggaran
from app.core.passwords import hash_password
from app.api.v1.endpoints.auth import create_access_token
from app.core.auth import is_rendatin_or_keuangan, get_effective_subbagian_id

TEST_DB_NAME = "kpu_disposable_test"
TEST_DB_URL = os.getenv("TEST_DATABASE_URL", f"mysql+aiomysql://root:peklNxhpMxLEyTxmosisVQo701Z1Cx8S@mysql-db:3306/{TEST_DB_NAME}")

async def run_audit_and_rbac_integration_tests():
    print(f"=== Starting Comprehensive Multi-Account & Active Year Tests on {TEST_DB_NAME} ===")
    engine = create_async_engine(TEST_DB_URL, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with session_factory() as session:
        # 1. Seed Subbagian
        subbag_data = [
            (1, "ADMIN", "Administrasi Sistem"),
            (2, "BAG-01", "Subbagian SDM dan Partisipasi Masyarakat"),
            (3, "BAG-02", "Subbagian RENDATIN"),
            (4, "BAG-03", "Subbagian Teknis Penyelenggaraan Pemilu"),
            (5, "BAG-04", "Subbagian Hukum dan Pengawasan"),
            (6, "BAG-05", "Subbagian Umum dan Logistik"),
            (7, "BAG-06", "Subbagian Keuangan"),
        ]
        for id_b, kode, nama in subbag_data:
            session.add(Bagian(id_bagian=id_b, kode_bagian=kode, nama_bagian=nama))

        # 2. Seed Users across all roles, including Kabag with role 'admin'
        users_to_seed = [
            ("admin_system", 1, "admin", "Administrator Sistem"),
            ("rendatin", 3, "admin", "Operator RENDATIN"),
            ("keuangan", 7, "admin", "Operator Keuangan"),
            ("kabag_sdm", 2, "admin", "Kepala Bagian SDM"),
            ("operator_sdm", 2, "operator", "Staf SDM"),
            ("kabag_teknis", 4, "admin", "Kepala Bagian Teknis"),
            ("kabag_hukum", 5, "admin", "Kepala Bagian Hukum"),
            ("kabag_umlog", 6, "admin", "Kepala Bagian UMLOG"),
        ]
        pegawai_map = {}
        for nip_sfx, id_b, role, nama in users_to_seed:
            nip_val = f"19900101_{nip_sfx}"
            p = Pegawai(
                nip=nip_val,
                nama=nama,
                jabatan=nama,
                password=hash_password("Password123!"),
                role=role,
                id_bagian=id_b,
                session_version=1,
                is_active=True
            )
            session.add(p)
            pegawai_map[nip_sfx] = p

        # 3. Seed Fiscal Years: 2025 (Active), 2026 (Closed), 2027 (Closed)
        ta2025 = TahunAnggaran(
            tahun=2025,
            status="active",
            tanggal_mulai=datetime(2025, 1, 1).date(),
            tanggal_selesai=datetime(2025, 12, 31).date(),
            deskripsi="Tahun Anggaran 2025 (Aktif)",
            id_pegawai_pembuat=1
        )
        ta2026 = TahunAnggaran(
            tahun=2026,
            status="closed",
            tanggal_mulai=datetime(2026, 1, 1).date(),
            tanggal_selesai=datetime(2026, 12, 31).date(),
            deskripsi="Tahun Anggaran 2026 (Closed)",
            id_pegawai_pembuat=1
        )
        ta2027 = TahunAnggaran(
            tahun=2027,
            status="closed",
            tanggal_mulai=datetime(2027, 1, 1).date(),
            tanggal_selesai=datetime(2027, 12, 31).date(),
            deskripsi="Tahun Anggaran 2027 (Closed)",
            id_pegawai_pembuat=1
        )
        session.add_all([ta2025, ta2026, ta2027])
        await session.flush()

        # 4. Seed Akun Anggaran
        akun_teknis = AkunAnggaran(kode_akun="521211", nama_akun="Belanja Teknis", id_bagian=4, status="active")
        akun_sdm = AkunAnggaran(kode_akun="521212", nama_akun="Belanja SDM", id_bagian=2, status="active")
        session.add_all([akun_teknis, akun_sdm])
        await session.flush()

        # 5. Seed Pagu for TA 2025, 2026, 2027
        # Pagu SDM 2025, 2026
        pagu_sdm_2025 = PaguAnggaran(id_tahun_anggaran=ta2025.id_tahun_anggaran, id_akun_anggaran=akun_sdm.id_akun_anggaran, pagu_awal=30000000, pagu_aktif=30000000)
        pagu_sdm_2026 = PaguAnggaran(id_tahun_anggaran=ta2026.id_tahun_anggaran, id_akun_anggaran=akun_sdm.id_akun_anggaran, pagu_awal=35000000, pagu_aktif=35000000)
        # Pagu Teknis 2025, 2026
        pagu_teknis_2025 = PaguAnggaran(id_tahun_anggaran=ta2025.id_tahun_anggaran, id_akun_anggaran=akun_teknis.id_akun_anggaran, pagu_awal=50000000, pagu_aktif=50000000)
        pagu_teknis_2026 = PaguAnggaran(id_tahun_anggaran=ta2026.id_tahun_anggaran, id_akun_anggaran=akun_teknis.id_akun_anggaran, pagu_awal=55000000, pagu_aktif=55000000)
        session.add_all([pagu_sdm_2025, pagu_sdm_2026, pagu_teknis_2025, pagu_teknis_2026])
        await session.flush()

        # Seed Transaksi Realisasi for TA 2025
        rel_teknis = RealisasiAnggaran(
            id_pagu=pagu_teknis_2025.id_pagu,
            id_akun_anggaran=akun_teknis.id_akun_anggaran,
            nomor_dokumen="SPD-001/TEKNIS/2025",
            uraian_kegiatan="Belanja Honor Teknis",
            jumlah_realisasi=10000000,
            tanggal_transaksi=datetime(2025, 3, 10).date(),
            status="verified",
            periode="Maret 2025",
            id_pegawai=pegawai_map["kabag_teknis"].id_pegawai
        )
        session.add(rel_teknis)
        await session.commit()

        # Reload pegawai with relations
        for u in pegawai_map.keys():
            res = await session.execute(select(Pegawai).options(selectinload(Pegawai.bagian)).where(Pegawai.nip == f"19900101_{u}"))
            pegawai_map[u] = res.scalar_one()

    print("✓ Test database seeded successfully.")

    # API Client Testing
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    import app.main as main_module
    import app.core.database as db_module

    async def override_get_db():
        async with session_factory() as s:
            yield s

    app.dependency_overrides[db_module.get_db] = override_get_db
    original_session_local = db_module.AsyncSessionLocal
    main_module.AsyncSessionLocal = session_factory
    db_module.AsyncSessionLocal = session_factory

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        def make_token(p: Pegawai):
            return create_access_token({
                "sub": p.nip,
                "id": p.id_pegawai,
                "role": p.role,
                "sv": p.session_version
            })

        tokens = {k: make_token(v) for k, v in pegawai_map.items()}
        headers = {k: {"Authorization": f"Bearer {v}"} for k, v in tokens.items()}

        # -------------------------------------------------------------
        # TEST GROUP A: Global Active Fiscal Year Endpoint & Consistency
        # -------------------------------------------------------------
        print("\n--- Test Group A: Global Active Fiscal Year Endpoint ---")
        for user_key in ["admin_system", "rendatin", "keuangan", "kabag_sdm", "operator_sdm", "kabag_teknis", "kabag_hukum", "kabag_umlog"]:
            res = await client.get("/api/v1/tahun-anggaran/active", headers=headers[user_key])
            assert res.status_code == 200, f"{user_key} accessing /active expected 200, got {res.status_code}"
            data = res.json()
            assert data["tahun"] == 2025, f"{user_key} expected TA 2025, got {data['tahun']}"
            assert data["status"] == "active", f"{user_key} expected status active, got {data['status']}"
            assert data["id_tahun_anggaran"] == ta2025.id_tahun_anggaran, f"All users must receive the exact same active fiscal year ID"
        print("✓ All 8 accounts successfully read the single globally active fiscal year (TA 2025).")

        # -------------------------------------------------------------
        # TEST GROUP B: Master Fiscal Year Read Access & Mutation Guard
        # -------------------------------------------------------------
        print("\n--- Test Group B: Fiscal Year Read Access & Mutation Guard ---")
        # All users can now read /tahun-anggaran/ list
        for user_key in ["kabag_sdm", "operator_sdm", "kabag_teknis", "kabag_hukum", "kabag_umlog"]:
            res = await client.get("/api/v1/tahun-anggaran/", headers=headers[user_key])
            assert res.status_code == 200, f"{user_key} reading /tahun-anggaran expected 200, got {res.status_code}"
            assert len(res.json()["items"]) == 3, f"{user_key} expected 3 fiscal years in list"

        # Mutation attempts by non-authorized (Kabag SDM, Operator SDM, Kabag Teknis) MUST return 403
        for unauthorized in ["kabag_sdm", "operator_sdm", "kabag_teknis"]:
            res_post = await client.post("/api/v1/tahun-anggaran/", headers=headers[unauthorized], json={
                "tahun": 2028, "tanggal_mulai": "2028-01-01", "tanggal_selesai": "2028-12-31"
            })
            assert res_post.status_code == 403, f"{unauthorized} creating TA expected 403, got {res_post.status_code}"

            res_act = await client.post(f"/api/v1/tahun-anggaran/{ta2026.id_tahun_anggaran}/activate", headers=headers[unauthorized], json={"alasan": "Hacking"})
            assert res_act.status_code == 403, f"{unauthorized} activating TA expected 403, got {res_act.status_code}"
        print("✓ Read access permitted for all, mutation strictly protected with HTTP 403.")

        # -------------------------------------------------------------
        # TEST GROUP C: Pagu Anggaran Default Resolution & Isolation
        # -------------------------------------------------------------
        print("\n--- Test Group C: Pagu Default Resolution & Data Isolation ---")
        # When id_tahun_anggaran is omitted, backend MUST automatically lock to active year (2025)
        # SDM querying without year parameter:
        res_sdm_default = await client.get("/api/v1/pagu-anggaran/", headers=headers["kabag_sdm"])
        assert res_sdm_default.status_code == 200
        sdm_items = res_sdm_default.json()["items"]
        assert len(sdm_items) == 1, f"SDM expected only 1 pagu record for active TA 2025, got {len(sdm_items)}"
        assert sdm_items[0]["tahun"] == 2025, f"Default pagu must belong to TA 2025, got {sdm_items[0]['tahun']}"
        assert sdm_items[0]["kode_akun"] == "521212", "SDM must only see their own MAK"

        # Teknis querying without year parameter:
        res_tek_default = await client.get("/api/v1/pagu-anggaran/", headers=headers["kabag_teknis"])
        assert res_tek_default.status_code == 200
        tek_items = res_tek_default.json()["items"]
        assert len(tek_items) == 1
        assert tek_items[0]["tahun"] == 2025
        assert tek_items[0]["kode_akun"] == "521211"

        # Explicit historical year selection (e.g. TA 2026)
        res_sdm_2026 = await client.get(f"/api/v1/pagu-anggaran/?id_tahun_anggaran={ta2026.id_tahun_anggaran}", headers=headers["kabag_sdm"])
        assert res_sdm_2026.status_code == 200
        assert len(res_sdm_2026.json()["items"]) == 1
        assert res_sdm_2026.json()["items"][0]["tahun"] == 2026
        print("✓ Omitted year parameter resolves to active year; explicit historical parameter works cleanly.")

        # -------------------------------------------------------------
        # TEST GROUP D: Kabag with Role Admin Remains Read-Only
        # -------------------------------------------------------------
        print("\n--- Test Group D: Kabag Role Admin Verification ---")
        # Kabag SDM attempting to create pagu
        res_pagu_create = await client.post("/api/v1/pagu-anggaran/", headers=headers["kabag_sdm"], json={
            "id_tahun_anggaran": ta2025.id_tahun_anggaran,
            "id_akun_anggaran": akun_sdm.id_akun_anggaran,
            "pagu_awal": 90000000
        })
        assert res_pagu_create.status_code == 403, f"Kabag SDM creating pagu expected 403, got {res_pagu_create.status_code}"

        # Kabag Teknis attempting to publish report
        res_publish = await client.post("/api/v1/anggaran/publish", headers=headers["kabag_teknis"], json={
            "id_tahun_anggaran": ta2025.id_tahun_anggaran,
            "periode_bulan": 11
        })
        assert res_publish.status_code == 403, f"Kabag Teknis publishing report expected 403, got {res_publish.status_code}"
        print("✓ Kabag with role admin in non-RENDATIN/Keuangan subsections strictly enforced as Read-Only.")

    app.dependency_overrides.clear()
    main_module.AsyncSessionLocal = original_session_local
    db_module.AsyncSessionLocal = original_session_local
    await engine.dispose()
    print("\n===================================================================")
    print("ALL GLOBAL ACTIVE FISCAL YEAR & RBAC INTEGRATION TESTS PASSED (100%)")
    print("===================================================================")

if __name__ == "__main__":
    asyncio.run(run_audit_and_rbac_integration_tests())
