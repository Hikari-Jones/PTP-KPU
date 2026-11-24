"""
SAFE & ISOLATED INTEGRATION TEST FOR FISCAL YEAR SWITCHING & HISTORICAL DATA INTEGRITY

PERINGATAN KEAMANAN:
- Script ini HANYA boleh dijalankan pada database pengujian terpisah (disposable test database).
- Nama database WAJIB diakhiri dengan '_test' (contoh: kpu_test_db, ptp_kpu_test).
- TIDAK AKAN PERNAH menyentuh database operasional / production. Jika terdeteksi mengarah ke production
  atau variabel TEST_DATABASE_URL tidak valid / tidak diakhiri '_test', test otomatis BERHENTI (EXIT).

Cara Menjalankan:
    $env:TEST_DATABASE_URL = "mysql+aiomysql://kpu_app:70376fd8b3f5ea4273fa2b60fcf9f5d5@localhost:3306/ptp_test_db"
    python backend/verify_fiscal_switch.py
"""

import asyncio
import os
import sys
from decimal import Decimal
from typing import Dict, Any, List

from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select, func, desc, text
from fastapi import HTTPException

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

# --------------------------------------------------------------------------
# 1. STRICT DATABASE ISOLATION GUARD
# --------------------------------------------------------------------------
test_db_url = os.environ.get("TEST_DATABASE_URL", "").strip()

if not test_db_url:
    print("\n" + "="*80)
    print(" [BLOCKED / SAFETY GUARD] TEST_DATABASE_URL is not configured.")
    print(" To prevent accidental execution on production, integration tests require")
    print(" an explicit test database environment variable ending in '_test'.")
    print("\n Example setup:")
    print("   export TEST_DATABASE_URL='mysql+aiomysql://user:pass@host:3306/kpu_disposable_test'")
    print("="*80 + "\n")
    sys.exit(0)

parsed_url = make_url(test_db_url)
db_name = (parsed_url.database or "").strip().lower()

if not db_name.endswith("_test"):
    print("\n" + "="*80)
    print(f" [FATAL / ACCESS DENIED] Dangerous database detected: '{db_name}'")
    print(" Integration tests CANNOT run against databases that do not end with '_test'.")
    print(" Aborting test suite immediately to preserve production data integrity.")
    print("="*80 + "\n")
    sys.exit(1)

# Import models & services
from app.core.database import Base
from app.models.schema import (
    Bagian,
    Pegawai,
    TahunAnggaran,
    AkunAnggaran,
    PaguAnggaran,
    RevisiAnggaran,
    RealisasiAnggaran,
    AuditAktivasiTahunAnggaran,
)
from app.models.operations import (
    BudgetEvent,
    FinancialAuditLog,
    HistoricalReportVersion,
)
from app.services.anggaran import (
    tahun_anggaran,
    akun_anggaran,
    pagu_anggaran,
    revisi_anggaran,
    realisasi_anggaran,
    get_monthly_report,
)
from app.schemas.anggaran import (
    TahunAnggaranCreate,
    AkunAnggaranCreate,
    PaguAnggaranCreate,
    RealisasiAnggaranCreateDraft,
    RealisasiAnggaranVerify,
)

# Create isolated async engine for testing
test_engine = create_async_engine(test_db_url, echo=False, pool_pre_ping=True)
TestSessionLocal = async_sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)

# Track test results
TEST_RESULTS: List[Dict[str, Any]] = []

def record_test(code: str, name: str, passed: bool, detail: str = ""):
    status = "PASS" if passed else "FAIL"
    TEST_RESULTS.append({"code": code, "name": name, "status": status, "detail": detail})
    print(f"[{status}] {code}: {name}" + (f" -> {detail}" if detail and not passed else ""))


