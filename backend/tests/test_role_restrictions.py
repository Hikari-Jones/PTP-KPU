import asyncio
import os
import sys
from datetime import datetime, timezone

# Ensure backend root is on sys.path
sys.path.insert(0, "/app")

from sqlalchemy import select, text
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.models.schema import Base, Pegawai, Bagian, TahunAnggaran, AkunAnggaran, PaguAnggaran, RealisasiAnggaran, RevisiAnggaran
from app.core.passwords import hash_password
from app.api.v1.endpoints.auth import create_access_token
from app.core.auth import is_rendatin_or_keuangan, get_effective_subbagian_id

TEST_DB_NAME = "kpu_disposable_test"
TEST_DB_URL = os.getenv("TEST_DATABASE_URL", f"mysql+aiomysql://root:peklNxhpMxLEyTxmosisVQo701Z1Cx8S@mysql-db:3306/{TEST_DB_NAME}")

async def run_role_restriction_tests():
    print(f"=== Starting Role-Based Access & Isolation Tests on {TEST_DB_NAME} ===")
    engine = create_async_engine(TEST_DB_URL, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with engine.begin() as conn:
        # Re-create tables cleanly in test DB
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

        # 2. Seed Pegawai for each role
        users_to_seed = [
            ("user_admin", 1, "admin", "Admin System"),
            ("user_rendatin", 3, "staff", "Operator Rendatin"),
            ("user_keuangan", 7, "staff", "Operator Keuangan"),
            ("user_teknis", 4, "staff", "Staf Teknis"),
            ("user_hukum", 5, "staff", "Staf Hukum"),
            ("user_sdm", 2, "staff", "Staf SDM"),
            ("user_umlog", 6, "staff", "Staf UMLOG"),
        ]
        pegawai_map = {}
        for nip_sfx, id_b, role, nama in users_to_seed:
            nip_val = f"19900101_{nip_sfx}"
            p = Pegawai(
                nip=nip_val,
                nama=nama,
                jabatan="Staf",
                password=hash_password("Password123!"),
                role=role,
                id_bagian=id_b,
                session_version=1,
                is_active=True
            )
            session.add(p)
            pegawai_map[nip_sfx] = p

        # 3. Seed Tahun Anggaran 2027 Active
        ta2027 = TahunAnggaran(
            tahun=2027,
            status="active",
            tanggal_mulai=datetime(2027, 1, 1).date(),
            tanggal_selesai=datetime(2027, 12, 31).date(),
            deskripsi="Tahun Anggaran 2027",
            id_pegawai_pembuat=1
        )
        session.add(ta2027)
        await session.flush()

        # 4. Seed Akun Anggaran & Pagu Anggaran for Teknis (id_bagian=4) and SDM (id_bagian=2)
        akun_teknis = AkunAnggaran(
            kode_akun="521211",
            nama_akun="Belanja Honorarium Teknis",
            id_bagian=4,
            status="active"
        )
        akun_sdm = AkunAnggaran(
            kode_akun="521212",
            nama_akun="Belanja Honorarium SDM",
            id_bagian=2,
            status="active"
        )
        session.add_all([akun_teknis, akun_sdm])
        await session.flush()

        pagu_teknis = PaguAnggaran(
            id_tahun_anggaran=ta2027.id_tahun_anggaran,
            id_akun_anggaran=akun_teknis.id_akun_anggaran,
            pagu_awal=50000000,
            pagu_aktif=50000000,
            keterangan="Pagu Teknis 2027"
        )
        pagu_sdm = PaguAnggaran(
            id_tahun_anggaran=ta2027.id_tahun_anggaran,
            id_akun_anggaran=akun_sdm.id_akun_anggaran,
            pagu_awal=30000000,
            pagu_aktif=30000000,
            keterangan="Pagu SDM 2027"
        )
        session.add_all([pagu_teknis, pagu_sdm])
        await session.flush()

        # Seed Transaksi Realisasi for Teknis (id_bagian=4) and SDM (id_bagian=2)
        realisasi_teknis = RealisasiAnggaran(
            id_pagu=pagu_teknis.id_pagu,
            id_akun_anggaran=akun_teknis.id_akun_anggaran,
            nomor_dokumen="SPD-001/TEKNIS/2027",
            uraian_kegiatan="Belanja Honor Panitia Teknis",
            jumlah_realisasi=10000000,
            tanggal_transaksi=datetime(2027, 2, 10).date(),
            status="verified",
            periode="Februari 2027",
            id_pegawai=pegawai_map["user_teknis"].id_pegawai
        )
        realisasi_sdm = RealisasiAnggaran(
            id_pagu=pagu_sdm.id_pagu,
            id_akun_anggaran=akun_sdm.id_akun_anggaran,
            nomor_dokumen="SPD-002/SDM/2027",
            uraian_kegiatan="Belanja Honor Pokja SDM",
            jumlah_realisasi=5000000,
            tanggal_transaksi=datetime(2027, 2, 12).date(),
            status="verified",
            periode="Februari 2027",
            id_pegawai=pegawai_map["user_sdm"].id_pegawai
        )
        session.add_all([realisasi_teknis, realisasi_sdm])
        await session.commit()

        # Reload pegawai with id
        for u in pegawai_map.keys():
            res = await session.execute(select(Pegawai).options(selectinload(Pegawai.bagian)).where(Pegawai.nip == f"19900101_{u}"))
            pegawai_map[u] = res.scalar_one()

    print("✓ Test database seeded successfully.")

    # Verification 1: Authorization Helper Tests
    print("\n--- Test Suite 1: Helper is_rendatin_or_keuangan ---")
    assert is_rendatin_or_keuangan(pegawai_map["user_admin"]) is True, "Admin must have financial access"
    assert is_rendatin_or_keuangan(pegawai_map["user_rendatin"]) is True, "RENDATIN must have financial access"
    assert is_rendatin_or_keuangan(pegawai_map["user_keuangan"]) is True, "Keuangan must have financial access"
    assert is_rendatin_or_keuangan(pegawai_map["user_teknis"]) is False, "Teknis must NOT have financial access"
    assert is_rendatin_or_keuangan(pegawai_map["user_hukum"]) is False, "Hukum must NOT have financial access"
    assert is_rendatin_or_keuangan(pegawai_map["user_sdm"]) is False, "SDM must NOT have financial access"
    assert is_rendatin_or_keuangan(pegawai_map["user_umlog"]) is False, "UMLOG must NOT have financial access"
    print("✓ All 7 subbagian role authorization checks passed.")

    # Verification 2: Data Isolation Helper Tests
    print("\n--- Test Suite 2: Helper get_effective_subbagian_id ---")
    # Keuangan/Rendatin can query any subsection or None
    assert get_effective_subbagian_id(pegawai_map["user_keuangan"], None) is None
    assert get_effective_subbagian_id(pegawai_map["user_keuangan"], 4) == 4
    assert get_effective_subbagian_id(pegawai_map["user_rendatin"], 2) == 2

    # Non-Keuangan/Rendatin are locked to their own subsection
    assert get_effective_subbagian_id(pegawai_map["user_teknis"], None) == 4
    assert get_effective_subbagian_id(pegawai_map["user_teknis"], 2) == 4, "Tampering must be overridden to user's id_bagian"
    assert get_effective_subbagian_id(pegawai_map["user_sdm"], 7) == 2, "SDM must be locked to id_bagian=2"
    assert get_effective_subbagian_id(pegawai_map["user_hukum"], 1) == 5, "Hukum must be locked to id_bagian=5"
    print("✓ Query parameter tampering protection verified: subsection locked to authenticated user.")

    # Verification 3: Mock Client API Level Testing
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    import app.main as main_module
    import app.core.database as db_module

    # Override database session for both router endpoints and middleware
    async def override_get_db():
        async with session_factory() as s:
            yield s

    app.dependency_overrides[db_module.get_db] = override_get_db
    original_session_local = db_module.AsyncSessionLocal
    main_module.AsyncSessionLocal = session_factory
    db_module.AsyncSessionLocal = session_factory

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create tokens with required payload: id, sub (nip), sv (session_version)
        def make_token(p: Pegawai):
            return create_access_token({
                "sub": p.nip,
                "id": p.id_pegawai,
                "role": p.role,
                "sv": p.session_version
            })

        token_admin = make_token(pegawai_map["user_admin"])
        token_rendatin = make_token(pegawai_map["user_rendatin"])
        token_keuangan = make_token(pegawai_map["user_keuangan"])
        token_teknis = make_token(pegawai_map["user_teknis"])
        token_sdm = make_token(pegawai_map["user_sdm"])

        h_admin = {"Authorization": f"Bearer {token_admin}"}
        h_rendatin = {"Authorization": f"Bearer {token_rendatin}"}
        h_keuangan = {"Authorization": f"Bearer {token_keuangan}"}
        h_teknis = {"Authorization": f"Bearer {token_teknis}"}
        h_sdm = {"Authorization": f"Bearer {token_sdm}"}

        print("\n--- Test Suite 3: Direct API Access to Restricted Modules ---")
        # Forbidden endpoints for non-RENDATIN/Keuangan:
        # /api/v1/tahun-anggaran
        res = await client.get("/api/v1/tahun-anggaran/", headers=h_teknis)
        assert res.status_code == 403, f"Teknis accessing /tahun-anggaran expected 403, got {res.status_code}"
        res = await client.get("/api/v1/tahun-anggaran/", headers=h_keuangan)
        assert res.status_code == 200, f"Keuangan accessing /tahun-anggaran expected 200, got {res.status_code}"

        # /api/v1/akun-anggaran
        res = await client.get("/api/v1/akun-anggaran/", headers=h_teknis)
        assert res.status_code == 403, f"Teknis accessing /akun-anggaran expected 403, got {res.status_code}"
        res = await client.get("/api/v1/akun-anggaran/", headers=h_rendatin)
        assert res.status_code == 200, f"RENDATIN accessing /akun-anggaran expected 200, got {res.status_code}"

        # /api/v1/realisasi-anggaran
        # Teknis can only read their own realisasi (used for Laporan Bulanan Excel export)
        res = await client.get("/api/v1/realisasi-anggaran/", headers=h_teknis)
        assert res.status_code == 200, f"Teknis accessing /realisasi-anggaran expected 200, got {res.status_code}"
        assert len(res.json()["items"]) == 1, "Teknis must only see their own transactions"
        assert res.json()["items"][0]["nomor_dokumen"] == "SPD-001/TEKNIS/2027"

        # Teknis attempting to query SDM realisasi via ?id_bagian=2
        res = await client.get("/api/v1/realisasi-anggaran/?id_bagian=2", headers=h_teknis)
        assert res.status_code == 200
        assert len(res.json()["items"]) == 1
        assert res.json()["items"][0]["nomor_dokumen"] == "SPD-001/TEKNIS/2027", "Teknis tampering id_bagian must be overridden"

        # Direct access to SDM transaction by ID
        res = await client.get(f"/api/v1/realisasi-anggaran/{realisasi_sdm.id_realisasi}", headers=h_teknis)
        assert res.status_code == 403, f"Teknis accessing SDM realisasi by ID expected 403, got {res.status_code}"

        # Direct access to Teknis transaction by ID
        res = await client.get(f"/api/v1/realisasi-anggaran/{realisasi_teknis.id_realisasi}", headers=h_teknis)
        assert res.status_code == 200, f"Teknis accessing own realisasi by ID expected 200, got {res.status_code}"

        # Keuangan can access all transactions
        res = await client.get("/api/v1/realisasi-anggaran/", headers=h_keuangan)
        assert res.status_code == 200, f"Keuangan accessing /realisasi-anggaran expected 200, got {res.status_code}"
        assert len(res.json()["items"]) == 2, "Keuangan must see all transactions across all subsections"

        # /api/v1/revisi-anggaran
        res = await client.get("/api/v1/revisi-anggaran/", headers=h_teknis)
        assert res.status_code == 403, f"Teknis accessing /revisi-anggaran expected 403, got {res.status_code}"
        print("✓ All restricted endpoints properly block non-RENDATIN/Keuangan with HTTP 403.")

        print("\n--- Test Suite 4: Write Operations Blocked for Restricted Users ---")
        # Attempt to create Pagu by Teknis
        res = await client.post("/api/v1/pagu-anggaran/", headers=h_teknis, json={
            "id_tahun_anggaran": 1,
            "id_akun_anggaran": akun_teknis.id_akun_anggaran,
            "pagu_awal": 100000000
        })
        assert res.status_code == 403, f"Teknis creating pagu expected 403, got {res.status_code}"

        # Attempt to update Pagu by SDM
        res = await client.put(f"/api/v1/pagu-anggaran/{pagu_sdm.id_pagu}", headers=h_sdm, json={
            "pagu_awal": 99999999
        })
        assert res.status_code == 403, f"SDM updating pagu expected 403, got {res.status_code}"

        # Attempt to delete Pagu by Teknis
        res = await client.delete(f"/api/v1/pagu-anggaran/{pagu_teknis.id_pagu}", headers=h_teknis)
        assert res.status_code == 403, f"Teknis deleting pagu expected 403, got {res.status_code}"

        # Attempt to publish monthly report by Teknis
        res = await client.post("/api/v1/anggaran/publish", headers=h_teknis, json={
            "id_tahun_anggaran": 1,
            "periode_bulan": 11,
            "catatan": "Unauthorized publish attempt"
        })
        assert res.status_code == 403, f"Teknis publishing report expected 403, got {res.status_code}"
        print("✓ All write operations (POST, PUT, DELETE, publish) blocked with HTTP 403.")

        print("\n--- Test Suite 5: Data Isolation on Read-Only Endpoints ---")
        # Pagu Anggaran List: Teknis querying all pagu without params
        res = await client.get("/api/v1/pagu-anggaran/", headers=h_teknis)
        assert res.status_code == 200
        data = res.json()
        assert len(data["items"]) == 1, f"Teknis should only see 1 item, got {len(data['items'])}"
        assert data["items"][0]["kode_akun"] == "521211", "Teknis should only see Belanja Teknis"

        # Pagu Anggaran List: Teknis tampering id_bagian=2 (SDM)
        res = await client.get("/api/v1/pagu-anggaran/?id_bagian=2", headers=h_teknis)
        assert res.status_code == 200
        data = res.json()
        assert len(data["items"]) == 1, "Even when requesting id_bagian=2, Teknis must still only receive Teknis pagu"
        assert data["items"][0]["kode_akun"] == "521211"

        # Pagu Anggaran by ID: Teknis accessing SDM pagu directly
        res = await client.get(f"/api/v1/pagu-anggaran/{pagu_sdm.id_pagu}", headers=h_teknis)
        assert res.status_code == 403, f"Teknis accessing SDM pagu by ID expected 403 Forbidden, got {res.status_code}"

        # Pagu Anggaran by ID: Teknis accessing Teknis pagu
        res = await client.get(f"/api/v1/pagu-anggaran/{pagu_teknis.id_pagu}", headers=h_teknis)
        assert res.status_code == 200, f"Teknis accessing own pagu expected 200, got {res.status_code}"

        # RENDATIN querying pagu with id_bagian=2 (SDM)
        res = await client.get("/api/v1/pagu-anggaran/?id_bagian=2", headers=h_rendatin)
        assert res.status_code == 200
        data = res.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["kode_akun"] == "521212", "RENDATIN should be allowed to view SDM pagu"

        print("✓ Data isolation strictly enforced across all read queries & direct ID access.")

    app.dependency_overrides.clear()
    main_module.AsyncSessionLocal = original_session_local
    db_module.AsyncSessionLocal = original_session_local
    await engine.dispose()
    print("\n=======================================================")
    print("ALL ROLE-BASED ACCESS & DATA ISOLATION TESTS PASSED (100%)")
    print("=======================================================")

if __name__ == "__main__":
    asyncio.run(run_role_restriction_tests())
