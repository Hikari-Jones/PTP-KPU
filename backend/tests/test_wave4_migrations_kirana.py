"""Wave 4 verification tests: idempotent live schema upgrades and KIRANA 4-tier SKKAAD / governance scoping."""
import os
import unittest
from types import SimpleNamespace

os.environ.setdefault("SECRET_KEY", "unit-test-only-secret-not-for-production-12345")

from sqlalchemy import inspect, text
from sqlalchemy.dialects.mysql import LONGTEXT
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.pool import StaticPool


@compiles(LONGTEXT, "sqlite")
def _compile_longtext_sqlite(element, compiler, **kw):
    return "TEXT"


import app.models  # noqa: F401
from app.core.database import Base
from app.services import kirana_db
from upgrade_operations import TABLE_COLUMN_UPGRADES, apply_schema_upgrades


class Wave4MigrationsAndKiranaTests(unittest.IsolatedAsyncioTestCase):
    async def test_upgrade_operations_adds_all_wave1_to_wave3_columns_and_tables_idempotently(self):
        """Simulate a pre-Wave1 database and verify apply_schema_upgrades adds every new table & column cleanly."""
        engine = create_async_engine(
            "sqlite+aiosqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        try:
            async with engine.begin() as conn:
                # Minimal pre-Wave1 core tables missing all Wave 1-3 additive columns
                await conn.execute(text("CREATE TABLE pegawai (id_pegawai INTEGER PRIMARY KEY, nip VARCHAR(50), nama VARCHAR(100))"))
                await conn.execute(text("CREATE TABLE workflow_letter (id INTEGER PRIMARY KEY, kind VARCHAR(20), subject VARCHAR(255))"))
                await conn.execute(text("CREATE TABLE surat_keluar (id_surat_keluar INTEGER PRIMARY KEY, perihal TEXT)"))
                await conn.execute(text("CREATE TABLE surat_tugas (id_surat_tugas INTEGER PRIMARY KEY, nomor_tugas VARCHAR(100))"))
                await conn.execute(text("CREATE TABLE pagu_anggaran (id_pagu INTEGER PRIMARY KEY, pagu_aktif DECIMAL(18,2))"))
                await conn.execute(text("CREATE TABLE revisi_anggaran (id_revisi INTEGER PRIMARY KEY, nomor_revisi VARCHAR(100))"))
                await conn.execute(text("CREATE TABLE realisasi_anggaran (id_realisasi INTEGER PRIMARY KEY, jumlah_realisasi DECIMAL(18,2))"))
                await conn.execute(text("CREATE TABLE file_record (id_file INTEGER PRIMARY KEY, original_name VARCHAR(255))"))
                await conn.execute(text("CREATE TABLE dokumen_arsip (id_dokumen INTEGER PRIMARY KEY, id_klasifikasi INT NULL, nama_dokumen VARCHAR(255))"))
                await conn.execute(text("CREATE TABLE tahun_anggaran (id_tahun_anggaran INTEGER PRIMARY KEY, tahun INT, status VARCHAR(30))"))
                await conn.execute(text("INSERT INTO tahun_anggaran (id_tahun_anggaran, tahun, status) VALUES (1, 2026, 'aktif')"))

                # Run upgrade TWICE to guarantee strict idempotency
                await apply_schema_upgrades(conn)
                await apply_schema_upgrades(conn)

                # Verify every table in Base.metadata exists
                tables = set(await conn.run_sync(lambda c: inspect(c).get_table_names()))
                for required_tbl in ("authority_grant", "arsip_access_grant", "arsip_audit_log", "arsip_penyusutan"):
                    self.assertIn(required_tbl, tables, f"Missing new table: {required_tbl}")

                # Verify every Wave 1-3 column in TABLE_COLUMN_UPGRADES exists
                for tbl, specs in TABLE_COLUMN_UPGRADES.items():
                    cols = await conn.run_sync(lambda c, t=tbl: {col["name"] for col in inspect(c).get_columns(t)})
                    for col_name, _, _ in specs:
                        self.assertIn(col_name, cols, f"Missing column {tbl}.{col_name}")

                # Verify Indonesian fiscal year status normalized
                st = (await conn.execute(text("SELECT status FROM tahun_anggaran WHERE id_tahun_anggaran = 1"))).scalar_one()
                self.assertEqual(st, "active")
        finally:
            await engine.dispose()

    def test_kirana_blocks_governance_tables_sensitive_columns_and_enforces_skkaad(self):
        user = SimpleNamespace(
            id_pegawai=42,
            id_bagian=3,
            role="Pegawai",
            bagian=SimpleNamespace(kode_bagian="BAG-03", nama_bagian="Subbagian Teknis"),
        )

        # Governance & audit tables MUST be rejected by KIRANA
        for secret_tbl in ("authority_grant", "arsip_access_grant", "arsip_audit_log", "arsip_penyusutan", "financial_audit_log"):
            with self.assertRaises(kirana_db.QueryRejected):
                kirana_db.validate_sql(f"SELECT * FROM {secret_tbl}", user=user)

        # Blocked columns MUST be rejected
        for col in ("extracted_text", "participant_tokens", "legal_hold_alasan", "password"):
            with self.assertRaises(kirana_db.QueryRejected):
                kirana_db.validate_sql(f"SELECT {col} FROM dokumen_arsip", user=user)

        # dokumen_arsip scoping must NOT expose rahasia/sangat_rahasia owned by others
        arsip_sql = kirana_db._scoped_relation("dokumen_arsip", user)
        self.assertIn("hak_akses IN ('biasa', 'internal', 'publik')", arsip_sql)
        self.assertIn("id_pegawai = 42", arsip_sql)
        self.assertNotIn("'rahasia'", arsip_sql)
        self.assertNotIn("'sangat_rahasia'", arsip_sql)
        self.assertNotIn("extracted_text", arsip_sql)

        # workflow_letter scoping must include participant_tokens for reassigned letters
        wl_sql = kirana_db._scoped_relation("workflow_letter", user)
        self.assertIn("participant_tokens LIKE '%,42,%'", wl_sql)

        # Safe new Wave 2/3 columns must be queryable
        safe_q = kirana_db.validate_sql(
            "SELECT pagu_aktif, pagu_blokir FROM pagu_anggaran WHERE tahun = 2026",
            user=user,
        )
        self.assertIn("pagu_blokir", safe_q)

    async def test_unit_bagian_options_auto_seeds_official_subbagian_on_fresh_db(self):
        """Fresh DB containing only ADMIN still populates all 3 Unit Bagian x 2 Subbagian for Sign Up."""
        from sqlalchemy.ext.asyncio import async_sessionmaker
        from app.models.schema import Bagian
        from app.services.account_requests import get_unit_bagian_options

        engine = create_async_engine(
            "sqlite+aiosqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Bagian.__table__.create)
            Session = async_sessionmaker(engine, expire_on_commit=False)
            async with Session() as session:
                session.add(Bagian(kode_bagian="ADMIN", nama_bagian="Administrasi Sistem"))
                await session.commit()

                options = await get_unit_bagian_options(session)
                self.assertEqual(len(options), 3)
                all_codes = [s["kode_bagian"] for u in options for s in u["subbagian"]]
                self.assertEqual(len(all_codes), 6)
                self.assertEqual(set(all_codes), {"BAG-01", "BAG-02", "BAG-03", "BAG-04", "BAG-05", "BAG-06"})
                for unit in options:
                    self.assertEqual(len(unit["subbagian"]), 2)
        finally:
            await engine.dispose()


if __name__ == "__main__":
    unittest.main()