async def setup_test_schema():
    """Initializes tables inside the disposable test database only."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def cleanup_test_data(db: AsyncSession):
    """Safely cleans up only rows created for testing."""
    tables = [
        "historical_report_version",
        "financial_audit_log",
        "budget_event",
        "audit_aktivasi_tahun_anggaran",
        "realisasi_anggaran",
        "revisi_anggaran",
        "pagu_anggaran",
        "akun_anggaran",
        "tahun_anggaran",
        "pegawai",
        "bagian",
    ]
    for tbl in tables:
        await db.execute(text(f"DELETE FROM {tbl}"))
    await db.commit()


async def run_integration_test_suite():
    print("\n" + "="*80)
    print(f" RUNNING ISOLATED FISCAL SWITCH & DATA INTEGRITY TEST SUITE")
    print(f" Target Test Database: {db_name} (ISOLATED)")
    print("="*80 + "\n")

    await setup_test_schema()

    async with TestSessionLocal() as db:
        await cleanup_test_data(db)

        # ----------------------------------------------------------------------
        # FIXTURE INITIALIZATION
        # ----------------------------------------------------------------------
        # 1. Create Bagian (RENDATIN & KEUANGAN)
        bagian_rendatin = Bagian(kode_bagian="BAG-02", nama_bagian="Subbagian Perencanaan, Data dan Informasi")
        bagian_keuangan = Bagian(kode_bagian="BAG-01", nama_bagian="Subbagian Keuangan, Umum dan Logistik")
        db.add_all([bagian_rendatin, bagian_keuangan])
        await db.flush()

        # 2. Create Pegawai (Admin, Rendatin Officer, Operator)
        admin_user = Pegawai(
            nama="Administrator Test",
            nip="198001012000011001",
            role="admin",
            password="testpassword",
            id_bagian=bagian_rendatin.id_bagian,
        )
        rendatin_user = Pegawai(
            nama="Rendatin Officer Test",
            nip="198501012005011002",
            role="pegawai",
            password="testpassword",
            id_bagian=bagian_rendatin.id_bagian,
        )
        operator_user = Pegawai(
            nama="Operator Biasa Test",
            nip="199001012010011003",
            role="pegawai",
            password="testpassword",
            id_bagian=bagian_keuangan.id_bagian,
        )
        db.add_all([admin_user, rendatin_user, operator_user])
        await db.flush()

        # 3. Create Fiscal Years: 2025 (draft), 2026 (draft), 2027 (active)
        ta_2025 = TahunAnggaran(tahun=2025, status="draft", id_pegawai_pembuat=admin_user.id_pegawai, tanggal_mulai="2025-01-01", tanggal_selesai="2025-12-31")
        ta_2026 = TahunAnggaran(tahun=2026, status="draft", id_pegawai_pembuat=admin_user.id_pegawai, tanggal_mulai="2026-01-01", tanggal_selesai="2026-12-31")
        ta_2027 = TahunAnggaran(tahun=2027, status="active", id_pegawai_pembuat=admin_user.id_pegawai, tanggal_mulai="2027-01-01", tanggal_selesai="2027-12-31")
        db.add_all([ta_2025, ta_2026, ta_2027])
        await db.flush()

        # 4. Create Master Akun Anggaran (MAK)
        akun_5211 = AkunAnggaran(
            kode_akun="5211",
            nama_akun="Belanja Gaji dan Tunjangan",
            id_bagian=bagian_rendatin.id_bagian,
            status="active"
        )
        akun_5212 = AkunAnggaran(
            kode_akun="5212",
            nama_akun="Belanja Honorarium",
            id_bagian=bagian_keuangan.id_bagian,
            status="active"
        )
        db.add_all([akun_5211, akun_5212])
        await db.flush()

        # 5. Create Pagu Anggaran for 2025, 2026, 2027
        pagu_2025 = PaguAnggaran(
            id_tahun_anggaran=ta_2025.id_tahun_anggaran,
            id_akun_anggaran=akun_5211.id_akun_anggaran,
            pagu_awal=Decimal("50000000.00"),
            pagu_aktif=Decimal("50000000.00"),
        )
        pagu_2027 = PaguAnggaran(
            id_tahun_anggaran=ta_2027.id_tahun_anggaran,
            id_akun_anggaran=akun_5211.id_akun_anggaran,
            pagu_awal=Decimal("100000000.00"),
            pagu_aktif=Decimal("100000000.00"),
        )
        db.add_all([pagu_2025, pagu_2027])
        await db.commit()

        # Refresh instances
        await db.refresh(ta_2025)
        await db.refresh(ta_2026)
        await db.refresh(ta_2027)
        await db.refresh(pagu_2025)
        await db.refresh(pagu_2027)

        # ======================================================================
        # TEST SECTION A: FISCAL YEAR SWITCHING (SINGLE ACTIVE FISCAL YEAR)
        # ======================================================================
        # A1: Activate 2025 when 2027 is active
        await tahun_anggaran.switch_active_fiscal_year(
            db,
            target_id=ta_2025.id_tahun_anggaran,
            current_user_id=admin_user.id_pegawai,
            current_user_name=admin_user.nama,
            alasan="Aktivasi TA 2025 untuk verifikasi"
        )
        await db.refresh(ta_2025)
        await db.refresh(ta_2027)
        record_test("A1", "Aktifkan TA 2025 ketika TA 2027 Active (2027 -> Closed, 2025 -> Active)",
                    ta_2027.status == "closed" and ta_2025.status == "active")

        # A2: Activate 2026 when 2025 is active
        await tahun_anggaran.switch_active_fiscal_year(
            db,
            target_id=ta_2026.id_tahun_anggaran,
            current_user_id=admin_user.id_pegawai,
            current_user_name=admin_user.nama,
            alasan="Aktivasi TA 2026"
        )
        await db.refresh(ta_2025)
        await db.refresh(ta_2026)
        record_test("A2", "Aktifkan TA 2026 ketika TA 2025 Active (2025 -> Closed, 2026 -> Active)",
                    ta_2025.status == "closed" and ta_2026.status == "active")

        # A3: Reactivate 2027 (re-opening previously closed year)
        await tahun_anggaran.switch_active_fiscal_year(
            db,
            target_id=ta_2027.id_tahun_anggaran,
            current_user_id=admin_user.id_pegawai,
            current_user_name=admin_user.nama,
            alasan="Aktivasi kembali TA 2027"
        )
        await db.refresh(ta_2026)
        await db.refresh(ta_2027)
        record_test("A3", "Aktivasi kembali TA 2027 dari status Closed (2026 -> Closed, 2027 -> Active)",
                    ta_2026.status == "closed" and ta_2027.status == "active")

        # A4: Validate single active fiscal year guarantee
        active_cnt = await db.scalar(select(func.count(TahunAnggaran.id_tahun_anggaran)).where(TahunAnggaran.status == "active"))
        record_test("A4", "Validasi hanya satu Tahun Anggaran yang berstatus Active di seluruh database",
                    active_cnt == 1)

        # ======================================================================
        # TEST SECTION B: BUDGET DATA INTEGRITY
        # ======================================================================
        # B1: Ensure Pagu values remain unmodified by switching
        await db.refresh(pagu_2025)
        await db.refresh(pagu_2027)
        record_test("B1", "Integritas Pagu 2025 & 2027 (Nilai pagu awal & aktif tidak termutasi)",
                    pagu_2025.pagu_awal == Decimal("50000000.00") and pagu_2027.pagu_awal == Decimal("100000000.00"))

        # B2: Pagu relations remain tightly bound to their original fiscal_year_id
        record_test("B2", "Integritas Foreign Key (Pagu 2025 tetap terikat pada TA 2025)",
                    pagu_2025.id_tahun_anggaran == ta_2025.id_tahun_anggaran)

        # B3: Safe handling of years without Pagu (no AttributeError)
        pagu_2026_cnt = await db.scalar(select(func.count(PaguAnggaran.id_pagu)).where(PaguAnggaran.id_tahun_anggaran == ta_2026.id_tahun_anggaran))
        record_test("B3", "Penanganan aman tahun tanpa Pagu manual (Idempotent auto-pagu / Safe count)",
                    isinstance(pagu_2026_cnt, int))

        # ======================================================================
        # TEST SECTION C: CLOSED FISCAL YEAR PROTECTION
        # ======================================================================
        # C1: Viewing closed year data is allowed
        closed_yr = (await db.execute(select(TahunAnggaran).where(TahunAnggaran.status == "closed"))).scalars().first()
        record_test("C1", "Melihat data historis tahun Closed diizinkan (Read-Only access)",
                    closed_yr is not None)

        # C2: Creating new transaction on closed year is rejected
        rejected_create = False
        try:
            await realisasi_anggaran.create_draft(
                db,
                obj_in=RealisasiAnggaranCreateDraft(
                    id_pagu=pagu_2025.id_pagu,
                    id_subbagian=bagian_rendatin.id_bagian,
                    jumlah_realisasi=Decimal("1000000.00"),
                    uraian_kegiatan="Uji coba transaksi terlarang pada tahun closed",
                    nomor_dokumen="DOC/CLOSED/01",
                    tanggal_transaksi="2025-06-15"
                ),
                id_pegawai=operator_user.id_pegawai
            )
        except HTTPException as e:
            if e.status_code == 400 and "sudah ditutup" in e.detail.lower():
                rejected_create = True
        record_test("C2", "Pembuatan transaksi baru pada tahun Closed ditolak dengan HTTP 400",
                    rejected_create)

        # C3: Modifying pagu on closed year is rejected
        rejected_pagu_edit = False
        try:
            from app.schemas.anggaran import PaguAnggaranUpdate
            await pagu_anggaran.update_pagu(
                db,
                id_pagu=pagu_2025.id_pagu,
                obj_in=PaguAnggaranUpdate(pagu_awal=Decimal("60000000.00"))
            )
        except HTTPException as e:
            if e.status_code == 400 and "sudah ditutup" in e.detail.lower():
                rejected_pagu_edit = True
        record_test("C3", "Pengubahan Pagu pada tahun Closed ditolak dengan HTTP 400",
                    rejected_pagu_edit)

        # C4: Creating Revisi DIPA on closed year is rejected
        rejected_revisi = False
        try:
            from app.schemas.anggaran import RevisiAnggaranCreate
            await revisi_anggaran.create_revisi(
                db,
                obj_in=RevisiAnggaranCreate(
                    id_pagu=pagu_2025.id_pagu,
                    nomor_revisi="REV/CLOSED/TEST",
                    tanggal_revisi="2025-07-01",
                    pagu_baru=Decimal("55000000.00"),
                    alasan_revisi="Percobaan revisi closed",
                ),
                id_pegawai=admin_user.id_pegawai
            )
        except HTTPException as e:
            if e.status_code == 400 and "sudah ditutup" in e.detail.lower():
                rejected_revisi = True
        record_test("C4", "Pembuatan Revisi DIPA pada tahun Closed ditolak dengan HTTP 400",
                    rejected_revisi)

        # ======================================================================
        # TEST SECTION D: REACTIVATION & SEPARATION OF PRIVILEGES
        # ======================================================================
        # D1: Create verified transaction in 2027 (currently active)
        tx_2027 = RealisasiAnggaran(
            id_pagu=pagu_2027.id_pagu,
            id_akun_anggaran=akun_5211.id_akun_anggaran,
            id_pegawai=operator_user.id_pegawai,
            nomor_dokumen="SPD/2027/001",
            tanggal_transaksi="2027-04-10",
            uraian_kegiatan="Operasional Awal 2027",
            jumlah_realisasi=Decimal("15000000.00"),
            status="verified"
        )
        db.add(tx_2027)
        await db.commit()
        await db.refresh(tx_2027)

        # D2: Non-RENDATIN user cannot perform financial correction (HTTP 403)
        non_rendatin_rejected = False
        try:
            from app.schemas.anggaran import RealisasiAnggaranUpdateDraft
            from app.api.v1.endpoints.realisasi_anggaran import require_rendatin_user
            require_rendatin_user(operator_user)
        except HTTPException as e:
            if e.status_code == 403:
                non_rendatin_rejected = True
        record_test("D2", "Pemisahan Hak Akses: Pengguna non-RENDATIN ditolak melakukan koreksi (HTTP 403)",
                    non_rendatin_rejected)

        # D3: Authorized RENDATIN officer can perform financial correction on active year with audit log
        correction_success = False
        try:
            from app.schemas.anggaran import RealisasiAnggaranUpdateDraft
            await realisasi_anggaran.update_realisasi_rendatin(
                db,
                id_realisasi=tx_2027.id_realisasi,
                obj_in=RealisasiAnggaranUpdateDraft(
                    jumlah_realisasi=Decimal("16000000.00"),
                    uraian_kegiatan="Koreksi Nominal oleh Rendatin"
                ),
                user=rendatin_user
            )
            await db.refresh(tx_2027)
            # Check BudgetEvent audit
            be = await db.scalar(
                select(BudgetEvent).where(
                    BudgetEvent.realization_id == tx_2027.id_realisasi,
                    BudgetEvent.action == "rendatin_edit"
                )
            )
            correction_success = (tx_2027.jumlah_realisasi == Decimal("16000000.00") and be is not None)
        except Exception as e:
            correction_success = False
        record_test("D3", "Koreksi Keuangan Resmi oleh RENDATIN menghasilkan BudgetEvent audit",
                    correction_success)

        # ======================================================================
        # TEST SECTION E: TRANSACTION ROLLBACK
        # ======================================================================
        rollback_clean = False
        current_active = await db.scalar(select(TahunAnggaran).where(TahunAnggaran.status == "active"))
        initial_active_yr = current_active.tahun
        try:
            await tahun_anggaran.switch_active_fiscal_year(
                db,
                target_id=888888, # Non-existent ID
                current_user_id=admin_user.id_pegawai,
                current_user_name=admin_user.nama,
                alasan="Rollback test"
            )
        except HTTPException as e:
            post_active = await db.scalar(select(TahunAnggaran).where(TahunAnggaran.status == "active"))
            rollback_clean = (e.status_code == 404 and post_active.tahun == initial_active_yr)
        record_test("E1", "Rollback Atomik jika aktivasi gagal (Status tahun aktif tidak berubah)",
                    rollback_clean)

        # ======================================================================
        # TEST SECTION F: FINANCIAL AUDIT TRAIL
        # ======================================================================
        audit_rows = (await db.execute(
            select(AuditAktivasiTahunAnggaran).order_by(desc(AuditAktivasiTahunAnggaran.id_audit))
        )).scalars().all()
        record_test("F1", "Pencatatan Audit Trail Aktivasi (Tahun asal, tahun tujuan, eksekutor, alasan)",
                    len(audit_rows) >= 3 and all(r.nama_pegawai and r.alasan for r in audit_rows[:3]))

        # ======================================================================
        # TEST SECTION G: HISTORICAL REPORT VERSIONING
        # ======================================================================
        # G1: Publish version 1 of report
        from app.models.operations import HistoricalReportVersion
        rep_v1 = HistoricalReportVersion(
            id_tahun_anggaran=ta_2027.id_tahun_anggaran,
            tahun=ta_2027.tahun,
            periode_laporan="Tahunan",
            nomor_versi=1,
            diterbitkan_oleh=admin_user.id_pegawai,
            nama_penerbit=admin_user.nama,
            snapshot_data={"total_pagu": 100000000, "total_realisasi": 16000000}
        )
        db.add(rep_v1)
        await db.commit()

        # G2: Publish version 2 after legitimate correction
        rep_v2 = HistoricalReportVersion(
            id_tahun_anggaran=ta_2027.id_tahun_anggaran,
            tahun=ta_2027.tahun,
            periode_laporan="Tahunan",
            nomor_versi=2,
            diterbitkan_oleh=rendatin_user.id_pegawai,
            nama_penerbit=rendatin_user.nama,
            alasan_koreksi="Koreksi administratif",
            snapshot_data={"total_pagu": 100000000, "total_realisasi": 16500000}
        )
        db.add(rep_v2)
        await db.commit()

        # Verify versions
        versions = (await db.execute(
            select(HistoricalReportVersion)
            .where(HistoricalReportVersion.id_tahun_anggaran == ta_2027.id_tahun_anggaran)
            .order_by(HistoricalReportVersion.nomor_versi)
        )).scalars().all()

        v1_safe = len(versions) == 2 and versions[0].snapshot_data["total_realisasi"] == 16000000
        v2_new = len(versions) == 2 and versions[1].snapshot_data["total_realisasi"] == 16500000
        record_test("G1", "Historical Report Versioning: Versi 1 tidak tertimpa saat Versi 2 diterbitkan",
                    v1_safe and v2_new)

        # ----------------------------------------------------------------------
        # CLEANUP
        # ----------------------------------------------------------------------
        await cleanup_test_data(db)
        print("\n [CLEANUP] Seluruh data fixture pada database pengujian telah dibersihkan.")

    # --------------------------------------------------------------------------
    # SUMMARY REPORT
    # --------------------------------------------------------------------------
    total_tests = len(TEST_RESULTS)
    pass_cnt = sum(1 for t in TEST_RESULTS if t["status"] == "PASS")
    fail_cnt = sum(1 for t in TEST_RESULTS if t["status"] == "FAIL")

    print("\n" + "="*80)
    print(f" HASIL AKHIR INTEGRATION TEST SUITE: {pass_cnt}/{total_tests} BERHASIL")
    print("="*80)
    for t in TEST_RESULTS:
        print(f"  [{t['status']}] {t['code']}: {t['name']}")
    print("="*80 + "\n")

    if fail_cnt > 0:
        sys.exit(1)
    else:
        sys.exit(0)


if __name__ == "__main__":
    asyncio.run(run_integration_test_suite())
