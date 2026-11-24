from datetime import datetime, date
from typing import Optional
from sqlalchemy import String, Integer, Text, Date, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class WorkflowLetter(Base):
    __tablename__ = 'workflow_letter'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(20))
    subject: Mapped[str] = mapped_column(String(255))
    sender: Mapped[str] = mapped_column(String(255))
    recipient: Mapped[str] = mapped_column(String(255))
    number: Mapped[str | None] = mapped_column(String(150), nullable=True)
    content: Mapped[str] = mapped_column(Text)
    date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(30), default='draft')
    owner_id: Mapped[int] = mapped_column(ForeignKey('pegawai.id_pegawai'))
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey('pegawai.id_pegawai'), nullable=True)
    file_id: Mapped[int | None] = mapped_column(ForeignKey('file_record.id_file'), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    history: Mapped[list] = mapped_column(JSON, default=list)


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
