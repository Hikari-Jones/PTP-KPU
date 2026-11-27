"""Read-only database access for the KIRANA chatbot.

The model writes a SQL query; this module decides whether it may run. Only a
single SELECT over an allow-list of tables is accepted, sensitive columns are
blocked, the query runs inside a read-only transaction with a time limit, and
the result is capped in rows and size before it goes back to the model.
"""

import asyncio
import logging
import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any, List

from sqlalchemy import text

from app.core.database import Base, engine

logger = logging.getLogger(__name__)

MAX_ROWS = 40
MAX_CELL_CHARS = 300
MAX_RESULT_CHARS = 6000
QUERY_TIMEOUT_SECONDS = 15

# Tables the chatbot may read. Chat logs and anything not listed are off-limits.
ALLOWED_TABLES = {
    "workflow_letter",
    "bagian",
    "pegawai",
    "kode_klasifikasi_arsip",
    "jenis_surat",
    "penomoran_sequence",
    "surat_keluar",
    "surat_tugas",
    "surat_tugas_pelaksana",
    "riwayat_status_surat",
    "disposisi",
    "dokumen_arsip",
    "tahun_anggaran",
    "akun_anggaran",
    "pagu_anggaran",
    "revisi_anggaran",
    "realisasi_anggaran",
}

# Columns that must never reach the model, whatever the query looks like.
BLOCKED_COLUMNS = {
    "password",
    "session_version",
    "file_path",
    "path_file",
    "bukti_file_path",
    "bukti_file_nama",
    "relative_path",
    "stored_name",
    "hapus_alasan",
    "hapus_catatan_admin",
    "extracted_text",
    "participant_tokens",
    "legal_hold_alasan",
}

_BLOCKED_WORDS = re.compile(
    r"\b(load_file|outfile|dumpfile|sleep|benchmark|get_lock|release_lock|"
    r"information_schema|performance_schema|mysql\s*\.)",
    re.IGNORECASE,
)

_ANSI = re.compile(r"\x1b\[[0-9;]*m")

