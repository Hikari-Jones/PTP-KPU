"""Add operations tables and Wave 1-3 columns to an existing MySQL database without reseeding."""
import asyncio
from sqlalchemy import inspect, text
from app.core.database import engine, Base
import app.models  # noqa: F401


# (column_name, sql_column_definition, optional_index_name)
TABLE_COLUMN_UPGRADES = {
    "workflow_letter": [
        ("nomor_agenda", "VARCHAR(60) NULL", "ix_workflow_letter_nomor_agenda"),
        ("sifat_surat", "VARCHAR(30) NOT NULL DEFAULT 'Biasa'", None),
        ("batas_waktu", "DATE NULL", None),
        ("id_klasifikasi", "INT NULL", None),
        ("participant_ids", "JSON NULL", None),
        ("participant_tokens", "VARCHAR(500) NOT NULL DEFAULT ''", None),
    ],
    "surat_keluar": [
        ("tembusan", "TEXT NULL", None),
        ("penandatangan_nama", "VARCHAR(150) NULL", None),
        ("penandatangan_jabatan", "VARCHAR(150) NULL", None),
        ("atas_nama", "VARCHAR(30) NULL", None),
        ("file_id", "INT NULL", None),
        ("content_sha256", "VARCHAR(64) NULL", None),
    ],
    "surat_tugas": [
        ("dasar_tugas", "TEXT NULL", None),
        ("id_pagu", "INT NULL", None),
        ("laporan_file_id", "INT NULL", None),
    ],
    "pagu_anggaran": [
        ("pagu_blokir", "DECIMAL(18, 2) NOT NULL DEFAULT 0.00", None),
        ("rpd_triwulan_1", "DECIMAL(18, 2) NOT NULL DEFAULT 0.00", None),
        ("rpd_triwulan_2", "DECIMAL(18, 2) NOT NULL DEFAULT 0.00", None),
        ("rpd_triwulan_3", "DECIMAL(18, 2) NOT NULL DEFAULT 0.00", None),
        ("rpd_triwulan_4", "DECIMAL(18, 2) NOT NULL DEFAULT 0.00", None),
    ],
    "revisi_anggaran": [
        ("jenis_revisi", "VARCHAR(20) NOT NULL DEFAULT 'DIPA'", None),
        ("batch_kode", "VARCHAR(60) NULL", "ix_revisi_anggaran_batch_kode"),
    ],
    "realisasi_anggaran": [
        ("mekanisme_bayar", "VARCHAR(20) NULL", None),
        ("jenis_dokumen_bayar", "VARCHAR(30) NULL", None),
        ("nomor_sp2d", "VARCHAR(120) NULL", None),
        ("penerima_pembayaran", "VARCHAR(200) NULL", None),
        ("potongan_pajak", "DECIMAL(18, 2) NOT NULL DEFAULT 0.00", None),
        ("is_koreksi", "BOOLEAN NOT NULL DEFAULT FALSE", None),
        ("koreksi_dari_id", "INT NULL", None),
    ],
    "file_record": [
        ("sha256_hash", "VARCHAR(64) NULL", "ix_file_record_sha256_hash"),
    ],
    "dokumen_arsip": [
        ("status_retensi", "VARCHAR(30) NOT NULL DEFAULT 'aktif'", "ix_dokumen_arsip_status_retensi"),
        ("nasib_akhir", "VARCHAR(30) NULL", None),
        ("tanggal_retensi_aktif", "DATE NULL", "ix_dokumen_arsip_tanggal_retensi_aktif"),
        ("tanggal_retensi_inaktif", "DATE NULL", "ix_dokumen_arsip_tanggal_retensi_inaktif"),
        ("arsip_vital", "BOOLEAN NOT NULL DEFAULT FALSE", "ix_dokumen_arsip_arsip_vital"),
        ("legal_hold", "BOOLEAN NOT NULL DEFAULT FALSE", "ix_dokumen_arsip_legal_hold"),
        ("legal_hold_alasan", "VARCHAR(255) NULL", None),
        ("lokasi_fisik", "VARCHAR(150) NULL", None),
        ("nomor_berkas", "VARCHAR(80) NULL", None),
        ("sha256_hash", "VARCHAR(64) NULL", "ix_dokumen_arsip_sha256_hash"),
        ("extracted_text", "TEXT NULL", None),
        ("versi_dokumen", "INT NOT NULL DEFAULT 1", None),
        ("parent_dokumen_id", "INT NULL", "ix_dokumen_arsip_parent_dokumen_id"),
    ],
}


