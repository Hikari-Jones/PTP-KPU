from datetime import datetime, date
from typing import Optional
from sqlalchemy import String, Integer, Text, Date, DateTime, ForeignKey, JSON, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class AuthorityGrant(Base):
    """Database-backed SK Penugasan / Authority Grant (complements env AUTHORITY_GRANTS)."""
    __tablename__ = 'authority_grant'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pegawai_id: Mapped[int] = mapped_column(
        ForeignKey('pegawai.id_pegawai', onupdate='CASCADE', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    jabatan_penugasan: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    document_reference: Mapped[str] = mapped_column(String(200), nullable=False)
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_until: Mapped[date] = mapped_column(Date, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default='1')
    granted_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey('pegawai.id_pegawai', onupdate='CASCADE', ondelete='SET NULL'),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class WorkflowLetter(Base):
    __tablename__ = 'workflow_letter'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(20))
    subject: Mapped[str] = mapped_column(String(255))
    sender: Mapped[str] = mapped_column(String(255))
    recipient: Mapped[str] = mapped_column(String(255))
    number: Mapped[str | None] = mapped_column(String(150), nullable=True)
    nomor_agenda: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)
    sifat_surat: Mapped[str] = mapped_column(String(30), nullable=False, default='Biasa', server_default='Biasa')
    batas_waktu: Mapped[date | None] = mapped_column(Date, nullable=True)
    id_klasifikasi: Mapped[int | None] = mapped_column(
        ForeignKey('kode_klasifikasi_arsip.id_klasifikasi', onupdate='CASCADE', ondelete='SET NULL'),
        nullable=True,
    )
    content: Mapped[str] = mapped_column(Text)
    date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(30), default='draft')
    owner_id: Mapped[int] = mapped_column(ForeignKey('pegawai.id_pegawai'))
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey('pegawai.id_pegawai'), nullable=True)
    file_id: Mapped[int | None] = mapped_column(ForeignKey('file_record.id_file'), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    history: Mapped[list] = mapped_column(JSON, default=list)
    participant_ids: Mapped[list] = mapped_column(JSON, default=list)
    participant_tokens: Mapped[str] = mapped_column(String(500), nullable=False, default='', server_default='')


class BugReport(Base):
    __tablename__ = 'bug_report'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(500))
    priority: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default='Terbuka')
    owner_id: Mapped[int] = mapped_column(ForeignKey('pegawai.id_pegawai'))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class BudgetEvent(Base):
    """Append-only through the application API; retained even when a draft is deleted."""
    __tablename__ = 'budget_event'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    realization_id: Mapped[int] = mapped_column(Integer, index=True)
    actor_id: Mapped[int] = mapped_column(ForeignKey('pegawai.id_pegawai'))
    action: Mapped[str] = mapped_column(String(30))
    recorded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    snapshot: Mapped[dict] = mapped_column(JSON)


class FinancialAuditLog(Base):
    """
    Comprehensive immutable financial audit log for all financial events:
    CREATE, UPDATE, DELETE, ACTIVATE, CLOSE, REOPEN, CORRECTION.
    Captures actor, target entity/table, target ID, old/new values, fiscal year, and reason.
    """
    __tablename__ = 'financial_audit_log'
    id_log: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_pegawai: Mapped[Optional[int]] = mapped_column(ForeignKey('pegawai.id_pegawai'), nullable=True)
    nama_pegawai: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    waktu_aksi: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, server_default=func.now())
    aksi: Mapped[str] = mapped_column(String(30)) # CREATE, UPDATE, DELETE, ACTIVATE, CLOSE, REOPEN, CORRECTION
    nama_tabel: Mapped[str] = mapped_column(String(50)) # pagu_anggaran, revisi_anggaran, realisasi_anggaran, tahun_anggaran, dll.
    id_entitas: Mapped[int] = mapped_column(Integer, index=True)
    id_tahun_anggaran: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    tahun: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    nilai_sebelum: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    nilai_sesudah: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    alasan: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)


class HistoricalReportVersion(Base):
    """
    Append-only snapshot versioning for published financial reports.
    Guarantees historical reports are never overwritten when corrections or updates occur.
    """
    __tablename__ = 'historical_report_version'
    id_version: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_tahun_anggaran: Mapped[int] = mapped_column(ForeignKey('tahun_anggaran.id_tahun_anggaran'), index=True)
    tahun: Mapped[int] = mapped_column(Integer)
    periode_laporan: Mapped[str] = mapped_column(String(50)) # e.g. "Tahunan", "Triwulan I", "Bulanan-05"
    nomor_versi: Mapped[int] = mapped_column(Integer, default=1)
    diterbitkan_oleh: Mapped[Optional[int]] = mapped_column(ForeignKey('pegawai.id_pegawai'), nullable=True)
    nama_penerbit: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    waktu_terbit: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, server_default=func.now())
    alasan_koreksi: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    snapshot_data: Mapped[dict] = mapped_column(JSON) # JSON snapshot of summary and accounts


class ArsipAccessGrant(Base):
    """Explicit per-document SKKAAD access grant for rahasia/sangat_rahasia/terbatas archives."""
    __tablename__ = 'arsip_access_grant'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_dokumen: Mapped[int] = mapped_column(
        ForeignKey('dokumen_arsip.id_dokumen', onupdate='CASCADE', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    id_pegawai: Mapped[int] = mapped_column(
        ForeignKey('pegawai.id_pegawai', onupdate='CASCADE', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    granted_by: Mapped[int] = mapped_column(
        ForeignKey('pegawai.id_pegawai', onupdate='CASCADE', ondelete='RESTRICT'),
        nullable=False,
    )
    alasan: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    valid_until: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())


class ArsipAuditLog(Base):
    """Immutable audit trail for archive access, modifications, grants, and disposal."""
    __tablename__ = 'arsip_audit_log'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_dokumen: Mapped[Optional[int]] = mapped_column(
        ForeignKey('dokumen_arsip.id_dokumen', onupdate='CASCADE', ondelete='SET NULL'),
        nullable=True,
        index=True,
    )
    nomor_dokumen: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    nama_dokumen: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    aksi: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    actor_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey('pegawai.id_pegawai', onupdate='CASCADE', ondelete='SET NULL'),
        nullable=True,
        index=True,
    )
    actor_nama: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    detail: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now(), index=True)


class ArsipPenyusutan(Base):
    """Formal archive disposal / transfer proposal (Daftar Usul Musnah/Serah/Pindah & Berita Acara)."""
    __tablename__ = 'arsip_penyusutan'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nomor_ba: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    jenis_penyusutan: Mapped[str] = mapped_column(String(30), nullable=False, default='musnah')  # musnah | serah | pindah
    status: Mapped[str] = mapped_column(String(30), nullable=False, default='diajukan', index=True)  # diajukan | dieksekusi | ditolak
    alasan: Mapped[str] = mapped_column(Text, nullable=False)
    dokumen_ids: Mapped[list] = mapped_column(JSON, default=list)
    dokumen_snapshot: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    diajukan_oleh: Mapped[int] = mapped_column(
        ForeignKey('pegawai.id_pegawai', onupdate='CASCADE', ondelete='RESTRICT'),
        nullable=False,
    )
    disetujui_oleh: Mapped[Optional[int]] = mapped_column(
        ForeignKey('pegawai.id_pegawai', onupdate='CASCADE', ondelete='SET NULL'),
        nullable=True,
    )
    catatan_persetujuan: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    tanggal_eksekusi: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())