# Compact description of the schema given to the model.
SCHEMA_DOC = """\
workflow_letter(id PK, kind ['masuk','keluar'], subject [perihal], sender, recipient, number [nomor surat], nomor_agenda, sifat_surat, batas_waktu DATE, id_klasifikasi FK kode_klasifikasi_arsip, content [isi surat], date DATE, status ['draft','submitted','revision','approved','registered','assigned','completed','archived'], owner_id FK pegawai, assignee_id FK pegawai NULL, version)
bagian(id_bagian PK, kode_bagian, nama_bagian)
pegawai(id_pegawai PK, id_bagian FK bagian, nama, nip, jabatan, role)
kode_klasifikasi_arsip(id_klasifikasi PK, kode_klasifikasi, nama_klasifikasi, kategori_utama, deskripsi, retensi_aktif_tahun, retensi_inaktif_tahun, hak_akses)
jenis_surat(id_jenis_surat PK, kode_jenis, nama_jenis, format_nomor)
penomoran_sequence(id_sequence PK, tahun, id_jenis_surat FK jenis_surat, id_bagian FK bagian, last_number)
surat_keluar(id_surat_keluar PK, id_pegawai FK pegawai [pembuat], id_bagian FK bagian, id_klasifikasi FK kode_klasifikasi_arsip, id_jenis_surat FK jenis_surat, nomor_surat, nomor_urut, tahun, bulan_romawi, sifat_surat, lampiran, perihal, tujuan_surat, isi_surat, tembusan, penandatangan_nama, penandatangan_jabatan, status ['draft','menunggu_persetujuan','revisi','disetujui','terbit','diarsipkan'], tanggal_surat DATE, tanggal_terbit DATETIME, created_at)
surat_tugas(id_surat_tugas PK, id_surat_keluar FK surat_keluar, nomor_tugas, dasar_tugas, maksud_tugas, tempat_tugas, tanggal_mulai DATE, tanggal_selesai DATE, beban_anggaran, id_pagu FK pagu_anggaran)
surat_tugas_pelaksana(id_pelaksana PK, id_surat_tugas FK surat_tugas, id_pegawai FK pegawai, peran_tugas)
riwayat_status_surat(id_riwayat PK, id_surat_keluar FK surat_keluar, id_pegawai FK pegawai, status_lama, status_baru, catatan, waktu DATETIME)
disposisi(id_disposisi PK, id_surat_keluar FK surat_keluar, id_pegawai FK pegawai [penerima], instruksi, tanggal_disposisi DATE)
dokumen_arsip(id_dokumen PK, id_surat_keluar FK surat_keluar NULL, id_klasifikasi FK kode_klasifikasi_arsip, id_pegawai FK pegawai [pengunggah], nama_dokumen, nomor_dokumen, kategori, event, tanggal_dokumen DATE, ukuran_file, hak_akses ['biasa','internal','publik','terbatas','rahasia','sangat_rahasia'], status_retensi ['aktif','inaktif','siap_susut','disusutkan'], nasib_akhir ['musnah','permanen','dinilai_kembali'], tanggal_retensi_aktif DATE, tanggal_retensi_inaktif DATE, arsip_vital, legal_hold, lokasi_fisik, nomor_berkas, versi_dokumen, status_hapus [0=aktif, 1=di tempat sampah], sumber_modul ['arsip','surat','realisasi'], sub_kategori [Surat Masuk/Surat Keluar/Surat Tugas atau akun], created_at)
tahun_anggaran(id_tahun_anggaran PK, tahun, status ['draft','active','closed'], tanggal_mulai, tanggal_selesai, deskripsi)
akun_anggaran(id_akun_anggaran PK, id_bagian FK bagian, kode_akun, nama_akun, total_pagu, jenis_belanja, program, sub_program, status ['active','inactive'])
pagu_anggaran(id_pagu PK, id_tahun_anggaran FK tahun_anggaran, tahun [tahun anggaran, mis. 2026], id_akun_anggaran FK akun_anggaran, pagu_awal, pagu_aktif [pagu yang berlaku sekarang], pagu_blokir [pagu diblokir/self-blocking], rpd_triwulan_1, rpd_triwulan_2, rpd_triwulan_3, rpd_triwulan_4, nomor_sk, tanggal_sk, keterangan)
revisi_anggaran(id_revisi PK, id_pagu FK pagu_anggaran, id_pegawai FK pegawai, nomor_revisi, jenis_revisi ['DIPA','POK'], batch_kode, tanggal_revisi DATE, pagu_sebelum, pagu_sesudah, alasan_revisi)
realisasi_anggaran(id_realisasi PK, id_pagu FK pagu_anggaran, tahun [tahun anggaran, mis. 2026], id_akun_anggaran FK akun_anggaran, id_pegawai FK pegawai [penginput], id_verifier FK pegawai, tanggal_transaksi DATE, nomor_dokumen, uraian_kegiatan, jumlah_realisasi, mekanisme_bayar ['UP','TUP','GUP','LS'], jenis_dokumen_bayar ['SPBy','SPP','SPM','SP2D','Kuitansi','SSPB'], nomor_sp2d, penerima_pembayaran, potongan_pajak, is_koreksi, status ['draft','submitted','verified','rejected'], periode, catatan_verifikasi, verified_at)"""


class QueryRejected(ValueError):
    """The query is not allowed to run. The message is shown to the model."""


def _dialect() -> str:
    name = engine.dialect.name
    return name if name in ("mysql", "sqlite", "postgresql") else "mysql"


