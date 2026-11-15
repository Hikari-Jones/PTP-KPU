from datetime import datetime, date
from sqlalchemy import String, Integer, Text, Date, DateTime, ForeignKey, JSON
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