async def apply_schema_upgrades(connection) -> None:
    """Idempotently add any missing tables, columns, and constraints to an existing database."""
    dialect = connection.dialect.name

    def inspect_schema(conn):
        inspector = inspect(conn)
        tbls = inspector.get_table_names()
        peg_cols = inspector.get_columns("pegawai") if inspector.has_table("pegawai") else []
        peg_uqs = inspector.get_unique_constraints("pegawai") if inspector.has_table("pegawai") else []
        return tbls, peg_cols, peg_uqs

    tables, columns, constraints = await connection.run_sync(inspect_schema)
    if "pegawai" not in tables:
        raise RuntimeError("Initialize a fresh database with setup_local_database.py first")
    if "id_pegawai" not in {c["name"] for c in columns}:
        raise RuntimeError("Legacy UUID schema detected; migrate to current schema before this upgrade")

    duplicates = (
        await connection.execute(
            text("SELECT nip FROM pegawai WHERE nip IS NOT NULL GROUP BY nip HAVING COUNT(*) > 1")
        )
    ).fetchall()
    if duplicates:
        raise RuntimeError("Duplicate NIPs exist; resolve duplicate identities before upgrade")

    col_names = {c["name"] for c in columns}
    if "session_version" not in col_names:
        await connection.execute(text("ALTER TABLE pegawai ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0"))
    if "is_active" not in col_names:
        await connection.execute(text("ALTER TABLE pegawai ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE"))
    if dialect == "mysql" and not any(c["column_names"] == ["nip"] for c in constraints):
        await connection.execute(text("ALTER TABLE pegawai ADD CONSTRAINT uq_pegawai_nip UNIQUE (nip)"))

    # Create all missing tables (authority_grant, arsip_access_grant, arsip_audit_log, arsip_penyusutan, etc.)
    await connection.run_sync(Base.metadata.create_all)

    # Archive legacy column upgrades (id_klasifikasi NULL, sumber_modul, ref_tipe, hapus_status)
    archive_columns = await connection.run_sync(
        lambda c: {col["name"]: col for col in inspect(c).get_columns("dokumen_arsip")}
    )
    if dialect == "mysql" and not archive_columns.get("id_klasifikasi", {}).get("nullable", True):
        await connection.execute(text("ALTER TABLE dokumen_arsip MODIFY id_klasifikasi INT NULL"))
    if "sumber_modul" not in archive_columns:
        await connection.execute(
            text("ALTER TABLE dokumen_arsip ADD COLUMN sumber_modul VARCHAR(30) NOT NULL DEFAULT 'arsip'")
        )
        await connection.execute(text("CREATE INDEX ix_dokumen_arsip_sumber_modul ON dokumen_arsip (sumber_modul)"))
    if "sub_kategori" not in archive_columns:
        await connection.execute(text("ALTER TABLE dokumen_arsip ADD COLUMN sub_kategori VARCHAR(150) NULL"))
        await connection.execute(text("CREATE INDEX ix_dokumen_arsip_sub_kategori ON dokumen_arsip (sub_kategori)"))
    if "ref_tipe" not in archive_columns:
        await connection.execute(text("ALTER TABLE dokumen_arsip ADD COLUMN ref_tipe VARCHAR(30) NULL"))
        await connection.execute(text("ALTER TABLE dokumen_arsip ADD COLUMN ref_id INT NULL"))
        if dialect == "mysql":
            await connection.execute(
                text("ALTER TABLE dokumen_arsip ADD CONSTRAINT uq_dokumen_arsip_ref UNIQUE (ref_tipe, ref_id)")
            )
    if "hapus_status" not in archive_columns:
        for col_def in (
            "hapus_status VARCHAR(20) NULL",
            "hapus_diajukan_oleh INT NULL",
            "hapus_diajukan_pada DATETIME NULL",
            "hapus_alasan VARCHAR(255) NULL",
            "hapus_catatan_admin VARCHAR(255) NULL",
        ):
            await connection.execute(text(f"ALTER TABLE dokumen_arsip ADD COLUMN {col_def}"))
        await connection.execute(text("CREATE INDEX ix_dokumen_arsip_hapus_status ON dokumen_arsip (hapus_status)"))
        if dialect == "mysql":
            await connection.execute(
                text(
                    "ALTER TABLE dokumen_arsip ADD CONSTRAINT fk_dokumen_arsip_pengaju_hapus "
                    "FOREIGN KEY (hapus_diajukan_oleh) REFERENCES pegawai (id_pegawai) "
                    "ON UPDATE CASCADE ON DELETE SET NULL"
                )
            )

    # Wave 1-3 additive column upgrades across all operational tables
    existing_tables = set(await connection.run_sync(lambda c: inspect(c).get_table_names()))
    for table_name, specs in TABLE_COLUMN_UPGRADES.items():
        if table_name not in existing_tables:
            continue
        existing_cols = await connection.run_sync(
            lambda c, tn=table_name: {col["name"] for col in inspect(c).get_columns(tn)}
        )
        existing_indexes = await connection.run_sync(
            lambda c, tn=table_name: {idx["name"] for idx in inspect(c).get_indexes(tn)}
        )
        for col_name, col_def, idx_name in specs:
            if col_name not in existing_cols:
                await connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_def}"))
            if idx_name and idx_name not in existing_indexes:
                await connection.execute(text(f"CREATE INDEX {idx_name} ON {table_name} ({col_name})"))

    # Wave 2: Replace global unique(kode_akun) on akun_anggaran with composite unique(id_bagian, kode_akun)
    if dialect == "mysql" and "akun_anggaran" in existing_tables:
        akun_uqs = await connection.run_sync(lambda c: inspect(c).get_unique_constraints("akun_anggaran"))
        for uq in akun_uqs:
            if uq.get("column_names") == ["kode_akun"] and uq.get("name"):
                await connection.execute(text(f"ALTER TABLE akun_anggaran DROP INDEX `{uq['name']}`"))
        if not any(set(uq.get("column_names") or []) == {"id_bagian", "kode_akun"} for uq in akun_uqs):
            await connection.execute(
                text("ALTER TABLE akun_anggaran ADD CONSTRAINT uq_akun_bagian_kode UNIQUE (id_bagian, kode_akun)")
            )

    # Normalize legacy Indonesian fiscal-year labels
    if "tahun_anggaran" in existing_tables:
        for value, aliases in (
            ("active", "'aktif','active'"),
            ("draft", "'perencanaan','draft'"),
            ("closed", "'tutup','ditutup','closed'"),
        ):
            await connection.execute(
                text(f"UPDATE tahun_anggaran SET status = '{value}' WHERE LOWER(TRIM(status)) IN ({aliases})")
            )


async def upgrade():
    async with engine.begin() as connection:
        await apply_schema_upgrades(connection)
    from app.core.database import AsyncSessionLocal
    from app.core.reference_data import ensure_reference_data
    async with AsyncSessionLocal() as session:
        await ensure_reference_data(session)
        await session.commit()
    await engine.dispose()
    print("Operations schema upgrade completed without reseeding demo data")


if __name__ == "__main__":
    asyncio.run(upgrade())