def validate_sql(sql: str, *, user=None) -> str:
    """Return a safe, row-limited version of `sql`, or raise QueryRejected."""
    import sqlglot
    from sqlglot import exp
    from sqlglot.optimizer.scope import traverse_scope

    if user is None:
        raise QueryRejected("Identitas pengguna diperlukan untuk membaca database.")
    sql = (sql or "").strip().rstrip(";").strip()
    if not sql:
        raise QueryRejected("Query kosong.")
    if _BLOCKED_WORDS.search(sql):
        raise QueryRejected("Query memakai fungsi atau skema yang tidak diizinkan.")

    try:
        statements = [s for s in sqlglot.parse(sql, read=_dialect()) if s is not None]
    except Exception as exc:
        # sqlglot decorates its message with terminal colour codes and a long
        # excerpt; keep only the first, plain line for the model.
        detail = _ANSI.sub("", str(exc)).strip().splitlines()[0][:200]
        raise QueryRejected(
            f"SQL tidak valid ({detail}). Periksa tanda kurung, koma, dan nama kolom."
        ) from exc
    if len(statements) != 1:
        raise QueryRejected("Hanya satu pernyataan SELECT yang diizinkan.")

    tree = statements[0]
    if not isinstance(tree, (exp.Select, exp.Union)):
        raise QueryRejected("Hanya query SELECT (baca saja) yang diizinkan.")

    write_nodes = tuple(
        node
        for node in (
            getattr(exp, name, None)
            for name in ("Insert", "Update", "Delete", "Drop", "Create", "Alter",
                         "AlterTable", "Into", "Command", "Merge", "TruncateTable", "Lock")
        )
        if node is not None
    )
    if any(True for _ in tree.find_all(*write_nodes)):
        raise QueryRejected("Hanya query SELECT (baca saja) yang diizinkan.")

    cte_names = {cte.alias_or_name.lower() for cte in tree.find_all(exp.CTE)}
    for table in tree.find_all(exp.Table):
        name = table.name.lower()
        if table.db or table.catalog:
            raise QueryRejected("Akses ke skema/database lain tidak diizinkan.")
        if name not in ALLOWED_TABLES and name not in cte_names:
            raise QueryRejected(
                f"Tabel '{table.name}' tidak tersedia. Gunakan hanya tabel pada skema."
            )

    for column in tree.find_all(exp.Column):
        if column.name.lower() in BLOCKED_COLUMNS:
            raise QueryRejected(f"Kolom '{column.name}' bersifat rahasia dan tidak boleh dibaca.")

    # Resolve physical sources separately from CTE references. Replace every
    # physical relation before executing, so aliases, stars, subqueries and
    # aggregates all see the same authorized rows and safe columns.
    for scope in traverse_scope(tree):
        for alias, (_, source) in scope.selected_sources.items():
            if isinstance(source, exp.Table):
                scoped = sqlglot.parse_one(_scoped_relation(source.name.lower(), user), read=_dialect())
                source.replace(scoped.subquery(alias=alias))

    limit = tree.args.get("limit")
    if limit is None:
        tree = tree.limit(MAX_ROWS + 1)
    else:
        value = limit.expression
        if not isinstance(value, exp.Literal) or not value.is_int or int(value.this) < 0:
            raise QueryRejected("LIMIT harus berupa bilangan bulat positif.")
        tree = tree.limit(min(int(value.this), MAX_ROWS + 1))
    return tree.sql(dialect=_dialect())


_WITH_TAHUN = {
    "realisasi_anggaran": "LEFT JOIN `pagu_anggaran` pg ON pg.`id_pagu` = x.`id_pagu`",
    "pagu_anggaran": "",
}
_TAHUN_KEY = {"realisasi_anggaran": "pg.`id_tahun_anggaran`", "pagu_anggaran": "x.`id_tahun_anggaran`"}


