from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple
from fastapi import HTTPException, status
from sqlalchemy import and_, desc, func, or_, select, String
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.schema import (
    AkunAnggaran,
    FileRecord,
    Bagian,
    PaguAnggaran,
    Pegawai,
    RealisasiAnggaran,
    RevisiAnggaran,
    TahunAnggaran,
    AuditAktivasiTahunAnggaran,
)
from app.schemas.anggaran import (
    AkunAnggaranCreate,
    AkunAnggaranUpdate,
    BudgetSummaryResponse,
    PaguAnggaranCreate,
    PaguAnggaranUpdate,
    RealisasiAnggaranCreateDraft,
    RealisasiAnggaranReject,
    RealisasiAnggaranUpdateDraft,
    RealisasiAnggaranVerify,
    RevisiAnggaranCreate,
    TahunAnggaranCreate,
    TahunAnggaranUpdate,
)
from app.services.base import CRUDBase

_TAHUN_STATUS_ALIASES = {"aktif": "active", "perencanaan": "draft", "tutup": "closed", "ditutup": "closed"}


def normalize_tahun_status(raw: Optional[str]) -> str:
    """Map legacy Indonesian labels to draft/active/closed so responses never fail validation."""
    value = (raw or "draft").strip().lower()
    value = _TAHUN_STATUS_ALIASES.get(value, value)
    return value if value in ("draft", "active", "closed") else "draft"


# =========================================================
# REUSABLE BUDGET CALCULATION HELPER
# =========================================================

async def calculate_budget_summary(db: AsyncSession, id_pagu: int) -> BudgetSummaryResponse:
    """
    Calculate real-time budget metrics directly from MySQL database.
    Verified realization only. Handles division-by-zero.
    """
    stmt = (
        select(PaguAnggaran)
        .options(
            selectinload(PaguAnggaran.tahun_anggaran),
            selectinload(PaguAnggaran.akun_anggaran).selectinload(AkunAnggaran.bagian),
        )
        .where(PaguAnggaran.id_pagu == id_pagu)
    )
    res = await db.execute(stmt)
    pagu = res.scalar_one_or_none()
    if not pagu:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pagu anggaran dengan ID {id_pagu} tidak ditemukan",
        )

    # SUM verified realization only
    sum_stmt = (
        select(func.coalesce(func.sum(RealisasiAnggaran.jumlah_realisasi), Decimal("0.00")))
        .where(
            RealisasiAnggaran.id_pagu == id_pagu,
            RealisasiAnggaran.status == "verified",
        )
    )
    sum_res = await db.execute(sum_stmt)
    total_verified = Decimal(str(sum_res.scalar_one() or 0))

    pagu_aktif = pagu.pagu_aktif or Decimal("0.00")
    pagu_blokir = pagu.pagu_blokir or Decimal("0.00")
    pagu_efektif = pagu_aktif - pagu_blokir
    sisa = pagu_efektif - total_verified
    persentase = float((total_verified / pagu_aktif) * 100) if pagu_aktif > 0 else 0.0

    return BudgetSummaryResponse(
        id_pagu=pagu.id_pagu,
        id_tahun_anggaran=pagu.id_tahun_anggaran,
        tahun=pagu.tahun_anggaran.tahun,
        id_akun_anggaran=pagu.id_akun_anggaran,
        kode_akun=pagu.akun_anggaran.kode_akun,
        nama_akun=pagu.akun_anggaran.nama_akun,
        nama_bagian=pagu.akun_anggaran.bagian.nama_bagian if pagu.akun_anggaran.bagian else "-",
        pagu_awal=pagu.pagu_awal,
        pagu_aktif=pagu_aktif,
        pagu_blokir=pagu_blokir,
        pagu_efektif=pagu_efektif,
        total_realisasi_verified=total_verified,
        sisa_anggaran=sisa,
        persentase_serapan=round(persentase, 2),
    )


# =========================================================
# 1. TAHUN ANGGARAN SERVICE
# =========================================================