def _scoped_relation(name: str, user) -> str:
    """Project safe columns and enforce the existing module's row permissions."""
    import app.models.schema  # noqa: F401
    import app.models.operations  # noqa: F401
    from app.core.auth import is_admin

    if name not in ALLOWED_TABLES or user is None:
        raise QueryRejected("Tabel atau identitas pengguna tidak diizinkan.")
    table = Base.metadata.tables.get(name)
    if table is None:
        raise QueryRejected("Tabel tidak tersedia.")
    columns = ", ".join(f"`{c.name}`" for c in table.columns if c.name.lower() not in BLOCKED_COLUMNS)
    query = f"SELECT {columns} FROM `{name}`"
    if name in _WITH_TAHUN:
        # Budget rows carry their fiscal year directly, so "WHERE tahun = 2026" works
        # without the multi-table join small models get wrong. Read-only, unrestricted
        # tables only (same rows as before, one extra column).
        prefixed = ", ".join(f"x.`{c.name}`" for c in table.columns if c.name.lower() not in BLOCKED_COLUMNS)
        extra_cols = ", t.`tahun` AS `tahun`, t.`status` AS `status`" if name == "pagu_anggaran" else ", t.`tahun` AS `tahun`"
        query = (f"SELECT {prefixed}{extra_cols} FROM `{name}` x "
                 f"{_WITH_TAHUN[name]} LEFT JOIN `tahun_anggaran` t ON t.`id_tahun_anggaran` = {_TAHUN_KEY[name]}")
    if is_admin(user):
        return query
    from app.core.auth import is_rendatin_or_keuangan
    # IDs originate from the authenticated database user, never the prompt.
    uid = int(user.id_pegawai)
    letters = (f"SELECT id_surat_keluar FROM surat_keluar WHERE id_pegawai = {uid} "
               f"OR id_surat_keluar IN (SELECT id_surat_keluar FROM disposisi WHERE id_pegawai = {uid})")
    if name == "workflow_letter":
        return query + f" WHERE owner_id = {uid} OR assignee_id = {uid} OR participant_tokens LIKE '%,{uid},%'"
    if name == "surat_keluar":
        return query + f" WHERE id_surat_keluar IN ({letters})"
    if name in {"surat_tugas", "riwayat_status_surat", "disposisi"}:
        return query + f" WHERE id_surat_keluar IN ({letters})"
    if name == "surat_tugas_pelaksana":
        return query + f" WHERE id_surat_tugas IN (SELECT id_surat_tugas FROM surat_tugas WHERE id_surat_keluar IN ({letters}))"
    if name == "dokumen_arsip":
        # Strict 4-tier SKKAAD scoping: rahasia & sangat_rahasia owned by others are never exposed to KIRANA AI
        allowed = f"hak_akses IN ('biasa', 'internal', 'publik') OR id_pegawai = {uid}"
        if user.id_bagian is not None:
            allowed += (
                " OR (hak_akses = 'terbatas' AND (ref_tipe IS NULL OR ref_tipe != 'workflow_letter') "
                f"AND id_pegawai IN (SELECT id_pegawai FROM pegawai WHERE id_bagian = {int(user.id_bagian)}))"
            )
        return query + f" WHERE (status_hapus = 0 OR status_hapus IS NULL) AND ({allowed})"
    if name in {"akun_anggaran", "pagu_anggaran", "realisasi_anggaran", "revisi_anggaran"} and not is_rendatin_or_keuangan(user):
        if user.id_bagian is None:
            return query + " WHERE 1 = 0"
        bid = int(user.id_bagian)
        if name == "akun_anggaran":
            return query + f" WHERE id_bagian = {bid}"
        if name in {"pagu_anggaran", "realisasi_anggaran"}:
            return query + f" WHERE x.id_akun_anggaran IN (SELECT id_akun_anggaran FROM akun_anggaran WHERE id_bagian = {bid})"
        if name == "revisi_anggaran":
            return query + (
                " WHERE id_pagu IN (SELECT id_pagu FROM pagu_anggaran WHERE id_akun_anggaran IN "
                f"(SELECT id_akun_anggaran FROM akun_anggaran WHERE id_bagian = {bid}))"
            )
    return query


def _column_hint(sql: str) -> str:
    """List the real columns of the tables a failed query used, so the model
    stops guessing column names."""
    try:
        import sqlglot
        from sqlglot import exp
        import app.models.schema  # noqa: F401  (registers the tables on Base)

        names = {t.name.lower() for t in sqlglot.parse_one(sql, read=_dialect()).find_all(exp.Table)}
    except Exception:
        return ""
    lines = []
    for name in sorted(names & ALLOWED_TABLES):
        table = Base.metadata.tables.get(name)
        if table is not None:
            columns = [c.name for c in table.columns if c.name.lower() not in BLOCKED_COLUMNS]
            lines.append(f"Kolom {name}: {', '.join(columns)}")
    return ("\nGunakan hanya kolom berikut.\n" + "\n".join(lines)) if lines else ""


def _format_cell(value: Any) -> str:
    if value is None:
        return "-"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (Decimal, float, int)):
        # Whole numbers are written without ".00" and, when large, with
        # Indonesian thousands separators (300.000.000). Small models misread
        # "300000000.00" by a factor of ten; this form they copy correctly.
        if value == value.__trunc__():
            whole = int(value)
            return f"{whole:,}".replace(",", ".") if abs(whole) >= 10000 else str(whole)
        return format(value, "f") if isinstance(value, Decimal) else repr(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat(sep=" ") if isinstance(value, datetime) else value.isoformat()
    if isinstance(value, (bytes, bytearray)):
        return "<biner>"
    cell = " ".join(str(value).split()).replace("|", "/")
    return cell if len(cell) <= MAX_CELL_CHARS else cell[: MAX_CELL_CHARS - 1] + "…"


def _format_result(columns: List[str], rows: List[Any], truncated: bool) -> str:
    keep = [i for i, name in enumerate(columns) if name.lower() not in BLOCKED_COLUMNS]
    if not rows:
        return "Hasil: 0 baris (tidak ada data yang cocok)."

    lines = [" | ".join(columns[i] for i in keep)]
    size = len(lines[0])
    shown = 0
    for row in rows:
        line = " | ".join(_format_cell(row[i]) for i in keep)
        if size + len(line) > MAX_RESULT_CHARS:
            truncated = True
            break
        lines.append(line)
        size += len(line) + 1
        shown += 1

    note = f"Hasil: {shown} baris."
    if truncated:
        note = (
            f"Hasil: {shown} baris pertama saja (hasil dipotong). Gunakan COUNT/SUM/"
            "GROUP BY atau filter WHERE bila perlu angka keseluruhan."
        )
    return note + "\n" + "\n".join(lines)


async def run_query(sql: str, *, user=None) -> str:
    """Validate and run a model-written query; return the result as text.

    Never raises for bad queries: the explanation is returned so the model can
    correct itself.
    """
    try:
        safe_sql = validate_sql(sql, user=user)
    except QueryRejected as exc:
        logger.warning("KIRANA query rejected (%s): %s", exc, sql)
        return f"ERROR: {exc}"
    logger.info("KIRANA query: %s", safe_sql)

    try:
        async with engine.connect() as conn:
            if engine.dialect.name == "mysql":
                # Writes fail at the database level even if validation is wrong.
                await conn.execute(text("START TRANSACTION READ ONLY"))
            try:
                # text() treats ':name' as a bind parameter; escape literal colons.
                result = await asyncio.wait_for(
                    conn.execute(text(safe_sql.replace(":", r"\:"))),
                    timeout=QUERY_TIMEOUT_SECONDS,
                )
                columns = list(result.keys())
                rows = result.fetchmany(MAX_ROWS + 1)
            finally:
                try:
                    await conn.rollback()
                except Exception:
                    pass  # e.g. connection dropped by the timeout above
    except asyncio.TimeoutError:
        return "ERROR: Query terlalu lama dan dibatalkan. Persempit dengan WHERE atau agregasi."
    except Exception as exc:
        detail = str(getattr(exc, "orig", exc)).splitlines()[0][:300]
        logger.warning("KIRANA query failed (%s): %s", detail, safe_sql)
        return f"ERROR: Query gagal dijalankan: {detail}" + _column_hint(safe_sql)

    truncated = len(rows) > MAX_ROWS
    return _format_result(columns, rows[:MAX_ROWS], truncated)