class CRUDTahunAnggaran(CRUDBase[TahunAnggaran, TahunAnggaranCreate, TahunAnggaranUpdate]):
    async def get_by_tahun(self, db: AsyncSession, tahun: int) -> Optional[TahunAnggaran]:
        stmt = select(TahunAnggaran).where(TahunAnggaran.tahun == tahun)
        res = await db.execute(stmt)
        return res.scalar_one_or_none()

    async def get_active_year(self, db: AsyncSession) -> Optional[TahunAnggaran]:
        stmt = select(TahunAnggaran).where(TahunAnggaran.status == "active").order_by(desc(TahunAnggaran.tahun)).limit(1)
        res = await db.execute(stmt)
        return res.scalar_one_or_none()

    async def switch_active_fiscal_year(
        self,
        db: AsyncSession,
        *,
        target_id: int,
        current_user_id: Optional[int] = None,
        current_user_name: Optional[str] = None,
        alasan: Optional[str] = None,
    ) -> Tuple[TahunAnggaran, Optional[TahunAnggaran], AuditAktivasiTahunAnggaran]:
        """
        Automatic Fiscal Year Switching (Single Active Fiscal Year concept).
        Atomically switches the active fiscal year to target_id:
        - Locks active and target rows using SELECT ... FOR UPDATE
        - Any previously active year is automatically set to 'closed'
        - The target year is set to 'active'
        - Ensures auto-creation of pagu for active accounts if none exist (idempotent)
        - Logs audit trail (previous year, activated year, user, time, reason)
        - Runs inside a single atomic database transaction
        """
        # 1. Lock and fetch target year
        target_stmt = select(TahunAnggaran).where(TahunAnggaran.id_tahun_anggaran == target_id).with_for_update()
        target_res = await db.execute(target_stmt)
        target_year = target_res.scalar_one_or_none()
        if not target_year:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Tahun anggaran dengan ID {target_id} tidak ditemukan",
            )

        if normalize_tahun_status(target_year.status) == "active":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Tahun anggaran {target_year.tahun} sudah dalam status aktif",
            )

        # 2. Lock and fetch all currently active years (excluding target)
        active_stmt = (
            select(TahunAnggaran)
            .where(
                TahunAnggaran.status == "active",
                TahunAnggaran.id_tahun_anggaran != target_id,
            )
            .with_for_update()
        )
        active_res = await db.execute(active_stmt)
        active_years = list(active_res.scalars().all())

        previous_year: Optional[TahunAnggaran] = None
        for prev in active_years:
            prev.status = "closed"
            db.add(prev)
            if not previous_year:
                previous_year = prev

        # 3. Set target year to active
        target_year.status = "active"
        db.add(target_year)

        # 4. If target year had no pagu, ensure active accounts have baseline pagu (idempotent)
        active_accounts_stmt = (
            select(AkunAnggaran)
            .where(AkunAnggaran.status == "active")
            .order_by(AkunAnggaran.id_akun_anggaran.asc())
        )
        acc_res = await db.execute(active_accounts_stmt)
        active_accounts = list(acc_res.scalars().all())

        existing_pagu_stmt = select(PaguAnggaran.id_akun_anggaran).where(
            PaguAnggaran.id_tahun_anggaran == target_year.id_tahun_anggaran
        )
        existing_pagu_res = await db.execute(existing_pagu_stmt)
        existing_akun_ids = set(existing_pagu_res.scalars().all())

        for acc in active_accounts:
            if acc.id_akun_anggaran not in existing_akun_ids:
                pagu_item = PaguAnggaran(
                    id_tahun_anggaran=target_year.id_tahun_anggaran,
                    id_akun_anggaran=acc.id_akun_anggaran,
                    pagu_awal=Decimal("0.00"),
                    pagu_aktif=Decimal("0.00"),
                    nomor_sk=None,
                    tanggal_sk=None,
                    keterangan=f"Alokasi Pagu Awal TA {target_year.tahun}",
                )
                db.add(pagu_item)

        # 5. Insert Audit Trail
        audit_record = AuditAktivasiTahunAnggaran(
            id_tahun_sebelum=previous_year.id_tahun_anggaran if previous_year else None,
            tahun_sebelum=previous_year.tahun if previous_year else None,
            id_tahun_aktif=target_year.id_tahun_anggaran,
            tahun_aktif=target_year.tahun,
            id_pegawai=current_user_id,
            nama_pegawai=current_user_name,
            alasan=alasan or f"Aktivasi otomatis Tahun Anggaran {target_year.tahun}",
        )
        db.add(audit_record)

        await db.commit()
        await db.refresh(target_year)
        if previous_year:
            await db.refresh(previous_year)
        await db.refresh(audit_record)

        return target_year, previous_year, audit_record

    async def create_tahun(
        self,
        db: AsyncSession,
        *,
        obj_in: TahunAnggaranCreate,
        current_user_id: Optional[int] = None,
        current_user_name: Optional[str] = None,
    ) -> TahunAnggaran:
        # Check unique constraint on tahun
        existing = await self.get_by_tahun(db, obj_in.tahun)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Tahun anggaran {obj_in.tahun} sudah terdaftar",
            )

        # Date validation
        if obj_in.tanggal_mulai >= obj_in.tanggal_selesai:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tanggal mulai harus lebih awal dari tanggal selesai",
            )

        if obj_in.status == "active":
            target_obj = TahunAnggaran(
                tahun=obj_in.tahun,
                status="draft", # temporary until switched
                tanggal_mulai=obj_in.tanggal_mulai,
                tanggal_selesai=obj_in.tanggal_selesai,
                deskripsi=obj_in.deskripsi,
                id_pegawai_pembuat=current_user_id or obj_in.id_pegawai_pembuat,
            )
            db.add(target_obj)
            await db.flush()
            target_year, _, _ = await self.switch_active_fiscal_year(
                db,
                target_id=target_obj.id_tahun_anggaran,
                current_user_id=current_user_id or obj_in.id_pegawai_pembuat,
                current_user_name=current_user_name,
                alasan=f"Pembuatan dan aktivasi langsung TA {obj_in.tahun}",
            )
            return target_year

        db_obj = TahunAnggaran(
            tahun=obj_in.tahun,
            status=obj_in.status,
            tanggal_mulai=obj_in.tanggal_mulai,
            tanggal_selesai=obj_in.tanggal_selesai,
            deskripsi=obj_in.deskripsi,
            id_pegawai_pembuat=current_user_id or obj_in.id_pegawai_pembuat,
        )
        try:
            db.add(db_obj)
            await db.flush()  # Flush to generate id_tahun_anggaran within current transaction

            # Auto-create Pagu Anggaran for all active AkunAnggaran atomically (PHASE 4)
            active_accounts_stmt = (
                select(AkunAnggaran)
                .where(AkunAnggaran.status == "active")
                .order_by(AkunAnggaran.id_akun_anggaran.asc())
            )
            acc_res = await db.execute(active_accounts_stmt)
            active_accounts = list(acc_res.scalars().all())

            if active_accounts:
                # Query existing pagu for this year to guarantee idempotency against duplicates
                existing_pagu_stmt = select(PaguAnggaran.id_akun_anggaran).where(
                    PaguAnggaran.id_tahun_anggaran == db_obj.id_tahun_anggaran
                )
                existing_pagu_res = await db.execute(existing_pagu_stmt)
                existing_akun_ids = set(existing_pagu_res.scalars().all())

                for acc in active_accounts:
                    if acc.id_akun_anggaran not in existing_akun_ids:
                        pagu_item = PaguAnggaran(
                            id_tahun_anggaran=db_obj.id_tahun_anggaran,
                            id_akun_anggaran=acc.id_akun_anggaran,
                            pagu_awal=Decimal("0.00"),
                            pagu_aktif=Decimal("0.00"),
                            nomor_sk=None,
                            tanggal_sk=None,
                            keterangan=f"Alokasi Pagu Awal TA {db_obj.tahun}",
                        )
                        db.add(pagu_item)

            await db.commit()
            await db.refresh(db_obj)
            return db_obj
        except IntegrityError:
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Tahun anggaran {obj_in.tahun} sudah terdaftar",
            )

    async def update_tahun(
        self,
        db: AsyncSession,
        *,
        id_tahun: int,
        obj_in: TahunAnggaranUpdate,
        current_user_id: Optional[int] = None,
        current_user_name: Optional[str] = None,
    ) -> TahunAnggaran:
        db_obj = await self.get(db, id_tahun)
        if not db_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tahun anggaran tidak ditemukan",
            )

        current_status = normalize_tahun_status(db_obj.status)
        if current_status == "closed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tahun anggaran yang sudah ditutup (closed) bersifat final dan tidak dapat diubah",
            )

        update_data = obj_in.model_dump(exclude_unset=True)
        konfirmasi_tutup_tahun = update_data.pop("konfirmasi_tutup_tahun", None)

        # If tahun is updated, ensure uniqueness and prevent modifying year if active/closed
        if "tahun" in update_data and update_data["tahun"] != db_obj.tahun:
            if current_status in ["active", "closed"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Nomor tahun anggaran tidak dapat diubah karena status tahun sudah '{current_status}'",
                )
            existing = await self.get_by_tahun(db, update_data["tahun"])
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Tahun anggaran {update_data['tahun']} sudah digunakan",
                )

        # Validate Lifecycle State Transitions (draft -> active -> closed)
        if "status" in update_data and update_data["status"] != current_status:
            new_status = update_data["status"]
            allowed_transitions = {
                "draft": ["active", "closed"],
                "active": ["closed"],
                "closed": [],
            }
            if new_status not in allowed_transitions.get(current_status, []):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Transisi status tahun anggaran dari '{current_status}' ke '{new_status}' tidak diizinkan",
                )
            if current_status == "active" and new_status == "closed":
                if konfirmasi_tutup_tahun is not None and konfirmasi_tutup_tahun != db_obj.tahun:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Konfirmasi tutup tahun harus sesuai dengan tahun anggaran {db_obj.tahun}",
                    )

        # Date check
        tgl_mulai = update_data.get("tanggal_mulai", db_obj.tanggal_mulai)
        tgl_selesai = update_data.get("tanggal_selesai", db_obj.tanggal_selesai)
        if tgl_mulai >= tgl_selesai:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tanggal mulai harus lebih awal dari tanggal selesai",
            )

        if update_data.get("status") == "active" and current_status != "active":
            await self.switch_active_fiscal_year(
                db,
                target_id=db_obj.id_tahun_anggaran,
                current_user_id=current_user_id,
                current_user_name=current_user_name,
                alasan="Update status Tahun Anggaran menjadi active",
            )
            update_data.pop("status", None)

        for field, val in update_data.items():
            setattr(db_obj, field, val)

        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def delete_tahun(self, db: AsyncSession, *, id_tahun: int) -> TahunAnggaran:
        db_obj = await self.get(db, id_tahun)
        if not db_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tahun anggaran tidak ditemukan",
            )

        if normalize_tahun_status(db_obj.status) in ("active", "closed"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Tahun anggaran berstatus '{db_obj.status}' tidak dapat dihapus",
            )

        from sqlalchemy import delete as sql_delete
        pagus = (
            await db.scalars(select(PaguAnggaran).where(PaguAnggaran.id_tahun_anggaran == id_tahun))
        ).all()
        if pagus:
            pagu_ids = [p.id_pagu for p in pagus]
            has_nonzero = any((p.pagu_awal or 0) > 0 or (p.pagu_aktif or 0) > 0 for p in pagus)
            real_cnt = await db.scalar(select(func.count(RealisasiAnggaran.id_realisasi)).where(RealisasiAnggaran.id_pagu.in_(pagu_ids))) or 0
            rev_cnt = await db.scalar(select(func.count(RevisiAnggaran.id_revisi)).where(RevisiAnggaran.id_pagu.in_(pagu_ids))) or 0
            if has_nonzero or real_cnt > 0 or rev_cnt > 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Tahun anggaran tidak dapat dihapus karena masih memiliki alokasi pagu, revisi, atau realisasi anggaran",
                )
            # Cleanly remove untouched zero-value auto-generated pagu rows for draft years
            await db.execute(sql_delete(PaguAnggaran).where(PaguAnggaran.id_pagu.in_(pagu_ids)))

        await db.delete(db_obj)
        await db.commit()
        return db_obj

    async def get_filtered(
        self,
        db: AsyncSession,
        *,
        search: Optional[str] = None,
        status: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> Tuple[List[Dict[str, Any]], int]:
        conditions = []
        if status:
            conditions.append(TahunAnggaran.status == status)
        if search and search.strip():
            term = f"%{search.strip()}%"
            # Support search by deskripsi or string representation of tahun
            conditions.append(
                or_(
                    TahunAnggaran.deskripsi.ilike(term),
                    func.cast(TahunAnggaran.tahun, String).ilike(term)
                )
            )

        # Count total
        count_stmt = select(func.count(TahunAnggaran.id_tahun_anggaran))
        if conditions:
            count_stmt = count_stmt.where(*conditions)
        count_res = await db.execute(count_stmt)
        total = count_res.scalar_one() or 0

        # Query items
        stmt = (
            select(TahunAnggaran)
            .options(selectinload(TahunAnggaran.pembuat))
            .order_by(desc(TahunAnggaran.tahun))
            .offset(skip)
            .limit(limit)
        )
        if conditions:
            stmt = stmt.where(*conditions)
        res = await db.execute(stmt)
        items = list(res.scalars().all())

        enriched_items = []
        for t in items:
            enriched = await self.enrich_tahun_response(db, t)
            enriched_items.append(enriched)

        return enriched_items, total

    async def enrich_tahun_response(self, db: AsyncSession, t: TahunAnggaran) -> Dict[str, Any]:
        # Count total pagu aktif for this year
        pagu_sum_stmt = select(
            func.coalesce(func.sum(PaguAnggaran.pagu_aktif), Decimal("0.00")),
            func.count(PaguAnggaran.id_pagu)
        ).where(PaguAnggaran.id_tahun_anggaran == t.id_tahun_anggaran)
        pagu_res = await db.execute(pagu_sum_stmt)
        row = pagu_res.first()
        total_pagu = Decimal(str(row[0] or 0))
        jumlah_akun = int(row[1] or 0)

        # Sum verified realizations for this year
        realisasi_sum_stmt = (
            select(func.coalesce(func.sum(RealisasiAnggaran.jumlah_realisasi), Decimal("0.00")))
            .join(PaguAnggaran, RealisasiAnggaran.id_pagu == PaguAnggaran.id_pagu)
            .where(
                PaguAnggaran.id_tahun_anggaran == t.id_tahun_anggaran,
                RealisasiAnggaran.status == "verified",
            )
        )
        real_res = await db.execute(realisasi_sum_stmt)
        total_verified = Decimal(str(real_res.scalar_one() or 0))

        sisa = total_pagu - total_verified
        persentase = float((total_verified / total_pagu) * 100) if total_pagu > 0 else 0.0

        nama_pembuat = None
        if t.id_pegawai_pembuat:
            pegawai_obj = await db.get(Pegawai, t.id_pegawai_pembuat)
            if pegawai_obj:
                nama_pembuat = pegawai_obj.nama

        return {
            "id_tahun_anggaran": t.id_tahun_anggaran,
            "tahun": t.tahun,
            "status": normalize_tahun_status(t.status),
            "tanggal_mulai": t.tanggal_mulai,
            "tanggal_selesai": t.tanggal_selesai,
            "deskripsi": t.deskripsi,
            "id_pegawai_pembuat": t.id_pegawai_pembuat,
            "nama_pembuat": nama_pembuat,
            "total_pagu": total_pagu,
            "total_realisasi_verified": total_verified,
            "sisa_anggaran": sisa,
            "persentase_serapan": round(persentase, 2),
            "jumlah_akun": jumlah_akun,
            "created_at": t.created_at,
            "updated_at": t.updated_at,
        }


# =========================================================
# 2. AKUN ANGGARAN SERVICE
# =========================================================

class CRUDAkunAnggaran(CRUDBase[AkunAnggaran, AkunAnggaranCreate, AkunAnggaranUpdate]):
    async def get_by_kode(self, db: AsyncSession, kode_akun: str) -> Optional[AkunAnggaran]:
        stmt = select(AkunAnggaran).options(selectinload(AkunAnggaran.bagian)).where(AkunAnggaran.kode_akun == kode_akun.strip())
        res = await db.execute(stmt)
        return res.scalars().first()

    async def get_by_bagian_kode(self, db: AsyncSession, id_bagian: int, kode_akun: str) -> Optional[AkunAnggaran]:
        stmt = (
            select(AkunAnggaran)
            .options(selectinload(AkunAnggaran.bagian))
            .where(AkunAnggaran.id_bagian == id_bagian, AkunAnggaran.kode_akun == kode_akun.strip())
        )
        res = await db.execute(stmt)
        return res.scalar_one_or_none()

    async def get_detail(self, db: AsyncSession, id_akun: int) -> Optional[AkunAnggaran]:
        stmt = select(AkunAnggaran).options(selectinload(AkunAnggaran.bagian)).where(AkunAnggaran.id_akun_anggaran == id_akun)
        res = await db.execute(stmt)
        return res.scalar_one_or_none()

    async def create_akun(self, db: AsyncSession, *, obj_in: AkunAnggaranCreate) -> AkunAnggaran:
        # Check bagian existence
        bagian = await db.get(Bagian, obj_in.id_bagian)
        if not bagian:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Bagian dengan ID {obj_in.id_bagian} tidak ditemukan",
            )

        # Check composite uniqueness (id_bagian, kode_akun) per DIPA/POK structure
        existing = await self.get_by_bagian_kode(db, obj_in.id_bagian, obj_in.kode_akun)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Kode akun {obj_in.kode_akun} sudah digunakan pada bagian {bagian.nama_bagian}",
            )

        db_obj = AkunAnggaran(
            id_bagian=obj_in.id_bagian,
            kode_akun=obj_in.kode_akun.strip(),
            nama_akun=obj_in.nama_akun.strip(),
            total_pagu=obj_in.total_pagu or Decimal("0.00"),  # Legacy preserved
            jenis_belanja=obj_in.jenis_belanja,
            program=obj_in.program,
            sub_program=obj_in.sub_program,
            status=obj_in.status,
        )
        db.add(db_obj)
        await db.flush()  # Flush to generate id_akun_anggaran within current transaction

        # Auto-create Pagu Anggaran for all relevant fiscal years (status in 'draft', 'active') (PHASE 5)
        # Note: 'closed' fiscal years are historical and must never receive new pagu allocations.
        # Only create pagu if the newly created account has status == 'active'.
        if db_obj.status == "active":
            relevant_years_stmt = (
                select(TahunAnggaran)
                .where(TahunAnggaran.status.in_(["draft", "active"]))
                .order_by(TahunAnggaran.tahun.asc())
            )
            years_res = await db.execute(relevant_years_stmt)
            relevant_years = list(years_res.scalars().all())

            if relevant_years:
                # Query existing pagu for this account to guarantee idempotency against duplicates
                existing_pagu_stmt = select(PaguAnggaran.id_tahun_anggaran).where(
                    PaguAnggaran.id_akun_anggaran == db_obj.id_akun_anggaran
                )
                existing_pagu_res = await db.execute(existing_pagu_stmt)
                existing_year_ids = set(existing_pagu_res.scalars().all())

                for yr in relevant_years:
                    if yr.id_tahun_anggaran not in existing_year_ids:
                        pagu_item = PaguAnggaran(
                            id_tahun_anggaran=yr.id_tahun_anggaran,
                            id_akun_anggaran=db_obj.id_akun_anggaran,
                            pagu_awal=Decimal("0.00"),
                            pagu_aktif=Decimal("0.00"),
                            nomor_sk=None,
                            tanggal_sk=None,
                            keterangan=f"Alokasi Pagu Awal TA {yr.tahun}",
                        )
                        db.add(pagu_item)

        await db.commit()
        await db.refresh(db_obj)
        return await self.get_detail(db, db_obj.id_akun_anggaran)

    async def update_akun(self, db: AsyncSession, *, id_akun: int, obj_in: AkunAnggaranUpdate) -> AkunAnggaran:
        db_obj = await self.get(db, id_akun)
        if not db_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Akun anggaran tidak ditemukan",
            )

        update_data = obj_in.model_dump(exclude_unset=True)

        if "id_bagian" in update_data and update_data["id_bagian"] != db_obj.id_bagian:
            bagian = await db.get(Bagian, update_data["id_bagian"])
            if not bagian:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Bagian dengan ID {update_data['id_bagian']} tidak ditemukan",
                )

        target_bagian = update_data.get("id_bagian", db_obj.id_bagian)
        target_kode = update_data.get("kode_akun", db_obj.kode_akun)
        if target_bagian != db_obj.id_bagian or target_kode != db_obj.kode_akun:
            existing = await self.get_by_bagian_kode(db, target_bagian, target_kode)
            if existing and existing.id_akun_anggaran != id_akun:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Kode akun {target_kode} sudah digunakan pada bagian tujuan",
                )

        for field, val in update_data.items():
            setattr(db_obj, field, val)

        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return await self.get_detail(db, db_obj.id_akun_anggaran)

    async def delete_akun(self, db: AsyncSession, *, id_akun: int) -> AkunAnggaran:
        db_obj = await self.get(db, id_akun)
        if not db_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Akun anggaran tidak ditemukan",
            )

        # Tolak jika akun sudah memiliki transaksi realisasi
        real_cnt_stmt = select(func.count(RealisasiAnggaran.id_realisasi)).where(
            RealisasiAnggaran.id_akun_anggaran == id_akun
        )
        if (await db.scalar(real_cnt_stmt) or 0) > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Akun anggaran tidak dapat dihapus karena sudah memiliki transaksi realisasi",
            )

        # Periksa seluruh pagu terkait: tolak jika sudah punya revisi, pagu > 0, atau milik tahun closed
        from sqlalchemy import delete
        pagus = (
            await db.scalars(
                select(PaguAnggaran)
                .options(selectinload(PaguAnggaran.tahun_anggaran))
                .where(PaguAnggaran.id_akun_anggaran == id_akun)
            )
        ).all()
        if pagus:
            pagu_ids = [p.id_pagu for p in pagus]
            rev_cnt = await db.scalar(
                select(func.count(RevisiAnggaran.id_revisi)).where(RevisiAnggaran.id_pagu.in_(pagu_ids))
            ) or 0
            if rev_cnt > 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Akun anggaran tidak dapat dihapus karena sudah memiliki riwayat revisi DIPA/anggaran",
                )
            for p in pagus:
                if (p.pagu_awal or 0) > 0 or (p.pagu_aktif or 0) > 0:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Akun anggaran tidak dapat dihapus karena masih memiliki alokasi pagu aktif/awal",
                    )
                if p.tahun_anggaran and normalize_tahun_status(p.tahun_anggaran.status) == "closed":
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Akun anggaran tidak dapat dihapus karena terhubung dengan tahun anggaran yang sudah ditutup",
                    )
            await db.execute(delete(PaguAnggaran).where(PaguAnggaran.id_pagu.in_(pagu_ids)))

        await db.delete(db_obj)
        await db.commit()
        return db_obj

    async def get_filtered(
        self,
        db: AsyncSession,
        *,
        kode_akun: Optional[str] = None,
        nama_akun: Optional[str] = None,
        id_bagian: Optional[int] = None,
        jenis_belanja: Optional[str] = None,
        program: Optional[str] = None,
        sub_program: Optional[str] = None,
        status: Optional[str] = None,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> Tuple[List[Dict[str, Any]], int]:
        conditions = []
        if kode_akun:
            conditions.append(AkunAnggaran.kode_akun == kode_akun.strip())
        if nama_akun:
            conditions.append(AkunAnggaran.nama_akun.ilike(f"%{nama_akun.strip()}%"))
        if id_bagian is not None:
            conditions.append(AkunAnggaran.id_bagian == id_bagian)
        if jenis_belanja:
            conditions.append(AkunAnggaran.jenis_belanja == jenis_belanja.strip())
        if program:
            conditions.append(AkunAnggaran.program.ilike(f"%{program.strip()}%"))
        if sub_program:
            conditions.append(AkunAnggaran.sub_program.ilike(f"%{sub_program.strip()}%"))
        if status:
            conditions.append(AkunAnggaran.status == status)
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(
                or_(
                    AkunAnggaran.kode_akun.ilike(term),
                    AkunAnggaran.nama_akun.ilike(term),
                    AkunAnggaran.program.ilike(term),
                )
            )

        count_stmt = select(func.count(AkunAnggaran.id_akun_anggaran))
        if conditions:
            count_stmt = count_stmt.where(*conditions)
        count_res = await db.execute(count_stmt)
        total = count_res.scalar_one() or 0

        stmt = (
            select(AkunAnggaran)
            .options(selectinload(AkunAnggaran.bagian))
            .order_by(AkunAnggaran.kode_akun.asc())
            .offset(skip)
            .limit(limit)
        )
        if conditions:
            stmt = stmt.where(*conditions)
        res = await db.execute(stmt)
        items = list(res.scalars().all())

        enriched_items = []
        for a in items:
            enriched_items.append({
                "id_akun_anggaran": a.id_akun_anggaran,
                "id_bagian": a.id_bagian,
                "kode_akun": a.kode_akun,
                "nama_akun": a.nama_akun,
                "total_pagu": a.total_pagu or Decimal("0.00"),
                "jenis_belanja": a.jenis_belanja,
                "program": a.program,
                "sub_program": a.sub_program,
                "status": a.status,
                "nama_bagian": a.bagian.nama_bagian if a.bagian else None,
                "kode_bagian": a.bagian.kode_bagian if a.bagian else None,
                "created_at": a.created_at,
                "updated_at": a.updated_at,
            })

        return enriched_items, total

    def enrich_akun_response(self, a: AkunAnggaran) -> Dict[str, Any]:
        return {
            "id_akun_anggaran": a.id_akun_anggaran,
            "id_bagian": a.id_bagian,
            "kode_akun": a.kode_akun,
            "nama_akun": a.nama_akun,
            "total_pagu": a.total_pagu or Decimal("0.00"),
            "jenis_belanja": a.jenis_belanja,
            "program": a.program,
            "sub_program": a.sub_program,
            "status": a.status,
            "nama_bagian": a.bagian.nama_bagian if a.bagian else None,
            "kode_bagian": a.bagian.kode_bagian if a.bagian else None,
            "created_at": a.created_at,
            "updated_at": a.updated_at,
        }


# =========================================================
# 3. PAGU ANGGARAN SERVICE
# =========================================================

class CRUDPaguAnggaran(CRUDBase[PaguAnggaran, PaguAnggaranCreate, PaguAnggaranUpdate]):
    async def get_by_tahun_akun(self, db: AsyncSession, id_tahun: int, id_akun: int) -> Optional[PaguAnggaran]:
        stmt = (
            select(PaguAnggaran)
            .where(
                PaguAnggaran.id_tahun_anggaran == id_tahun,
                PaguAnggaran.id_akun_anggaran == id_akun,
            )
        )
        res = await db.execute(stmt)
        return res.scalar_one_or_none()

    async def get_detail(self, db: AsyncSession, id_pagu: int) -> Optional[PaguAnggaran]:
        stmt = (
            select(PaguAnggaran)
            .options(
                selectinload(PaguAnggaran.tahun_anggaran),
                selectinload(PaguAnggaran.akun_anggaran).selectinload(AkunAnggaran.bagian),
            )
            .where(PaguAnggaran.id_pagu == id_pagu)
        )
        res = await db.execute(stmt)
        return res.scalar_one_or_none()

    async def create_pagu(self, db: AsyncSession, *, obj_in: PaguAnggaranCreate) -> PaguAnggaran:
        # Check TahunAnggaran
        tahun = await db.get(TahunAnggaran, obj_in.id_tahun_anggaran)
        if not tahun:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tahun anggaran tidak ditemukan",
            )
        if tahun.status == "closed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tidak dapat membuat alokasi pagu pada tahun anggaran yang sudah ditutup (closed)",
            )

        # Check AkunAnggaran
        akun = await db.get(AkunAnggaran, obj_in.id_akun_anggaran)
        if not akun:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Akun anggaran tidak ditemukan",
            )

        # Check unique constraint (id_tahun_anggaran, id_akun_anggaran)
        existing = await self.get_by_tahun_akun(db, obj_in.id_tahun_anggaran, obj_in.id_akun_anggaran)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Alokasi pagu untuk akun '{akun.kode_akun}' pada tahun {tahun.tahun} sudah ada",
            )

        pagu_awal = obj_in.pagu_awal
        pagu_aktif = obj_in.pagu_aktif if obj_in.pagu_aktif is not None else pagu_awal
        pagu_blokir = getattr(obj_in, "pagu_blokir", Decimal("0.00")) or Decimal("0.00")
        if pagu_blokir > pagu_aktif:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nilai pagu blokir tidak boleh melebihi pagu aktif",
            )

        db_obj = PaguAnggaran(
            id_tahun_anggaran=obj_in.id_tahun_anggaran,
            id_akun_anggaran=obj_in.id_akun_anggaran,
            pagu_awal=pagu_awal,
            pagu_aktif=pagu_aktif,
            pagu_blokir=pagu_blokir,
            rpd_triwulan_1=getattr(obj_in, "rpd_triwulan_1", Decimal("0.00")) or Decimal("0.00"),
            rpd_triwulan_2=getattr(obj_in, "rpd_triwulan_2", Decimal("0.00")) or Decimal("0.00"),
            rpd_triwulan_3=getattr(obj_in, "rpd_triwulan_3", Decimal("0.00")) or Decimal("0.00"),
            rpd_triwulan_4=getattr(obj_in, "rpd_triwulan_4", Decimal("0.00")) or Decimal("0.00"),
            nomor_sk=obj_in.nomor_sk,
            tanggal_sk=obj_in.tanggal_sk,
            keterangan=obj_in.keterangan,
        )
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return await self.get_detail(db, db_obj.id_pagu)

    async def update_pagu(self, db: AsyncSession, *, id_pagu: int, obj_in: PaguAnggaranUpdate) -> PaguAnggaran:
        db_obj = await self.get(db, id_pagu)
        if not db_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pagu anggaran tidak ditemukan",
            )

        # Check fiscal year status: cannot modify pagu on closed years
        tahun = await db.get(TahunAnggaran, db_obj.id_tahun_anggaran)
        if tahun and tahun.status == "closed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Tidak dapat mengubah alokasi pagu pada tahun anggaran {tahun.tahun} yang sudah ditutup (closed)",
            )

        update_data = obj_in.model_dump(exclude_unset=True)
        if "pagu_blokir" in update_data and update_data["pagu_blokir"] is not None:
            new_blokir = Decimal(str(update_data["pagu_blokir"]))
            verified_total = Decimal(
                str(
                    (
                        await db.scalar(
                            select(func.coalesce(func.sum(RealisasiAnggaran.jumlah_realisasi), Decimal("0.00")))
                            .where(RealisasiAnggaran.id_pagu == id_pagu, RealisasiAnggaran.status == "verified")
                        )
                    )
                    or 0
                )
            )
            if (db_obj.pagu_aktif or Decimal("0.00")) - new_blokir < verified_total:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Pagu blokir tidak valid: pagu efektif akan lebih kecil dari realisasi terverifikasi ({verified_total:,.2f})",
                )
        for field, val in update_data.items():
            setattr(db_obj, field, val)

        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return await self.get_detail(db, db_obj.id_pagu)

    async def delete_pagu(self, db: AsyncSession, *, id_pagu: int) -> PaguAnggaran:
        db_obj = await self.get(db, id_pagu)
        if not db_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pagu anggaran tidak ditemukan",
            )

        # Check fiscal year status: cannot delete pagu on closed years
        tahun = await db.get(TahunAnggaran, db_obj.id_tahun_anggaran)
        if tahun and tahun.status == "closed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Tidak dapat menghapus alokasi pagu pada tahun anggaran {tahun.tahun} yang sudah ditutup (closed)",
            )

        # Check references in realisasi_anggaran
        real_cnt_stmt = select(func.count(RealisasiAnggaran.id_realisasi)).where(RealisasiAnggaran.id_pagu == id_pagu)
        real_res = await db.execute(real_cnt_stmt)
        if (real_res.scalar_one() or 0) > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Pagu anggaran tidak dapat dihapus karena sudah memiliki transaksi realisasi",
            )

        # Check references in revisi_anggaran
        rev_cnt_stmt = select(func.count(RevisiAnggaran.id_revisi)).where(RevisiAnggaran.id_pagu == id_pagu)
        rev_res = await db.execute(rev_cnt_stmt)
        if (rev_res.scalar_one() or 0) > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Pagu anggaran tidak dapat dihapus karena sudah memiliki riwayat revisi",
            )

        await db.delete(db_obj)
        await db.commit()
        return db_obj

    async def get_filtered(
        self,
        db: AsyncSession,
        *,
        id_tahun_anggaran: Optional[int] = None,
        id_akun_anggaran: Optional[int] = None,
        id_bagian: Optional[int] = None,
        status_tahun: Optional[str] = None,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> Tuple[List[Dict[str, Any]], int]:
        conditions = []
        if id_tahun_anggaran:
            conditions.append(PaguAnggaran.id_tahun_anggaran == id_tahun_anggaran)
        if id_akun_anggaran:
            conditions.append(PaguAnggaran.id_akun_anggaran == id_akun_anggaran)
        if status_tahun:
            conditions.append(PaguAnggaran.tahun_anggaran.has(TahunAnggaran.status == status_tahun))
        if id_bagian is not None:
            conditions.append(PaguAnggaran.akun_anggaran.has(AkunAnggaran.id_bagian == id_bagian))
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(
                PaguAnggaran.akun_anggaran.has(
                    or_(
                        AkunAnggaran.kode_akun.ilike(term),
                        AkunAnggaran.nama_akun.ilike(term),
                    )
                )
            )

        count_stmt = select(func.count(PaguAnggaran.id_pagu))
        if conditions:
            count_stmt = count_stmt.where(*conditions)
        count_res = await db.execute(count_stmt)
        total = count_res.scalar_one() or 0

        stmt = (
            select(PaguAnggaran)
            .options(
                selectinload(PaguAnggaran.tahun_anggaran),
                selectinload(PaguAnggaran.akun_anggaran).selectinload(AkunAnggaran.bagian),
            )
            .order_by(PaguAnggaran.id_pagu.desc())
            .offset(skip)
            .limit(limit)
        )
        if conditions:
            stmt = stmt.where(*conditions)
        res = await db.execute(stmt)
        items = list(res.scalars().all())

        # One aggregate per page instead of one SQL SUM per pagu (N+1).
        totals = {}
        if items:
            grouped = await db.execute(select(RealisasiAnggaran.id_pagu,
                func.sum(RealisasiAnggaran.jumlah_realisasi)).where(
                    RealisasiAnggaran.id_pagu.in_([p.id_pagu for p in items]),
                    RealisasiAnggaran.status == "verified").group_by(RealisasiAnggaran.id_pagu))
            totals = {ident: Decimal(str(amount or 0)) for ident, amount in grouped.all()}
        enriched_items = []
        for p in items:
            total_verified = totals.get(p.id_pagu, Decimal("0.00"))

            pagu_aktif = p.pagu_aktif or Decimal("0.00")
            pagu_blokir = p.pagu_blokir or Decimal("0.00")
            pagu_efektif = pagu_aktif - pagu_blokir
            sisa = pagu_efektif - total_verified
            persentase = float((total_verified / pagu_aktif) * 100) if pagu_aktif > 0 else 0.0

            enriched_items.append({
                "id_pagu": p.id_pagu,
                "id_tahun_anggaran": p.id_tahun_anggaran,
                "id_akun_anggaran": p.id_akun_anggaran,
                "pagu_awal": p.pagu_awal,
                "pagu_aktif": pagu_aktif,
                "pagu_blokir": pagu_blokir,
                "pagu_efektif": pagu_efektif,
                "rpd_triwulan_1": p.rpd_triwulan_1 or Decimal("0.00"),
                "rpd_triwulan_2": p.rpd_triwulan_2 or Decimal("0.00"),
                "rpd_triwulan_3": p.rpd_triwulan_3 or Decimal("0.00"),
                "rpd_triwulan_4": p.rpd_triwulan_4 or Decimal("0.00"),
                "nomor_sk": p.nomor_sk,
                "tanggal_sk": p.tanggal_sk,
                "keterangan": p.keterangan,
                "created_at": p.created_at,
                "updated_at": p.updated_at,
                "tahun": p.tahun_anggaran.tahun if p.tahun_anggaran else None,
                "kode_akun": p.akun_anggaran.kode_akun if p.akun_anggaran else None,
                "nama_akun": p.akun_anggaran.nama_akun if p.akun_anggaran else None,
                "nama_bagian": p.akun_anggaran.bagian.nama_bagian if (p.akun_anggaran and p.akun_anggaran.bagian) else None,
                "total_realisasi_verified": total_verified,
                "sisa_anggaran": sisa,
                "persentase_serapan": round(persentase, 2),
            })

        return enriched_items, total

    async def enrich_pagu_response(self, db: AsyncSession, p: PaguAnggaran) -> Dict[str, Any]:
        sum_stmt = (
            select(func.coalesce(func.sum(RealisasiAnggaran.jumlah_realisasi), Decimal("0.00")))
            .where(
                RealisasiAnggaran.id_pagu == p.id_pagu,
                RealisasiAnggaran.status == "verified",
            )
        )
        sum_res = await db.execute(sum_stmt)
        total_verified = Decimal(str(sum_res.scalar_one() or 0))

        pagu_aktif = p.pagu_aktif or Decimal("0.00")
        pagu_blokir = p.pagu_blokir or Decimal("0.00")
        pagu_efektif = pagu_aktif - pagu_blokir
        sisa = pagu_efektif - total_verified
        persentase = float((total_verified / pagu_aktif) * 100) if pagu_aktif > 0 else 0.0

        return {
            "id_pagu": p.id_pagu,
            "id_tahun_anggaran": p.id_tahun_anggaran,
            "id_akun_anggaran": p.id_akun_anggaran,
            "pagu_awal": p.pagu_awal,
            "pagu_aktif": pagu_aktif,
            "pagu_blokir": pagu_blokir,
            "pagu_efektif": pagu_efektif,
            "rpd_triwulan_1": p.rpd_triwulan_1 or Decimal("0.00"),
            "rpd_triwulan_2": p.rpd_triwulan_2 or Decimal("0.00"),
            "rpd_triwulan_3": p.rpd_triwulan_3 or Decimal("0.00"),
            "rpd_triwulan_4": p.rpd_triwulan_4 or Decimal("0.00"),
            "nomor_sk": p.nomor_sk,
            "tanggal_sk": p.tanggal_sk,
            "keterangan": p.keterangan,
            "created_at": p.created_at,
            "updated_at": p.updated_at,
            "tahun": p.tahun_anggaran.tahun if p.tahun_anggaran else None,
            "kode_akun": p.akun_anggaran.kode_akun if p.akun_anggaran else None,
            "nama_akun": p.akun_anggaran.nama_akun if p.akun_anggaran else None,
            "nama_bagian": p.akun_anggaran.bagian.nama_bagian if (p.akun_anggaran and p.akun_anggaran.bagian) else None,
            "total_realisasi_verified": total_verified,
            "sisa_anggaran": sisa,
            "persentase_serapan": round(persentase, 2),
        }


# =========================================================
# 4. REVISI ANGGARAN SERVICE (ATOMIC TRANSACTION)
# =========================================================

class CRUDRevisiAnggaran(CRUDBase[RevisiAnggaran, RevisiAnggaranCreate, RevisiAnggaranCreate]):
    async def create_revisi(
        self,
        db: AsyncSession,
        *,
        obj_in: RevisiAnggaranCreate,
        id_pegawai: int,
    ) -> RevisiAnggaran:
        """
        Executes atomic budget revision:
        1. Lock & fetch PaguAnggaran
        2. Snapshot pagu_sebelum = pagu_aktif
        3. Insert immutable RevisiAnggaran row
        4. Update PaguAnggaran.pagu_aktif = pagu_baru
        5. Single transaction commit
        """
        # Validate Pegawai
        pegawai = await db.get(Pegawai, id_pegawai)
        if not pegawai:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Pegawai dengan ID {id_pegawai} tidak ditemukan",
            )

        # Lock PaguAnggaran row for atomic update
        pagu_stmt = (
            select(PaguAnggaran)
            .options(selectinload(PaguAnggaran.tahun_anggaran))
            .where(PaguAnggaran.id_pagu == obj_in.id_pagu)
            .with_for_update()
        )
        pagu_res = await db.execute(pagu_stmt)
        pagu = pagu_res.scalar_one_or_none()
        if not pagu:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pagu anggaran tidak ditemukan",
            )

        if pagu.tahun_anggaran.status == "closed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tidak dapat merevisi pagu pada tahun anggaran yang sudah ditutup (closed)",
            )

        # Snapshot current active budget
        pagu_sebelum = pagu.pagu_aktif or Decimal("0.00")
        pagu_sesudah = obj_in.pagu_baru
        if pagu_sesudah == pagu_sebelum:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nilai pagu baru tidak boleh sama dengan pagu aktif saat ini",
            )

        # If reducing budget, verify it doesn't drop below verified realization
        sum_stmt = (
            select(func.coalesce(func.sum(RealisasiAnggaran.jumlah_realisasi), Decimal("0.00")))
            .where(
                RealisasiAnggaran.id_pagu == obj_in.id_pagu,
                RealisasiAnggaran.status == "verified",
            )
            .with_for_update(read=True)
        )
        sum_res = await db.execute(sum_stmt)
        verified_total = Decimal(str(sum_res.scalar_one() or 0))

        pagu_blokir = pagu.pagu_blokir or Decimal("0.00")
        if pagu_sesudah - pagu_blokir < verified_total:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Pagu efektif setelah revisi ({pagu_sesudah - pagu_blokir:,.2f}) tidak boleh lebih kecil dari total realisasi terverifikasi ({verified_total:,.2f})",
            )

        # 1. Insert immutable revision record
        revisi_obj = RevisiAnggaran(
            id_pagu=obj_in.id_pagu,
            id_pegawai=id_pegawai,
            nomor_revisi=obj_in.nomor_revisi.strip(),
            tanggal_revisi=obj_in.tanggal_revisi,
            pagu_sebelum=pagu_sebelum,
            pagu_sesudah=pagu_sesudah,
            alasan_revisi=obj_in.alasan_revisi.strip(),
            jenis_revisi=getattr(obj_in, "jenis_revisi", "DIPA") or "DIPA",
        )
        db.add(revisi_obj)
        await db.flush()

        # 2. Update pagu_aktif
        pagu.pagu_aktif = pagu_sesudah
        db.add(pagu)

        # 3. Record in FinancialAuditLog
        from app.models.operations import FinancialAuditLog
        db.add(FinancialAuditLog(
            id_pegawai=id_pegawai,
            nama_pegawai=pegawai.nama,
            aksi="REVISI_PAGU",
            nama_tabel="revisi_anggaran",
            id_entitas=revisi_obj.id_revisi,
            id_tahun_anggaran=pagu.id_tahun_anggaran,
            tahun=pagu.tahun_anggaran.tahun if pagu.tahun_anggaran else None,
            nilai_sebelum={"id_pagu": pagu.id_pagu, "pagu_aktif": str(pagu_sebelum)},
            nilai_sesudah={"id_pagu": pagu.id_pagu, "pagu_aktif": str(pagu_sesudah), "nomor_revisi": revisi_obj.nomor_revisi},
            alasan=revisi_obj.alasan_revisi,
        ))

        # Single atomic commit
        await db.commit()
        return await self.get_detail(db, revisi_obj.id_revisi)

    async def create_revisi_pok(
        self,
        db: AsyncSession,
        *,
        obj_in: Any,
        id_pegawai: int,
    ) -> Tuple[str, RevisiAnggaran, RevisiAnggaran]:
        """Atomic balanced (zero-sum) POK budget shift between two pagus in the same non-closed fiscal year."""
        from uuid import uuid4
        if obj_in.id_pagu_asal == obj_in.id_pagu_tujuan:
            raise HTTPException(400, "Pagu asal dan pagu tujuan tidak boleh sama")
        pegawai = await db.get(Pegawai, id_pegawai)
        if not pegawai:
            raise HTTPException(404, f"Pegawai dengan ID {id_pegawai} tidak ditemukan")

        # Lock both pagus in sorted ID order to prevent deadlocks
        pagus: Dict[int, PaguAnggaran] = {}
        for pid in sorted([obj_in.id_pagu_asal, obj_in.id_pagu_tujuan]):
            res = await db.execute(
                select(PaguAnggaran)
                .options(selectinload(PaguAnggaran.tahun_anggaran))
                .where(PaguAnggaran.id_pagu == pid)
                .with_for_update()
            )
            p = res.scalar_one_or_none()
            if not p:
                raise HTTPException(404, f"Pagu anggaran dengan ID {pid} tidak ditemukan")
            pagus[pid] = p

        pagu_asal = pagus[obj_in.id_pagu_asal]
        pagu_tujuan = pagus[obj_in.id_pagu_tujuan]
        if pagu_asal.id_tahun_anggaran != pagu_tujuan.id_tahun_anggaran:
            raise HTTPException(400, "Pergeseran POK hanya diperbolehkan antar pagu dalam tahun anggaran yang sama")
        if normalize_tahun_status(pagu_asal.tahun_anggaran.status) == "closed":
            raise HTTPException(400, "Tidak dapat melakukan pergeseran POK pada tahun anggaran yang sudah ditutup")

        verified_asal = Decimal(
            str(
                (
                    await db.scalar(
                        select(func.coalesce(func.sum(RealisasiAnggaran.jumlah_realisasi), Decimal("0.00")))
                        .where(RealisasiAnggaran.id_pagu == pagu_asal.id_pagu, RealisasiAnggaran.status == "verified")
                    )
                )
                or 0
            )
        )
        asal_sebelum = pagu_asal.pagu_aktif or Decimal("0.00")
        asal_blokir = pagu_asal.pagu_blokir or Decimal("0.00")
        asal_sesudah = asal_sebelum - obj_in.nominal_geser
        if asal_sesudah - asal_blokir < verified_asal:
            raise HTTPException(
                400,
                f"Saldo pagu efektif asal tidak mencukupi untuk pergeseran sebesar {obj_in.nominal_geser:,.2f}",
            )

        tujuan_sebelum = pagu_tujuan.pagu_aktif or Decimal("0.00")
        tujuan_sesudah = tujuan_sebelum + obj_in.nominal_geser
        batch_kode = f"POK-{pagu_asal.tahun_anggaran.tahun}-{uuid4().hex[:8].upper()}"

        rev_asal = RevisiAnggaran(
            id_pagu=pagu_asal.id_pagu,
            id_pegawai=id_pegawai,
            nomor_revisi=obj_in.nomor_revisi.strip(),
            tanggal_revisi=obj_in.tanggal_revisi,
            pagu_sebelum=asal_sebelum,
            pagu_sesudah=asal_sesudah,
            alasan_revisi=f"[POK Keluar → Pagu #{pagu_tujuan.id_pagu}] {obj_in.alasan_revisi.strip()}",
            jenis_revisi="POK",
            batch_kode=batch_kode,
        )
        rev_tujuan = RevisiAnggaran(
            id_pagu=pagu_tujuan.id_pagu,
            id_pegawai=id_pegawai,
            nomor_revisi=obj_in.nomor_revisi.strip(),
            tanggal_revisi=obj_in.tanggal_revisi,
            pagu_sebelum=tujuan_sebelum,
            pagu_sesudah=tujuan_sesudah,
            alasan_revisi=f"[POK Masuk ← Pagu #{pagu_asal.id_pagu}] {obj_in.alasan_revisi.strip()}",
            jenis_revisi="POK",
            batch_kode=batch_kode,
        )
        pagu_asal.pagu_aktif = asal_sesudah
        pagu_tujuan.pagu_aktif = tujuan_sesudah
        db.add_all([rev_asal, rev_tujuan, pagu_asal, pagu_tujuan])
        await db.flush()

        from app.models.operations import FinancialAuditLog
        db.add(
            FinancialAuditLog(
                id_pegawai=id_pegawai,
                nama_pegawai=pegawai.nama,
                aksi="REVISI_POK",
                nama_tabel="revisi_anggaran",
                id_entitas=rev_asal.id_revisi,
                id_tahun_anggaran=pagu_asal.id_tahun_anggaran,
                tahun=pagu_asal.tahun_anggaran.tahun,
                nilai_sebelum={"pagu_asal": str(asal_sebelum), "pagu_tujuan": str(tujuan_sebelum)},
                nilai_sesudah={
                    "batch_kode": batch_kode,
                    "nominal_geser": str(obj_in.nominal_geser),
                    "pagu_asal": str(asal_sesudah),
                    "pagu_tujuan": str(tujuan_sesudah),
                },
                alasan=obj_in.alasan_revisi.strip(),
            )
        )
        await db.commit()
        return batch_kode, await self.get_detail(db, rev_asal.id_revisi), await self.get_detail(db, rev_tujuan.id_revisi)

    async def get_detail(self, db: AsyncSession, id_revisi: int) -> Optional[RevisiAnggaran]:
        stmt = (
            select(RevisiAnggaran)
            .options(
                selectinload(RevisiAnggaran.pegawai),
                selectinload(RevisiAnggaran.pagu_anggaran)
                .selectinload(PaguAnggaran.akun_anggaran)
                .selectinload(AkunAnggaran.bagian),
            )
            .where(RevisiAnggaran.id_revisi == id_revisi)
        )
        res = await db.execute(stmt)
        return res.scalar_one_or_none()

    async def get_history_by_pagu(self, db: AsyncSession, id_pagu: int) -> List[RevisiAnggaran]:
        stmt = (
            select(RevisiAnggaran)
            .options(
                selectinload(RevisiAnggaran.pegawai),
                selectinload(RevisiAnggaran.pagu_anggaran)
                .selectinload(PaguAnggaran.akun_anggaran)
                .selectinload(AkunAnggaran.bagian),
            )
            .where(RevisiAnggaran.id_pagu == id_pagu)
            .order_by(desc(RevisiAnggaran.tanggal_revisi), desc(RevisiAnggaran.id_revisi))
        )
        res = await db.execute(stmt)
        return list(res.scalars().all())

    async def get_filtered(
        self,
        db: AsyncSession,
        *,
        id_pagu: Optional[int] = None,
        id_tahun_anggaran: Optional[int] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> Tuple[List[Dict[str, Any]], int]:
        conditions = []
        if id_pagu:
            conditions.append(RevisiAnggaran.id_pagu == id_pagu)
        if id_tahun_anggaran:
            conditions.append(
                RevisiAnggaran.pagu_anggaran.has(PaguAnggaran.id_tahun_anggaran == id_tahun_anggaran)
            )

        count_stmt = select(func.count(RevisiAnggaran.id_revisi))
        if conditions:
            count_stmt = count_stmt.where(*conditions)
        count_res = await db.execute(count_stmt)
        total = count_res.scalar_one() or 0

        stmt = (
            select(RevisiAnggaran)
            .options(
                selectinload(RevisiAnggaran.pegawai),
                selectinload(RevisiAnggaran.pagu_anggaran)
                .selectinload(PaguAnggaran.akun_anggaran)
                .selectinload(AkunAnggaran.bagian),
            )
            .order_by(desc(RevisiAnggaran.tanggal_revisi), desc(RevisiAnggaran.id_revisi))
            .offset(skip)
            .limit(limit)
        )
        if conditions:
            stmt = stmt.where(*conditions)
        res = await db.execute(stmt)
        items = list(res.scalars().all())

        enriched = [self.enrich_revisi_response(r) for r in items]
        return enriched, total

    def enrich_revisi_response(self, r: RevisiAnggaran) -> Dict[str, Any]:
        perubahan = (r.pagu_sesudah or Decimal("0.00")) - (r.pagu_sebelum or Decimal("0.00"))
        akun = r.pagu_anggaran.akun_anggaran if r.pagu_anggaran else None
        return {
            "id_revisi": r.id_revisi,
            "id_pagu": r.id_pagu,
            "id_pegawai": r.id_pegawai,
            "nomor_revisi": r.nomor_revisi,
            "tanggal_revisi": r.tanggal_revisi,
            "pagu_sebelum": r.pagu_sebelum,
            "pagu_sesudah": r.pagu_sesudah,
            "perubahan_netto": perubahan,
            "alasan_revisi": r.alasan_revisi,
            "jenis_revisi": getattr(r, "jenis_revisi", None) or "DIPA",
            "batch_kode": getattr(r, "batch_kode", None),
            "nama_pegawai": r.pegawai.nama if r.pegawai else None,
            "kode_akun": akun.kode_akun if akun else None,
            "nama_akun": akun.nama_akun if akun else None,
            "nama_bagian": akun.bagian.nama_bagian if (akun and akun.bagian) else None,
            "created_at": r.created_at,
        }


# =========================================================
# 5. REALISASI ANGGARAN SERVICE (CONCURRENCY & ROW LOCKING)
# =========================================================

class CRUDRealisasiAnggaran(CRUDBase[RealisasiAnggaran, RealisasiAnggaranCreateDraft, RealisasiAnggaranUpdateDraft]):
    async def get_detail(self, db: AsyncSession, id_realisasi: int) -> Optional[RealisasiAnggaran]:
        stmt = (
            select(RealisasiAnggaran)
            .options(
                selectinload(RealisasiAnggaran.pagu_anggaran).selectinload(PaguAnggaran.tahun_anggaran),
                selectinload(RealisasiAnggaran.akun_anggaran).selectinload(AkunAnggaran.bagian),
                selectinload(RealisasiAnggaran.operator),
                selectinload(RealisasiAnggaran.verifier),
            )
            .where(RealisasiAnggaran.id_realisasi == id_realisasi)
        )
        res = await db.execute(stmt)
        return res.scalar_one_or_none()

    async def _audit(self, db, row, actor_id, action):
        from app.models.operations import BudgetEvent
        await db.flush()
        # Server-generated columns (created_at/updated_at) are expired by the flush;
        # load them asynchronously, otherwise reading them triggers sync IO (MissingGreenlet).
        await db.refresh(row)
        snapshot = {c.name: (str(value) if isinstance(value, (Decimal, date, datetime)) else value)
                    for c in row.__table__.columns if (value := getattr(row, c.name)) is not None}
        db.add(BudgetEvent(realization_id=row.id_realisasi, actor_id=actor_id,
                           action=action, snapshot=snapshot))

    async def _locked(self, db, ident):
        # Always lock the shared pagu first, then the transaction. This also matches
        # create/revision lock ordering and serializes competing approvals.
        pagu_id = await db.scalar(select(RealisasiAnggaran.id_pagu).where(
            RealisasiAnggaran.id_realisasi == ident))
        if pagu_id:
            await db.execute(select(PaguAnggaran).where(PaguAnggaran.id_pagu == pagu_id).with_for_update())
        return (await db.execute(select(RealisasiAnggaran).where(
            RealisasiAnggaran.id_realisasi == ident).with_for_update()
            .execution_options(populate_existing=True))).scalar_one_or_none()

    async def _validate_payload(self, db, pagu, data, owner_id, exclude_id=None, require_own_file=False):
        year = (await db.execute(select(TahunAnggaran).where(
            TahunAnggaran.id_tahun_anggaran == pagu.id_tahun_anggaran).with_for_update(read=True)
            .execution_options(populate_existing=True))).scalar_one_or_none()
        if not year or year.status != "active":
            raise HTTPException(409, "Tahun anggaran harus aktif")
        transaction_date = data["tanggal_transaksi"]
        if (transaction_date.year != year.tahun or
                not year.tanggal_mulai <= transaction_date <= year.tanggal_selesai):
            raise HTTPException(422, "Tanggal transaksi di luar tahun/periode anggaran")
        if not data["nomor_dokumen"].strip() or not data["uraian_kegiatan"].strip():
            raise HTTPException(422, "Nomor dokumen dan uraian wajib diisi")
        # Pagu lock serializes same-budget input/edit; locking read avoids stale snapshots.
        duplicate = select(RealisasiAnggaran.id_realisasi).where(
            RealisasiAnggaran.id_pagu == pagu.id_pagu,
            RealisasiAnggaran.nomor_dokumen == data["nomor_dokumen"].strip())
        if exclude_id is not None:
            duplicate = duplicate.where(RealisasiAnggaran.id_realisasi != exclude_id)
        if (await db.execute(duplicate.with_for_update())).first():
            raise HTTPException(409, "Nomor dokumen sudah tercatat pada pagu ini")
        path = data.get("bukti_file_path")
        if path:
            import re
            match = re.fullmatch(r"/api/v1/files/([1-9][0-9]*)", path)
            if require_own_file and not match:
                raise HTTPException(422, "Bukti harus berupa berkas yang diunggah melalui aplikasi")
            if match:
                record = await db.get(FileRecord, int(match[1]))
                if require_own_file and (not record or record.uploaded_by != owner_id):
                    # Attaching another user's upload would expose it through this transaction and the archive.
                    raise HTTPException(403, "Berkas bukti bukan milik pengguna")
                if record and record.uploaded_by == owner_id:
                    data.update(
                        bukti_file_nama=record.original_name,
                        bukti_file_ukuran=record.file_size,
                        bukti_file_mime=record.mime_type,
                    )
                else:
                    data.update(
                        bukti_file_nama=data.get("bukti_file_nama"),
                        bukti_file_ukuran=data.get("bukti_file_ukuran"),
                        bukti_file_mime=data.get("bukti_file_mime"),
                    )
            else:
                data.update(
                    bukti_file_nama=data.get("bukti_file_nama"),
                    bukti_file_ukuran=data.get("bukti_file_ukuran"),
                    bukti_file_mime=data.get("bukti_file_mime"),
                )
        else:
            data.update(
                bukti_file_nama=data.get("bukti_file_nama") or None,
                bukti_file_ukuran=data.get("bukti_file_ukuran") or None,
                bukti_file_mime=data.get("bukti_file_mime") or None,
            )
        return data

    async def create_draft(
        self,
        db: AsyncSession,
        *,
        obj_in: RealisasiAnggaranCreateDraft,
        id_pegawai: int,
    ) -> RealisasiAnggaran:
        """Creates a draft realization transaction (4-eyes maker-checker workflow).
        Validates fiscal year, payload, and available budget under row-level lock.
        Does NOT count as verified realization until submitted and approved by a separate reviewer."""
        if obj_in.jumlah_realisasi <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Jumlah realisasi transaksi harus lebih besar dari 0",
            )

        pegawai = await db.get(Pegawai, id_pegawai)
        if not pegawai:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Pegawai dengan ID {id_pegawai} tidak ditemukan",
            )

        pagu_stmt = (
            select(PaguAnggaran)
            .options(selectinload(PaguAnggaran.tahun_anggaran))
            .where(PaguAnggaran.id_pagu == obj_in.id_pagu)
            .with_for_update()
        )
        pagu_res = await db.execute(pagu_stmt)
        pagu = pagu_res.scalar_one_or_none()
        if not pagu:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Pagu anggaran dengan ID {obj_in.id_pagu} tidak ditemukan",
            )

        tahun_obj = pagu.tahun_anggaran
        if not tahun_obj:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Pagu anggaran tidak terhubung dengan tahun anggaran yang valid",
            )

        tahun_status = normalize_tahun_status(tahun_obj.status)
        if tahun_status == "draft":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Tahun anggaran {tahun_obj.tahun} belum aktif (draft) dan belum dapat menerima realisasi",
            )
        elif tahun_status == "closed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Tahun anggaran {tahun_obj.tahun} sudah ditutup (closed) dan tidak dapat menerima transaksi baru",
            )
        elif tahun_status != "active":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Status tahun anggaran {tahun_obj.tahun} ({tahun_obj.status}) tidak mengizinkan transaksi baru",
            )

        validated = await self._validate_payload(db, pagu, obj_in.model_dump(), id_pegawai, require_own_file=True)

        sum_stmt = (
            select(func.coalesce(func.sum(RealisasiAnggaran.jumlah_realisasi), Decimal("0.00")))
            .where(
                RealisasiAnggaran.id_pagu == obj_in.id_pagu,
                RealisasiAnggaran.status == "verified",
            )
            .with_for_update(read=True)
        )
        sum_res = await db.execute(sum_stmt)
        current_verified = Decimal(str(sum_res.scalar_one() or 0))

        pagu_aktif = pagu.pagu_aktif or Decimal("0.00")
        pagu_blokir = pagu.pagu_blokir or Decimal("0.00")
        available_budget = (pagu_aktif - pagu_blokir) - current_verified

        if obj_in.jumlah_realisasi > available_budget:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Jumlah realisasi ({obj_in.jumlah_realisasi:,.2f}) melebihi sisa pagu efektif yang tersedia ({available_budget:,.2f})",
            )

        db_obj = RealisasiAnggaran(
            id_pagu=obj_in.id_pagu,
            id_akun_anggaran=pagu.id_akun_anggaran,
            id_pegawai=id_pegawai,
            id_verifier=None,
            tanggal_transaksi=obj_in.tanggal_transaksi,
            nomor_dokumen=obj_in.nomor_dokumen.strip(),
            uraian_kegiatan=obj_in.uraian_kegiatan.strip(),
            jumlah_realisasi=obj_in.jumlah_realisasi,
            mekanisme_bayar=getattr(obj_in, "mekanisme_bayar", "LS") or "LS",
            jenis_dokumen_bayar=getattr(obj_in, "jenis_dokumen_bayar", "SP2D") or "SP2D",
            nomor_sp2d=getattr(obj_in, "nomor_sp2d", None),
            penerima_pembayaran=getattr(obj_in, "penerima_pembayaran", None),
            potongan_pajak=getattr(obj_in, "potongan_pajak", Decimal("0.00")) or Decimal("0.00"),
            is_koreksi=False,
            status="draft",
            periode=obj_in.periode,
            bukti_file_path=obj_in.bukti_file_path,
            bukti_file_nama=validated["bukti_file_nama"],
            bukti_file_ukuran=validated["bukti_file_ukuran"],
            bukti_file_mime=validated["bukti_file_mime"],
            catatan_verifikasi=None,
            verified_at=None,
        )
        db.add(db_obj)
        await self._audit(db, db_obj, id_pegawai, "create")
        from app.models.operations import FinancialAuditLog
        db.add(FinancialAuditLog(
            id_pegawai=id_pegawai,
            nama_pegawai=pegawai.nama,
            aksi="CREATE_DRAFT_REALISASI",
            nama_tabel="realisasi_anggaran",
            id_entitas=db_obj.id_realisasi,
            id_tahun_anggaran=pagu.id_tahun_anggaran,
            tahun=tahun_obj.tahun,
            nilai_sesudah={"nomor_dokumen": db_obj.nomor_dokumen, "jumlah_realisasi": str(db_obj.jumlah_realisasi), "status": "draft"},
            alasan=db_obj.uraian_kegiatan,
        ))
        await db.commit()
        await db.refresh(db_obj)
        return await self.get_detail(db, db_obj.id_realisasi)

    # Deprecated alias kept for backward compatibility (enforces 4-eyes draft creation)
    async def create_realisasi_direct(
        self,
        db: AsyncSession,
        *,
        obj_in: RealisasiAnggaranCreateDraft,
        id_pegawai: int,
    ) -> RealisasiAnggaran:
        return await self.create_draft(db, obj_in=obj_in, id_pegawai=id_pegawai)

    async def update_draft(
        self,
        db: AsyncSession,
        *,
        id_realisasi: int,
        obj_in: RealisasiAnggaranUpdateDraft,
        current_user_id: int,
    ) -> RealisasiAnggaran:
        update_data = obj_in.model_dump(exclude_unset=True)
        for field in ("id_pagu", "tanggal_transaksi", "nomor_dokumen", "uraian_kegiatan", "jumlah_realisasi"):
            if field in update_data and update_data[field] is None:
                raise HTTPException(422, f"{field} tidak boleh kosong")

        # Lock pagus in sorted order before locking transaction to avoid AB-BA deadlocks
        current_pagu_id = await db.scalar(
            select(RealisasiAnggaran.id_pagu).where(RealisasiAnggaran.id_realisasi == id_realisasi)
        )
        target_pagu_id = update_data.get("id_pagu", current_pagu_id)
        for pid in sorted({p for p in (current_pagu_id, target_pagu_id) if p is not None}):
            await db.execute(select(PaguAnggaran).where(PaguAnggaran.id_pagu == pid).with_for_update())

        db_obj = (
            await db.execute(
                select(RealisasiAnggaran)
                .where(RealisasiAnggaran.id_realisasi == id_realisasi)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalar_one_or_none()
        if not db_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Transaksi realisasi tidak ditemukan",
            )

        if db_obj.id_pegawai != current_user_id:
            raise HTTPException(403, "Hanya operator pembuat dapat mengubah transaksi")

        if db_obj.status not in ["draft", "rejected"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Transaksi dengan status '{db_obj.status}' tidak dapat diubah",
            )

        resolved_pagu_id = update_data.get("id_pagu", db_obj.id_pagu)
        pagu = (
            await db.execute(select(PaguAnggaran).where(PaguAnggaran.id_pagu == resolved_pagu_id))
        ).scalar_one_or_none()
        if not pagu:
            raise HTTPException(409, "Transaksi belum terhubung dengan pagu")

        merged = {c.name: getattr(db_obj, c.name) for c in db_obj.__table__.columns}
        merged.update(update_data)
        validated = await self._validate_payload(db, pagu, merged, current_user_id, id_realisasi, require_own_file=True)
        for field in ("bukti_file_nama", "bukti_file_ukuran", "bukti_file_mime"):
            update_data[field] = validated[field]
        for field in ("nomor_dokumen", "uraian_kegiatan"):
            if field in update_data:
                update_data[field] = update_data[field].strip()
        if "jumlah_realisasi" in update_data and update_data["jumlah_realisasi"] <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Jumlah realisasi transaksi harus lebih besar dari 0",
            )

        for field, val in update_data.items():
            setattr(db_obj, field, val)
        db_obj.id_akun_anggaran = pagu.id_akun_anggaran

        if db_obj.status == "rejected":
            db_obj.status = "draft"
            db_obj.id_verifier = None
            db_obj.verified_at = None

        db.add(db_obj)
        await self._audit(db, db_obj, current_user_id, "edit")
        await db.commit()
        await db.refresh(db_obj)
        return await self.get_detail(db, db_obj.id_realisasi)

    async def submit_realisasi(
        self,
        db: AsyncSession,
        *,
        id_realisasi: int,
        current_user_id: int,
    ) -> RealisasiAnggaran:
        """
        Transition draft -> submitted.
        Performs available budget check before submission.
        """
        db_obj = await self._locked(db, id_realisasi)
        if not db_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Transaksi realisasi tidak ditemukan",
            )

        if db_obj.id_pegawai != current_user_id:
            raise HTTPException(403, "Hanya operator pembuat dapat mengajukan transaksi")
        if db_obj.status != "draft":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Hanya transaksi berstatus 'draft' yang dapat diajukan (status saat ini: '{db_obj.status}')",
            )

        if not db_obj.id_pagu:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Transaksi legacy belum terhubung ke pagu anggaran resmi, tidak dapat diajukan",
            )

        pagu = (await db.execute(select(PaguAnggaran).where(
            PaguAnggaran.id_pagu == db_obj.id_pagu).with_for_update())).scalar_one_or_none()
        if not pagu:
            raise HTTPException(409, "Pagu tidak ditemukan")
        await self._validate_payload(db, pagu, {c.name: getattr(db_obj, c.name)
            for c in db_obj.__table__.columns}, current_user_id, id_realisasi)
        if not db_obj.bukti_file_path:
            raise HTTPException(422, "Unggah bukti sebelum mengajukan transaksi")

        # Check available budget
        summary = await calculate_budget_summary(db, db_obj.id_pagu)
        if db_obj.jumlah_realisasi > summary.sisa_anggaran:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Jumlah transaksi ({db_obj.jumlah_realisasi:,.2f}) melebihi sisa anggaran yang tersedia ({summary.sisa_anggaran:,.2f})",
            )

        db_obj.status = "submitted"
        db.add(db_obj)
        await self._audit(db, db_obj, current_user_id, "submit")
        await db.commit()
        await db.refresh(db_obj)
        return await self.get_detail(db, db_obj.id_realisasi)

    async def verify_realisasi(
        self,
        db: AsyncSession,
        *,
        id_realisasi: int,
        id_verifier: int,
        obj_in: RealisasiAnggaranVerify,
    ) -> RealisasiAnggaran:
        """
        Approves and finalizes transaction (submitted -> verified) with row-level locking.
        Guarantees concurrency safety against overspending.
        """
        # Validate Verifier
        verifier = await db.get(Pegawai, id_verifier)
        if not verifier:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Pegawai verifikator dengan ID {id_verifier} tidak ditemukan",
            )

        # Begin atomic verification with row-level lock on PaguAnggaran
        tx = await self._locked(db, id_realisasi)
        if not tx:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Transaksi realisasi tidak ditemukan",
            )

        if tx.id_pegawai == id_verifier:
            raise HTTPException(403, "Operator tidak boleh memeriksa transaksinya sendiri")
        if tx.status != "submitted":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Hanya transaksi berstatus 'submitted' yang dapat diverifikasi (status saat ini: '{tx.status}')",
            )

        if not tx.id_pagu:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Transaksi belum terikat pada pagu anggaran tahunan",
            )

        # Lock PaguAnggaran
        pagu_stmt = select(PaguAnggaran).where(PaguAnggaran.id_pagu == tx.id_pagu).with_for_update()
        pagu_res = await db.execute(pagu_stmt)
        pagu = pagu_res.scalar_one_or_none()
        if not pagu:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pagu anggaran tidak ditemukan")

        await self._validate_payload(db, pagu, {c.name: getattr(tx, c.name)
            for c in tx.__table__.columns}, tx.id_pegawai, id_realisasi)
        if not tx.bukti_file_path:
            raise HTTPException(422, "Bukti transaksi wajib tersedia")

        # Atomic recalculation of verified realization
        sum_stmt = (
            select(func.coalesce(func.sum(RealisasiAnggaran.jumlah_realisasi), Decimal("0.00")))
            .where(
                RealisasiAnggaran.id_pagu == tx.id_pagu,
                RealisasiAnggaran.status == "verified",
            ).with_for_update(read=True)
        )
        sum_res = await db.execute(sum_stmt)
        current_verified = Decimal(str(sum_res.scalar_one() or 0))

        pagu_aktif = pagu.pagu_aktif or Decimal("0.00")
        pagu_blokir = pagu.pagu_blokir or Decimal("0.00")
        available_budget = (pagu_aktif - pagu_blokir) - current_verified

        if tx.jumlah_realisasi > available_budget:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Verifikasi ditolak: Transaksi ({tx.jumlah_realisasi:,.2f}) melebihi sisa pagu efektif ({available_budget:,.2f})",
            )

        # Apply approval
        tx.status = "verified"
        tx.id_verifier = id_verifier
        tx.verified_at = datetime.now()
        tx.catatan_verifikasi = obj_in.catatan_verifikasi

        db.add(tx)
        await self._audit(db, tx, id_verifier, "verify")
        await db.commit()
        await db.refresh(tx)
        return await self.get_detail(db, tx.id_realisasi)

    async def reject_realisasi(
        self,
        db: AsyncSession,
        *,
        id_realisasi: int,
        id_verifier: int,
        obj_in: RealisasiAnggaranReject,
    ) -> RealisasiAnggaran:
        """
        Rejects a submitted transaction (submitted -> rejected).
        Records rejection reason. Does not count into budget realization.
        """
        tx = await self._locked(db, id_realisasi)
        if not tx:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaksi realisasi tidak ditemukan")

        if tx.id_pegawai == id_verifier:
            raise HTTPException(403, "Operator tidak boleh memeriksa transaksinya sendiri")
        if tx.status != "submitted":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Hanya transaksi berstatus 'submitted' yang dapat ditolak (status saat ini: '{tx.status}')",
            )

        tx.status = "rejected"
        tx.id_verifier = id_verifier
        tx.verified_at = None  # Not verified
        tx.catatan_verifikasi = obj_in.catatan_verifikasi.strip()

        db.add(tx)
        await self._audit(db, tx, id_verifier, "reject")
        await db.commit()
        await db.refresh(tx)
        return await self.get_detail(db, tx.id_realisasi)

    async def delete_draft(
        self,
        db: AsyncSession,
        *,
        id_realisasi: int,
        current_user_id: int,
    ) -> Dict[str, Any]:
        """
        Only draft transactions can be deleted.
        """
        tx = await self._locked(db, id_realisasi)
        if not tx:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaksi tidak ditemukan")

        if tx.id_pegawai != current_user_id:
            raise HTTPException(403, "Hanya operator pembuat dapat menghapus draft")
        if tx.status != "draft":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Hanya transaksi berstatus 'draft' yang dapat dihapus",
            )

        pagu_res = await db.execute(select(PaguAnggaran).where(PaguAnggaran.id_pagu == tx.id_pagu))
        pagu_obj = pagu_res.scalar_one_or_none()
        ta_obj = None
        if pagu_obj:
            ta_res = await db.execute(select(TahunAnggaran).where(TahunAnggaran.id_tahun_anggaran == pagu_obj.id_tahun_anggaran))
            ta_obj = ta_res.scalar_one_or_none()
            if ta_obj and normalize_tahun_status(ta_obj.status) == "closed":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Tidak dapat menghapus transaksi pada tahun anggaran {ta_obj.tahun} yang sudah ditutup (closed)",
                )

        detail = await self.get_detail(db, id_realisasi)
        enriched = await self.enrich_realisasi_response(db, detail)
        await self._audit(db, tx, current_user_id, "delete")
        actor = await db.get(Pegawai, current_user_id)
        from app.models.operations import FinancialAuditLog
        db.add(FinancialAuditLog(
            id_pegawai=current_user_id,
            nama_pegawai=actor.nama if actor else None,
            aksi="DELETE_DRAFT_REALISASI",
            nama_tabel="realisasi_anggaran",
            id_entitas=id_realisasi,
            id_tahun_anggaran=pagu_obj.id_tahun_anggaran if pagu_obj else None,
            tahun=ta_obj.tahun if ta_obj else None,
            nilai_sebelum={"nomor_dokumen": tx.nomor_dokumen, "jumlah_realisasi": str(tx.jumlah_realisasi), "status": tx.status},
            alasan="Penghapusan draft realisasi oleh operator pembuat",
        ))
        await db.delete(tx)
        await db.commit()
        from app.services.arsip_sync import remove_sync
        await remove_sync(db, "realisasi", id_realisasi)
        return enriched

    async def update_realisasi_rendatin(
        self,
        db: AsyncSession,
        *,
        id_realisasi: int,
        obj_in: Any,
        user: Pegawai,
    ) -> RealisasiAnggaran:
        """
        Allows authorized RENDATIN officers (BAG-02) to edit verified realization transactions.
        - Consistent lock ordering: locks PaguAnggaran (sorted non-None IDs) FIRST, then RealisasiAnggaran.
        - Validates fiscal year, document date, duplicate nomor_dokumen, and available budget.
        """
        update_data = obj_in.model_dump(exclude_unset=True) if hasattr(obj_in, "model_dump") else dict(obj_in)
        for field in ("id_pagu", "tanggal_transaksi", "nomor_dokumen", "uraian_kegiatan", "jumlah_realisasi"):
            if field in update_data and update_data[field] is None:
                raise HTTPException(422, f"{field} tidak boleh kosong")

        # 1. Peek current id_pagu and lock all involved PaguAnggaran in sorted order BEFORE locking tx
        current_pagu_id = await db.scalar(
            select(RealisasiAnggaran.id_pagu).where(RealisasiAnggaran.id_realisasi == id_realisasi)
        )
        if current_pagu_id is None and "id_pagu" not in update_data:
            exists = await db.scalar(select(RealisasiAnggaran.id_realisasi).where(RealisasiAnggaran.id_realisasi == id_realisasi))
            if exists is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Transaksi realisasi dengan ID {id_realisasi} tidak ditemukan",
                )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Transaksi belum terikat pada pagu anggaran resmi",
            )

        target_pagu_id = update_data.get("id_pagu", current_pagu_id)
        if not target_pagu_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Transaksi belum terikat pada pagu anggaran resmi",
            )

        pagu_ids_to_lock = sorted({pid for pid in (current_pagu_id, target_pagu_id) if pid is not None})
        pagus_by_id = {}
        for pid in pagu_ids_to_lock:
            p_stmt = select(PaguAnggaran).where(PaguAnggaran.id_pagu == pid).with_for_update()
            p_obj = (await db.execute(p_stmt)).scalar_one_or_none()
            if not p_obj:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Pagu anggaran dengan ID {pid} tidak ditemukan",
                )
            pagus_by_id[pid] = p_obj

        # 2. Lock the transaction row
        tx_stmt = (
            select(RealisasiAnggaran)
            .where(RealisasiAnggaran.id_realisasi == id_realisasi)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        tx = (await db.execute(tx_stmt)).scalar_one_or_none()
        if not tx:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Transaksi realisasi dengan ID {id_realisasi} tidak ditemukan",
            )

        if tx.status != "verified":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Hanya transaksi berstatus 'verified' yang dapat diedit oleh RENDATIN (status saat ini: '{tx.status}')",
            )

        old_amount = Decimal(str(tx.jumlah_realisasi or 0))
        old_snapshot = {
            "id_pagu": tx.id_pagu,
            "nomor_dokumen": tx.nomor_dokumen,
            "jumlah_realisasi": str(old_amount),
            "tanggal_transaksi": str(tx.tanggal_transaksi),
        }
        new_amount = Decimal(str(update_data.get("jumlah_realisasi", old_amount)))
        if new_amount <= Decimal("0.00"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Jumlah realisasi transaksi harus lebih besar dari 0",
            )
        if new_amount.as_tuple().exponent < -2:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Nominal realisasi tidak boleh memiliki lebih dari 2 angka di belakang desimal",
            )

        target_pagu = pagus_by_id[target_pagu_id]

        # 3. Validate Fiscal Year, dates, duplicate nomor_dokumen & optional file update
        ta_obj = (await db.execute(
            select(TahunAnggaran).where(TahunAnggaran.id_tahun_anggaran == target_pagu.id_tahun_anggaran)
        )).scalar_one_or_none()
        if not ta_obj or normalize_tahun_status(ta_obj.status) != "active":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Pagu anggaran berada pada tahun anggaran yang tidak aktif atau ditutup",
            )

        merged = {c.name: getattr(tx, c.name) for c in tx.__table__.columns}
        merged.update(update_data)
        file_changed = "bukti_file_path" in update_data and update_data["bukti_file_path"] != tx.bukti_file_path
        validated = await self._validate_payload(
            db,
            target_pagu,
            merged,
            user.id_pegawai if file_changed else (tx.id_pegawai or user.id_pegawai),
            exclude_id=tx.id_realisasi,
            require_own_file=file_changed and bool(update_data.get("bukti_file_path")),
        )

        # 4. Check available budget on target Pagu (with locking read)
        sum_conditions = [
            RealisasiAnggaran.id_pagu == target_pagu_id,
            RealisasiAnggaran.status == "verified",
        ]
        if target_pagu_id == tx.id_pagu:
            sum_conditions.append(RealisasiAnggaran.id_realisasi != tx.id_realisasi)
        sum_stmt = (
            select(func.coalesce(func.sum(RealisasiAnggaran.jumlah_realisasi), Decimal("0.00")))
            .where(*sum_conditions)
            .with_for_update(read=True)
        )
        other_verified = Decimal(str((await db.execute(sum_stmt)).scalar_one() or 0))
        available = ((target_pagu.pagu_aktif or Decimal("0.00")) - (target_pagu.pagu_blokir or Decimal("0.00"))) - other_verified

        if new_amount > available:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Update gagal: Jumlah realisasi baru ({new_amount:,.2f}) melebihi sisa pagu efektif ({available:,.2f})",
            )

        if target_pagu_id != tx.id_pagu:
            tx.id_pagu = target_pagu_id
            tx.id_akun_anggaran = target_pagu.id_akun_anggaran

        if "nomor_dokumen" in update_data and update_data["nomor_dokumen"]:
            tx.nomor_dokumen = str(update_data["nomor_dokumen"]).strip()
        if "uraian_kegiatan" in update_data and update_data["uraian_kegiatan"]:
            tx.uraian_kegiatan = str(update_data["uraian_kegiatan"]).strip()
        if "tanggal_transaksi" in update_data and update_data["tanggal_transaksi"]:
            tx.tanggal_transaksi = update_data["tanggal_transaksi"]
        if "jumlah_realisasi" in update_data and update_data["jumlah_realisasi"]:
            tx.jumlah_realisasi = new_amount
        if "periode" in update_data:
            tx.periode = update_data["periode"]
        if "bukti_file_path" in update_data:
            tx.bukti_file_path = update_data["bukti_file_path"]
            tx.bukti_file_nama = validated["bukti_file_nama"]
            tx.bukti_file_ukuran = validated["bukti_file_ukuran"]
            tx.bukti_file_mime = validated["bukti_file_mime"]

        tx.status = "verified"

        db.add(tx)
        await self._audit(db, tx, user.id_pegawai, "rendatin_edit")
        from app.models.operations import FinancialAuditLog
        db.add(FinancialAuditLog(
            id_pegawai=user.id_pegawai,
            nama_pegawai=user.nama,
            aksi="RENDATIN_EDIT_REALISASI",
            nama_tabel="realisasi_anggaran",
            id_entitas=tx.id_realisasi,
            id_tahun_anggaran=target_pagu.id_tahun_anggaran,
            tahun=ta_obj.tahun,
            nilai_sebelum=old_snapshot,
            nilai_sesudah={
                "id_pagu": tx.id_pagu,
                "nomor_dokumen": tx.nomor_dokumen,
                "jumlah_realisasi": str(tx.jumlah_realisasi),
                "tanggal_transaksi": str(tx.tanggal_transaksi),
            },
            alasan="Koreksi transaksi verified oleh RENDATIN",
        ))
        await db.commit()
        await db.refresh(tx)
        return await self.get_detail(db, tx.id_realisasi)

    async def delete_realisasi_rendatin(
        self,
        db: AsyncSession,
        *,
        id_realisasi: int,
        user: Pegawai,
    ) -> Dict[str, Any]:
        """
        Allows authorized RENDATIN officers (BAG-02) to delete verified realization transactions
        only on ACTIVE fiscal years (closed years are strictly immutable).
        """
        tx = await self._locked(db, id_realisasi)
        if not tx:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Transaksi realisasi dengan ID {id_realisasi} tidak ditemukan",
            )

        if tx.status != "verified":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Hanya transaksi berstatus 'verified' yang dapat dihapus oleh RENDATIN (status saat ini: '{tx.status}')",
            )

        pagu_obj = await db.get(PaguAnggaran, tx.id_pagu) if tx.id_pagu else None
        ta_obj = await db.get(TahunAnggaran, pagu_obj.id_tahun_anggaran) if pagu_obj else None
        if ta_obj and normalize_tahun_status(ta_obj.status) == "closed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Tidak dapat menghapus transaksi pada tahun anggaran {ta_obj.tahun} yang sudah ditutup (closed)",
            )

        detail = await self.get_detail(db, id_realisasi)
        enriched = await self.enrich_realisasi_response(db, detail)
        await self._audit(db, tx, user.id_pegawai, "rendatin_delete")
        from app.models.operations import FinancialAuditLog
        db.add(FinancialAuditLog(
            id_pegawai=user.id_pegawai,
            nama_pegawai=user.nama,
            aksi="RENDATIN_DELETE_REALISASI",
            nama_tabel="realisasi_anggaran",
            id_entitas=id_realisasi,
            id_tahun_anggaran=pagu_obj.id_tahun_anggaran if pagu_obj else None,
            tahun=ta_obj.tahun if ta_obj else None,
            nilai_sebelum={
                "id_pagu": tx.id_pagu,
                "nomor_dokumen": tx.nomor_dokumen,
                "jumlah_realisasi": str(tx.jumlah_realisasi),
                "status": tx.status,
            },
            alasan="Penghapusan transaksi verified oleh RENDATIN",
        ))
        await db.delete(tx)
        await db.commit()
        from app.services.arsip_sync import remove_sync
        await remove_sync(db, "realisasi", id_realisasi)
        return enriched

    async def create_koreksi(
        self,
        db: AsyncSession,
        *,
        id_realisasi_asal: int,
        obj_in: Any,
        user: Pegawai,
    ) -> RealisasiAnggaran:
        """Record an immutable SSPB / pengembalian belanja adjustment against a verified realization."""
        orig = await self._locked(db, id_realisasi_asal)
        if not orig:
            raise HTTPException(404, f"Transaksi realisasi asal #{id_realisasi_asal} tidak ditemukan")
        if orig.status != "verified" or orig.is_koreksi:
            raise HTTPException(400, "Koreksi/SSPB hanya dapat dibuat terhadap transaksi belanja berstatus verified")
        pagu = await db.get(PaguAnggaran, orig.id_pagu) if orig.id_pagu else None
        if not pagu:
            raise HTTPException(400, "Transaksi asal belum terhubung dengan pagu anggaran")
        ta = await db.get(TahunAnggaran, pagu.id_tahun_anggaran)
        if not ta or normalize_tahun_status(ta.status) != "active":
            raise HTTPException(409, "Koreksi/SSPB hanya dapat dicatat pada tahun anggaran aktif")
        if obj_in.tanggal_transaksi.year != ta.tahun or not (ta.tanggal_mulai <= obj_in.tanggal_transaksi <= ta.tanggal_selesai):
            raise HTTPException(422, "Tanggal SSPB di luar periode tahun anggaran aktif")

        dup = await db.scalar(
            select(RealisasiAnggaran.id_realisasi).where(
                RealisasiAnggaran.id_pagu == pagu.id_pagu,
                RealisasiAnggaran.nomor_dokumen == obj_in.nomor_dokumen.strip(),
            )
        )
        if dup:
            raise HTTPException(409, "Nomor dokumen SSPB/koreksi sudah tercatat pada pagu ini")

        prior_koreksi_sum = Decimal(
            str(
                (
                    await db.scalar(
                        select(func.coalesce(func.sum(RealisasiAnggaran.jumlah_realisasi), Decimal("0.00")))
                        .where(RealisasiAnggaran.koreksi_dari_id == orig.id_realisasi, RealisasiAnggaran.status == "verified")
                    )
                )
                or 0
            )
        )
        max_refundable = Decimal(str(orig.jumlah_realisasi)) + prior_koreksi_sum
        if obj_in.nominal_koreksi > max_refundable:
            raise HTTPException(
                400,
                f"Nominal koreksi/SSPB ({obj_in.nominal_koreksi:,.2f}) melebihi sisa nilai transaksi asal ({max_refundable:,.2f})",
            )

        kor = RealisasiAnggaran(
            id_pagu=orig.id_pagu,
            id_akun_anggaran=orig.id_akun_anggaran,
            id_pegawai=user.id_pegawai,
            id_verifier=user.id_pegawai,
            tanggal_transaksi=obj_in.tanggal_transaksi,
            nomor_dokumen=obj_in.nomor_dokumen.strip(),
            uraian_kegiatan=f"[Koreksi/SSPB atas {orig.nomor_dokumen}] {obj_in.alasan.strip()}",
            jumlah_realisasi=-obj_in.nominal_koreksi,
            mekanisme_bayar=orig.mekanisme_bayar or "LS",
            jenis_dokumen_bayar="SSPB",
            penerima_pembayaran=orig.penerima_pembayaran,
            potongan_pajak=Decimal("0.00"),
            is_koreksi=True,
            koreksi_dari_id=orig.id_realisasi,
            status="verified",
            periode=orig.periode,
            catatan_verifikasi=obj_in.alasan.strip(),
            verified_at=datetime.now(),
        )
        db.add(kor)
        await self._audit(db, kor, user.id_pegawai, "koreksi")
        from app.models.operations import FinancialAuditLog
        db.add(
            FinancialAuditLog(
                id_pegawai=user.id_pegawai,
                nama_pegawai=user.nama,
                aksi="KOREKSI_SSPB",
                nama_tabel="realisasi_anggaran",
                id_entitas=kor.id_realisasi,
                id_tahun_anggaran=pagu.id_tahun_anggaran,
                tahun=ta.tahun,
                nilai_sebelum={"id_realisasi_asal": orig.id_realisasi, "jumlah_asal": str(orig.jumlah_realisasi)},
                nilai_sesudah={"nomor_dokumen": kor.nomor_dokumen, "jumlah_koreksi": str(kor.jumlah_realisasi)},
                alasan=obj_in.alasan.strip(),
            )
        )
        await db.commit()
        await db.refresh(kor)
        return await self.get_detail(db, kor.id_realisasi)

    async def get_filtered(
        self,
        db: AsyncSession,
        *,
        search: Optional[str] = None,
        status: Optional[str] = None,
        id_pagu: Optional[int] = None,
        id_tahun_anggaran: Optional[int] = None,
        id_akun_anggaran: Optional[int] = None,
        id_bagian: Optional[int] = None,
        bulan: Optional[int] = None,
        tanggal_mulai: Optional[date] = None,
        tanggal_selesai: Optional[date] = None,
        has_bukti: Optional[bool] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> Tuple[List[Dict[str, Any]], int]:
        conditions = []
        if status:
            conditions.append(RealisasiAnggaran.status == status)
        if has_bukti is True:
            conditions.append(and_(RealisasiAnggaran.bukti_file_path.is_not(None), RealisasiAnggaran.bukti_file_path != ""))
        elif has_bukti is False:
            conditions.append(or_(RealisasiAnggaran.bukti_file_path.is_(None), RealisasiAnggaran.bukti_file_path == ""))
        if id_pagu:
            conditions.append(RealisasiAnggaran.id_pagu == id_pagu)
        if id_akun_anggaran:
            conditions.append(RealisasiAnggaran.id_akun_anggaran == id_akun_anggaran)
        if bulan:
            conditions.append(func.extract('month', RealisasiAnggaran.tanggal_transaksi) == bulan)
        if tanggal_mulai:
            conditions.append(RealisasiAnggaran.tanggal_transaksi >= tanggal_mulai)
        if tanggal_selesai:
            conditions.append(RealisasiAnggaran.tanggal_transaksi <= tanggal_selesai)
        if id_tahun_anggaran:
            conditions.append(
                RealisasiAnggaran.pagu_anggaran.has(PaguAnggaran.id_tahun_anggaran == id_tahun_anggaran)
            )
        if id_bagian is not None:
            conditions.append(
                RealisasiAnggaran.akun_anggaran.has(AkunAnggaran.id_bagian == id_bagian)
            )
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(
                or_(
                    RealisasiAnggaran.nomor_dokumen.ilike(term),
                    RealisasiAnggaran.uraian_kegiatan.ilike(term),
                    RealisasiAnggaran.akun_anggaran.has(AkunAnggaran.kode_akun.ilike(term)),
                    RealisasiAnggaran.akun_anggaran.has(AkunAnggaran.nama_akun.ilike(term)),
                )
            )

        count_stmt = select(func.count(RealisasiAnggaran.id_realisasi))
        if conditions:
            count_stmt = count_stmt.where(*conditions)
        count_res = await db.execute(count_stmt)
        total = count_res.scalar_one() or 0

        stmt = (
            select(RealisasiAnggaran)
            .options(
                selectinload(RealisasiAnggaran.pagu_anggaran).selectinload(PaguAnggaran.tahun_anggaran),
                selectinload(RealisasiAnggaran.akun_anggaran).selectinload(AkunAnggaran.bagian),
                selectinload(RealisasiAnggaran.operator),
                selectinload(RealisasiAnggaran.verifier),
            )
            .order_by(desc(RealisasiAnggaran.tanggal_transaksi), desc(RealisasiAnggaran.id_realisasi))
            .offset(skip)
            .limit(limit)
        )
        if conditions:
            stmt = stmt.where(*conditions)
        res = await db.execute(stmt)
        items = list(res.scalars().all())

        # Batch aggregate verified totals per pagu for accurate sisa_anggaran without N+1 queries
        pagu_ids = list({r.id_pagu for r in items if r.id_pagu is not None})
        verified_by_pagu: Dict[int, Decimal] = {}
        if pagu_ids:
            grp = await db.execute(
                select(RealisasiAnggaran.id_pagu, func.coalesce(func.sum(RealisasiAnggaran.jumlah_realisasi), Decimal("0.00")))
                .where(RealisasiAnggaran.id_pagu.in_(pagu_ids), RealisasiAnggaran.status == "verified")
                .group_by(RealisasiAnggaran.id_pagu)
            )
            verified_by_pagu = {pid: Decimal(str(tot or 0)) for pid, tot in grp.all()}

        enriched_items = [
            self.enrich_realisasi_dict(r, verified_by_pagu.get(r.id_pagu) if r.id_pagu is not None else None)
            for r in items
        ]

        return enriched_items, total

    def enrich_realisasi_dict(self, r: RealisasiAnggaran, pagu_verified_total: Optional[Decimal] = None) -> Dict[str, Any]:
        pagu_aktif = r.pagu_anggaran.pagu_aktif if r.pagu_anggaran else None
        pagu_blokir = (r.pagu_anggaran.pagu_blokir or Decimal("0.00")) if r.pagu_anggaran else Decimal("0.00")
        sisa_anggaran = None
        persentase_serapan = None
        if pagu_aktif is not None and pagu_verified_total is not None:
            sisa_anggaran = (pagu_aktif - pagu_blokir) - pagu_verified_total
            persentase_serapan = round(float((pagu_verified_total / pagu_aktif) * 100), 2) if pagu_aktif > 0 else 0.0
        potongan = Decimal(str(getattr(r, "potongan_pajak", 0) or 0))
        bruto = Decimal(str(r.jumlah_realisasi or 0))
        return {
            "id_realisasi": r.id_realisasi,
            "id_pagu": r.id_pagu,
            "id_akun_anggaran": r.id_akun_anggaran,
            "id_pegawai": r.id_pegawai,
            "id_verifier": r.id_verifier,
            "tanggal_transaksi": r.tanggal_transaksi,
            "nomor_dokumen": r.nomor_dokumen,
            "uraian_kegiatan": r.uraian_kegiatan,
            "jumlah_realisasi": r.jumlah_realisasi,
            "mekanisme_bayar": getattr(r, "mekanisme_bayar", None) or "LS",
            "jenis_dokumen_bayar": getattr(r, "jenis_dokumen_bayar", None) or "SP2D",
            "nomor_sp2d": getattr(r, "nomor_sp2d", None),
            "penerima_pembayaran": getattr(r, "penerima_pembayaran", None),
            "potongan_pajak": potongan,
            "jumlah_netto": bruto - potongan,
            "is_koreksi": bool(getattr(r, "is_koreksi", False)),
            "koreksi_dari_id": getattr(r, "koreksi_dari_id", None),
            "status": r.status,
            "periode": r.periode,
            "bukti_file_path": r.bukti_file_path,
            "bukti_file_nama": r.bukti_file_nama,
            "bukti_file_ukuran": r.bukti_file_ukuran,
            "bukti_file_mime": r.bukti_file_mime,
            "catatan_verifikasi": r.catatan_verifikasi,
            "verified_at": r.verified_at,
            "created_at": r.created_at,
            "updated_at": r.updated_at,
            "tahun": r.pagu_anggaran.tahun_anggaran.tahun if (r.pagu_anggaran and r.pagu_anggaran.tahun_anggaran) else None,
            "kode_akun": r.akun_anggaran.kode_akun if r.akun_anggaran else None,
            "nama_akun": r.akun_anggaran.nama_akun if r.akun_anggaran else None,
            "nama_bagian": r.akun_anggaran.bagian.nama_bagian if (r.akun_anggaran and r.akun_anggaran.bagian) else None,
            "nama_operator": r.operator.nama if r.operator else None,
            "nama_verifier": r.verifier.nama if r.verifier else None,
            "pagu_aktif": pagu_aktif,
            "sisa_anggaran": sisa_anggaran,
            "persentase_serapan": persentase_serapan,
        }

    async def enrich_realisasi_response(self, db: AsyncSession, r: RealisasiAnggaran) -> Dict[str, Any]:
        verified_total = None
        if r.id_pagu is not None:
            res = await db.execute(
                select(func.coalesce(func.sum(RealisasiAnggaran.jumlah_realisasi), Decimal("0.00")))
                .where(RealisasiAnggaran.id_pagu == r.id_pagu, RealisasiAnggaran.status == "verified")
            )
            verified_total = Decimal(str(res.scalar_one() or 0))
        return self.enrich_realisasi_dict(r, verified_total)


# =========================================================
# 6. DASHBOARD & AGGREGATE SUMMARY SERVICE
# =========================================================

async def get_dashboard_summary(
    db: AsyncSession,
    id_tahun_anggaran: Optional[int] = None,
    id_akun_anggaran: Optional[int] = None,
    id_bagian: Optional[int] = None,
    bulan: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Calculates macro aggregate budget summary and 12-month recap for active fiscal year or specified year.
    Optionally filters by specific account (id_akun_anggaran), bagian (id_bagian), and/or month (bulan 1-12).
    """
    if not id_tahun_anggaran:
        active_yr = await tahun_anggaran.get_active_year(db)
        if active_yr:
            id_tahun_anggaran = active_yr.id_tahun_anggaran
            tahun_val = active_yr.tahun
            yr = active_yr
        else:
            # fallback to latest year
            latest_stmt = select(TahunAnggaran).order_by(desc(TahunAnggaran.tahun)).limit(1)
            latest_res = await db.execute(latest_stmt)
            latest_yr = latest_res.scalar_one_or_none()
            if latest_yr:
                id_tahun_anggaran = latest_yr.id_tahun_anggaran
                tahun_val = latest_yr.tahun
                yr = latest_yr
            else:
                return {
                    "id_tahun_anggaran": None,
                    "tahun": None,
                    "status_tahun": None,
                    "id_akun_anggaran": id_akun_anggaran,
                    "id_bagian": id_bagian,
                    "bulan": bulan,
                    "total_pagu_aktif": Decimal("0.00"),
                    "total_realisasi_verified": Decimal("0.00"),
                    "total_sisa_anggaran": Decimal("0.00"),
                    "persentase_serapan": 0.0,
                    "total_transaksi_draft": 0,
                    "total_transaksi_submitted": 0,
                    "total_transaksi_verified": 0,
                    "total_transaksi_rejected": 0,
                    "monthly_recap": [],
                }
    else:
        yr = await db.get(TahunAnggaran, id_tahun_anggaran)
        if not yr:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Tahun anggaran dengan ID {id_tahun_anggaran} tidak ditemukan",
            )
        tahun_val = yr.tahun

    # 1. Total Pagu Aktif for this year (and optionally account / bagian)
    pagu_conditions = [PaguAnggaran.id_tahun_anggaran == id_tahun_anggaran]
    if id_akun_anggaran:
        pagu_conditions.append(PaguAnggaran.id_akun_anggaran == id_akun_anggaran)
    if id_bagian is not None:
        pagu_conditions.append(PaguAnggaran.akun_anggaran.has(AkunAnggaran.id_bagian == id_bagian))

    pagu_sum_stmt = select(
        func.coalesce(func.sum(PaguAnggaran.pagu_aktif), Decimal("0.00")),
        func.coalesce(func.sum(PaguAnggaran.pagu_blokir), Decimal("0.00")),
    ).where(and_(*pagu_conditions))
    pagu_row = (await db.execute(pagu_sum_stmt)).one()
    total_pagu = Decimal(str(pagu_row[0] or 0))
    total_blokir = Decimal(str(pagu_row[1] or 0))
    total_efektif = total_pagu - total_blokir

    # 2. Annual verified total (true basis for sisa anggaran DIPA!)
    annual_real_conditions = [
        PaguAnggaran.id_tahun_anggaran == id_tahun_anggaran,
        RealisasiAnggaran.status == "verified",
    ]
    if id_akun_anggaran:
        annual_real_conditions.append(PaguAnggaran.id_akun_anggaran == id_akun_anggaran)
    if id_bagian is not None:
        annual_real_conditions.append(PaguAnggaran.akun_anggaran.has(AkunAnggaran.id_bagian == id_bagian))

    annual_real_stmt = (
        select(func.coalesce(func.sum(RealisasiAnggaran.jumlah_realisasi), Decimal("0.00")))
        .join(PaguAnggaran, RealisasiAnggaran.id_pagu == PaguAnggaran.id_pagu)
        .where(and_(*annual_real_conditions))
    )
    total_verified_year = Decimal(str((await db.execute(annual_real_stmt)).scalar_one() or 0))

    if bulan:
        month_real_stmt = (
            select(func.coalesce(func.sum(RealisasiAnggaran.jumlah_realisasi), Decimal("0.00")))
            .join(PaguAnggaran, RealisasiAnggaran.id_pagu == PaguAnggaran.id_pagu)
            .where(and_(*annual_real_conditions, func.extract("month", RealisasiAnggaran.tanggal_transaksi) == bulan))
        )
        total_verified = Decimal(str((await db.execute(month_real_stmt)).scalar_one() or 0))
    else:
        total_verified = total_verified_year

    # Remaining DIPA budget is ALWAYS annual effective pagu minus cumulative annual verified realization
    sisa = total_efektif - total_verified_year
    persentase = float((total_verified / total_pagu) * 100) if total_pagu > 0 else 0.0

    # 3. Count transactions by status for this filter scope
    async def get_tx_count(status_name: str) -> int:
        c_conditions = [
            PaguAnggaran.id_tahun_anggaran == id_tahun_anggaran,
            RealisasiAnggaran.status == status_name,
        ]
        if id_akun_anggaran:
            c_conditions.append(PaguAnggaran.id_akun_anggaran == id_akun_anggaran)
        if id_bagian is not None:
            c_conditions.append(PaguAnggaran.akun_anggaran.has(AkunAnggaran.id_bagian == id_bagian))
        if bulan:
            c_conditions.append(func.extract("month", RealisasiAnggaran.tanggal_transaksi) == bulan)

        c_stmt = (
            select(func.count(RealisasiAnggaran.id_realisasi))
            .join(PaguAnggaran, RealisasiAnggaran.id_pagu == PaguAnggaran.id_pagu)
            .where(and_(*c_conditions))
        )
        c_res = await db.execute(c_stmt)
        return int(c_res.scalar_one() or 0)

    draft_cnt = await get_tx_count("draft")
    submitted_cnt = await get_tx_count("submitted")
    verified_cnt = await get_tx_count("verified")
    rejected_cnt = await get_tx_count("rejected")

    # 4. Rekap 12 Bulan (Januari - Desember) dari transaksi VERIFIED
    monthly_conditions = [
        PaguAnggaran.id_tahun_anggaran == id_tahun_anggaran,
        RealisasiAnggaran.status == "verified",
    ]
    if id_akun_anggaran:
        monthly_conditions.append(PaguAnggaran.id_akun_anggaran == id_akun_anggaran)
    if id_bagian is not None:
        monthly_conditions.append(PaguAnggaran.akun_anggaran.has(AkunAnggaran.id_bagian == id_bagian))

    month_col = func.extract("month", RealisasiAnggaran.tanggal_transaksi).label("m_idx")
    monthly_stmt = (
        select(
            month_col,
            func.coalesce(func.sum(RealisasiAnggaran.jumlah_realisasi), Decimal("0.00")).label("m_total"),
            func.count(RealisasiAnggaran.id_realisasi).label("m_count"),
        )
        .join(PaguAnggaran, RealisasiAnggaran.id_pagu == PaguAnggaran.id_pagu)
        .where(and_(*monthly_conditions))
        .group_by(month_col)
    )
    monthly_rows = (await db.execute(monthly_stmt)).all()
    monthly_map = {int(r.m_idx): (Decimal(str(r.m_total or 0)), int(r.m_count or 0)) for r in monthly_rows}

    bulan_names = [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ]

    monthly_recap = []
    for m in range(1, 13):
        m_real, m_cnt = monthly_map.get(m, (Decimal("0.00"), 0))
        m_pct = round(float((m_real / total_pagu) * 100), 2) if total_pagu > 0 else 0.0
        monthly_recap.append({
            "bulan": m,
            "nama_bulan": bulan_names[m - 1],
            "total_realisasi_verified": m_real,
            "persentase_serapan": m_pct,
            "total_transaksi_verified": m_cnt,
        })

    status_val = normalize_tahun_status(yr.status) if yr else None

    return {
        "id_tahun_anggaran": id_tahun_anggaran,
        "tahun": tahun_val,
        "status_tahun": status_val,
        "id_akun_anggaran": id_akun_anggaran,
        "id_bagian": id_bagian,
        "bulan": bulan,
        "total_pagu_aktif": total_pagu,
        "total_pagu_blokir": total_blokir,
        "total_pagu_efektif": total_efektif,
        "total_realisasi_verified": total_verified,
        "total_realisasi_tahun": total_verified_year,
        "total_sisa_anggaran": sisa,
        "persentase_serapan": round(persentase, 2),
        "total_transaksi_draft": draft_cnt,
        "total_transaksi_submitted": submitted_cnt,
        "total_transaksi_verified": verified_cnt,
        "total_transaksi_rejected": rejected_cnt,
        "monthly_recap": monthly_recap,
    }


async def get_monthly_report(
    db: AsyncSession,
    id_tahun_anggaran: Optional[int] = None,
    id_akun_anggaran: Optional[int] = None,
    id_bagian: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Generates a 12-month budget realization report aggregated by account for a specific fiscal year.
    Matches the authoritative backend calculations:
    - Annual Pagu per account (not divided by 12)
    - Monthly realization Jan-Dec based on verified transactions' tanggal_transaksi
    - Total realization, remaining budget, and percentage per account and overall total.
    """
    if not id_tahun_anggaran:
        active_yr = await tahun_anggaran.get_active_year(db)
        if active_yr:
            id_tahun_anggaran = active_yr.id_tahun_anggaran
            tahun_val = active_yr.tahun
            status_val = active_yr.status
        else:
            latest_stmt = select(TahunAnggaran).order_by(desc(TahunAnggaran.tahun)).limit(1)
            latest_res = await db.execute(latest_stmt)
            latest_yr = latest_res.scalar_one_or_none()
            if latest_yr:
                id_tahun_anggaran = latest_yr.id_tahun_anggaran
                tahun_val = latest_yr.tahun
                status_val = latest_yr.status
            else:
                return {
                    "id_tahun_anggaran": None,
                    "tahun": None,
                    "status_tahun": None,
                    "rows": [],
                    "total": {
                        "pagu": Decimal("0.00"),
                        "januari": Decimal("0.00"),
                        "februari": Decimal("0.00"),
                        "maret": Decimal("0.00"),
                        "april": Decimal("0.00"),
                        "mei": Decimal("0.00"),
                        "juni": Decimal("0.00"),
                        "juli": Decimal("0.00"),
                        "agustus": Decimal("0.00"),
                        "september": Decimal("0.00"),
                        "oktober": Decimal("0.00"),
                        "november": Decimal("0.00"),
                        "desember": Decimal("0.00"),
                        "total_realisasi": Decimal("0.00"),
                        "sisa_anggaran": Decimal("0.00"),
                        "persentase_realisasi": 0.0,
                    },
                }
    else:
        yr = await db.get(TahunAnggaran, id_tahun_anggaran)
        tahun_val = yr.tahun if yr else None
        status_val = yr.status if yr else None

    # Query 1: Fetch all PaguAnggaran for the selected fiscal year with joined AkunAnggaran and Bagian
    pagu_stmt = (
        select(PaguAnggaran)
        .options(
            selectinload(PaguAnggaran.akun_anggaran).selectinload(AkunAnggaran.bagian)
        )
        .where(PaguAnggaran.id_tahun_anggaran == id_tahun_anggaran)
    )
    if id_akun_anggaran:
        pagu_stmt = pagu_stmt.where(PaguAnggaran.id_akun_anggaran == id_akun_anggaran)
    if id_bagian is not None:
        pagu_stmt = pagu_stmt.where(PaguAnggaran.akun_anggaran.has(AkunAnggaran.id_bagian == id_bagian))

    pagu_stmt = pagu_stmt.order_by(PaguAnggaran.id_pagu.asc())
    pagu_results = (await db.execute(pagu_stmt)).scalars().all()

    # Query 2: Aggregate verified realizations by (id_akun_anggaran, month) in a single query
    real_stmt = (
        select(
            PaguAnggaran.id_akun_anggaran,
            func.extract("month", RealisasiAnggaran.tanggal_transaksi).label("m_idx"),
            func.coalesce(func.sum(RealisasiAnggaran.jumlah_realisasi), Decimal("0.00")).label("m_total"),
        )
        .join(PaguAnggaran, RealisasiAnggaran.id_pagu == PaguAnggaran.id_pagu)
        .where(
            PaguAnggaran.id_tahun_anggaran == id_tahun_anggaran,
            RealisasiAnggaran.status == "verified",
        )
    )
    if id_akun_anggaran:
        real_stmt = real_stmt.where(PaguAnggaran.id_akun_anggaran == id_akun_anggaran)
    if id_bagian is not None:
        real_stmt = real_stmt.where(PaguAnggaran.akun_anggaran.has(AkunAnggaran.id_bagian == id_bagian))

    real_stmt = real_stmt.group_by(
        PaguAnggaran.id_akun_anggaran,
        func.extract("month", RealisasiAnggaran.tanggal_transaksi),
    )
    real_rows = (await db.execute(real_stmt)).all()

    # Map: (id_akun_anggaran, month) -> total
    account_month_map: Dict[Tuple[int, int], Decimal] = {}
    for r in real_rows:
        account_month_map[(int(r.id_akun_anggaran), int(r.m_idx))] = Decimal(str(r.m_total or 0))

    # Build row items
    month_keys = [
        "januari", "februari", "maret", "april", "mei", "juni",
        "juli", "agustus", "september", "oktober", "november", "desember"
    ]

    tot_pagu = Decimal("0.00")
    tot_months = {k: Decimal("0.00") for k in month_keys}
    tot_realisasi = Decimal("0.00")

    rows = []
    for p in pagu_results:
        akun = p.akun_anggaran
        acc_pagu = Decimal(str(p.pagu_aktif or 0))
        tot_pagu += acc_pagu

        row_months: Dict[str, Decimal] = {}
        row_total_real = Decimal("0.00")

        for m_idx in range(1, 13):
            m_key = month_keys[m_idx - 1]
            m_val = account_month_map.get((p.id_akun_anggaran, m_idx), Decimal("0.00"))
            row_months[m_key] = m_val
            row_total_real += m_val
            tot_months[m_key] += m_val

        tot_realisasi += row_total_real
        row_sisa = acc_pagu - row_total_real
        row_pct = round(float((row_total_real / acc_pagu) * 100), 2) if acc_pagu > 0 else 0.0

        rows.append({
            "id_akun_anggaran": p.id_akun_anggaran,
            "kode_akun": akun.kode_akun if akun else "",
            "nama_akun": akun.nama_akun if akun else "",
            "nama_bagian": akun.bagian.nama_bagian if akun and akun.bagian else None,
            "pagu": acc_pagu,
            **row_months,
            "total_realisasi": row_total_real,
            "sisa_anggaran": row_sisa,
            "persentase_realisasi": row_pct,
        })

    total_sisa = tot_pagu - tot_realisasi
    total_pct = round(float((tot_realisasi / tot_pagu) * 100), 2) if tot_pagu > 0 else 0.0

    total_obj = {
        "pagu": tot_pagu,
        **tot_months,
        "total_realisasi": tot_realisasi,
        "sisa_anggaran": total_sisa,
        "persentase_realisasi": total_pct,
    }

    return {
        "id_tahun_anggaran": id_tahun_anggaran,
        "tahun": tahun_val,
        "status_tahun": status_val,
        "rows": rows,
        "total": total_obj,
    }



# Singletons
tahun_anggaran = CRUDTahunAnggaran(TahunAnggaran)
akun_anggaran = CRUDAkunAnggaran(AkunAnggaran)
pagu_anggaran = CRUDPaguAnggaran(PaguAnggaran)
revisi_anggaran = CRUDRevisiAnggaran(RevisiAnggaran)
realisasi_anggaran = CRUDRealisasiAnggaran(RealisasiAnggaran)
