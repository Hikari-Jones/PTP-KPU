from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple
from fastapi import HTTPException, status
from sqlalchemy import desc, func, or_, select, String
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.schema import (
    AkunAnggaran,
    Bagian,
    PaguAnggaran,
    Pegawai,
    RealisasiAnggaran,
    RevisiAnggaran,
    TahunAnggaran,
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
    sisa = pagu_aktif - total_verified
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

    async def create_tahun(self, db: AsyncSession, *, obj_in: TahunAnggaranCreate, current_user_id: Optional[int] = None) -> TahunAnggaran:
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

        db_obj = TahunAnggaran(
            tahun=obj_in.tahun,
            status=obj_in.status,
            tanggal_mulai=obj_in.tanggal_mulai,
            tanggal_selesai=obj_in.tanggal_selesai,
            deskripsi=obj_in.deskripsi,
            id_pegawai_pembuat=current_user_id or obj_in.id_pegawai_pembuat,
        )
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def update_tahun(self, db: AsyncSession, *, id_tahun: int, obj_in: TahunAnggaranUpdate) -> TahunAnggaran:
        db_obj = await self.get(db, id_tahun)
        if not db_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tahun anggaran tidak ditemukan",
            )

        update_data = obj_in.model_dump(exclude_unset=True)

        # If tahun is updated, ensure uniqueness
        if "tahun" in update_data and update_data["tahun"] != db_obj.tahun:
            existing = await self.get_by_tahun(db, update_data["tahun"])
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Tahun anggaran {update_data['tahun']} sudah digunakan",
                )

        # Date check
        tgl_mulai = update_data.get("tanggal_mulai", db_obj.tanggal_mulai)
        tgl_selesai = update_data.get("tanggal_selesai", db_obj.tanggal_selesai)
        if tgl_mulai >= tgl_selesai:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tanggal mulai harus lebih awal dari tanggal selesai",
            )

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

        # Check if any PaguAnggaran references this year
        pagu_count_stmt = select(func.count(PaguAnggaran.id_pagu)).where(PaguAnggaran.id_tahun_anggaran == id_tahun)
        pagu_res = await db.execute(pagu_count_stmt)
        if (pagu_res.scalar_one() or 0) > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tahun anggaran tidak dapat dihapus karena masih memiliki alokasi pagu anggaran",
            )

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

        return {
            "id_tahun_anggaran": t.id_tahun_anggaran,
            "tahun": t.tahun,
            "status": t.status,
            "tanggal_mulai": t.tanggal_mulai,
            "tanggal_selesai": t.tanggal_selesai,
            "deskripsi": t.deskripsi,
            "id_pegawai_pembuat": t.id_pegawai_pembuat,
            "nama_pembuat": t.pembuat.nama if t.pembuat else None,
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

        # Check unique kode_akun
        existing = await self.get_by_kode(db, obj_in.kode_akun)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Kode akun {obj_in.kode_akun} sudah digunakan",
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

        if "kode_akun" in update_data and update_data["kode_akun"] != db_obj.kode_akun:
            existing = await self.get_by_kode(db, update_data["kode_akun"])
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Kode akun {update_data['kode_akun']} sudah digunakan",
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

        # Check references in pagu_anggaran
        pagu_cnt_stmt = select(func.count(PaguAnggaran.id_pagu)).where(PaguAnggaran.id_akun_anggaran == id_akun)
        pagu_res = await db.execute(pagu_cnt_stmt)
        if (pagu_res.scalar_one() or 0) > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Akun anggaran tidak dapat dihapus karena sudah memiliki alokasi pagu tahunan",
            )

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
        if id_bagian:
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

        db_obj = PaguAnggaran(
            id_tahun_anggaran=obj_in.id_tahun_anggaran,
            id_akun_anggaran=obj_in.id_akun_anggaran,
            pagu_awal=pagu_awal,
            pagu_aktif=pagu_aktif,
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

        update_data = obj_in.model_dump(exclude_unset=True)
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
        if id_bagian:
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

        enriched_items = []
        for p in items:
            # Sum verified realization for each pagu
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
            sisa = pagu_aktif - total_verified
            persentase = float((total_verified / pagu_aktif) * 100) if pagu_aktif > 0 else 0.0

            enriched_items.append({
                "id_pagu": p.id_pagu,
                "id_tahun_anggaran": p.id_tahun_anggaran,
                "id_akun_anggaran": p.id_akun_anggaran,
                "pagu_awal": p.pagu_awal,
                "pagu_aktif": pagu_aktif,
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
        sisa = pagu_aktif - total_verified
        persentase = float((total_verified / pagu_aktif) * 100) if pagu_aktif > 0 else 0.0

        return {
            "id_pagu": p.id_pagu,
            "id_tahun_anggaran": p.id_tahun_anggaran,
            "id_akun_anggaran": p.id_akun_anggaran,
            "pagu_awal": p.pagu_awal,
            "pagu_aktif": pagu_aktif,
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

        # If reducing budget, verify it doesn't drop below verified realization
        sum_stmt = (
            select(func.coalesce(func.sum(RealisasiAnggaran.jumlah_realisasi), Decimal("0.00")))
            .where(
                RealisasiAnggaran.id_pagu == obj_in.id_pagu,
                RealisasiAnggaran.status == "verified",
            )
        )
        sum_res = await db.execute(sum_stmt)
        verified_total = Decimal(str(sum_res.scalar_one() or 0))

        if pagu_sesudah < verified_total:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Pagu revisi ({pagu_sesudah:,.2f}) tidak boleh lebih kecil dari total realisasi terverifikasi saat ini ({verified_total:,.2f})",
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
        )
        db.add(revisi_obj)

        # 2. Update pagu_aktif
        pagu.pagu_aktif = pagu_sesudah
        db.add(pagu)

        # Single atomic commit
        await db.commit()
        await db.refresh(revisi_obj)
        return revisi_obj

    async def get_detail(self, db: AsyncSession, id_revisi: int) -> Optional[RevisiAnggaran]:
        stmt = (
            select(RevisiAnggaran)
            .options(selectinload(RevisiAnggaran.pegawai))
            .where(RevisiAnggaran.id_revisi == id_revisi)
        )
        res = await db.execute(stmt)
        return res.scalar_one_or_none()

    async def get_history_by_pagu(self, db: AsyncSession, id_pagu: int) -> List[RevisiAnggaran]:
        stmt = (
            select(RevisiAnggaran)
            .options(selectinload(RevisiAnggaran.pegawai))
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
            .options(selectinload(RevisiAnggaran.pegawai))
            .order_by(desc(RevisiAnggaran.tanggal_revisi), desc(RevisiAnggaran.id_revisi))
            .offset(skip)
            .limit(limit)
        )
        if conditions:
            stmt = stmt.where(*conditions)
        res = await db.execute(stmt)
        items = list(res.scalars().all())

        enriched = []
        for r in items:
            perubahan = (r.pagu_sesudah or Decimal("0.00")) - (r.pagu_sebelum or Decimal("0.00"))
            enriched.append({
                "id_revisi": r.id_revisi,
                "id_pagu": r.id_pagu,
                "id_pegawai": r.id_pegawai,
                "nomor_revisi": r.nomor_revisi,
                "tanggal_revisi": r.tanggal_revisi,
                "pagu_sebelum": r.pagu_sebelum,
                "pagu_sesudah": r.pagu_sesudah,
                "perubahan_netto": perubahan,
                "alasan_revisi": r.alasan_revisi,
                "nama_pegawai": r.pegawai.nama if r.pegawai else None,
                "created_at": r.created_at,
            })

        return enriched, total

    def enrich_revisi_response(self, r: RevisiAnggaran) -> Dict[str, Any]:
        perubahan = (r.pagu_sesudah or Decimal("0.00")) - (r.pagu_sebelum or Decimal("0.00"))
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
            "nama_pegawai": r.pegawai.nama if r.pegawai else None,
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

    async def create_draft(
        self,
        db: AsyncSession,
        *,
        obj_in: RealisasiAnggaranCreateDraft,
        id_pegawai: int,
    ) -> RealisasiAnggaran:
        """
        Creates a new draft transaction.
        - id_pagu is mandatory for new transactions.
        - id_akun_anggaran is automatically resolved from pagu_anggaran.
        - status starts as 'draft' (not counted in budget realization).
        """
        if obj_in.jumlah_realisasi <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Jumlah realisasi transaksi harus lebih besar dari 0",
            )

        # Validate Pegawai
        pegawai = await db.get(Pegawai, id_pegawai)
        if not pegawai:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Pegawai dengan ID {id_pegawai} tidak ditemukan",
            )

        # Validate PaguAnggaran and fiscal year
        pagu_stmt = (
            select(PaguAnggaran)
            .options(selectinload(PaguAnggaran.tahun_anggaran))
            .where(PaguAnggaran.id_pagu == obj_in.id_pagu)
        )
        pagu_res = await db.execute(pagu_stmt)
        pagu = pagu_res.scalar_one_or_none()
        if not pagu:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Pagu anggaran dengan ID {obj_in.id_pagu} tidak ditemukan",
            )

        if pagu.tahun_anggaran.status == "closed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tahun anggaran sudah ditutup (closed), transaksi baru ditolak",
            )

        db_obj = RealisasiAnggaran(
            id_pagu=obj_in.id_pagu,
            id_akun_anggaran=pagu.id_akun_anggaran,
            id_pegawai=id_pegawai,
            tanggal_transaksi=obj_in.tanggal_transaksi,
            nomor_dokumen=obj_in.nomor_dokumen.strip(),
            uraian_kegiatan=obj_in.uraian_kegiatan.strip(),
            jumlah_realisasi=obj_in.jumlah_realisasi,
            status="draft",
            periode=obj_in.periode,
            bukti_file_path=obj_in.bukti_file_path,
            bukti_file_nama=obj_in.bukti_file_nama,
            bukti_file_ukuran=obj_in.bukti_file_ukuran,
            bukti_file_mime=obj_in.bukti_file_mime,
        )
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return await self.get_detail(db, db_obj.id_realisasi)

    async def update_draft(
        self,
        db: AsyncSession,
        *,
        id_realisasi: int,
        obj_in: RealisasiAnggaranUpdateDraft,
        current_user_id: int,
    ) -> RealisasiAnggaran:
        db_obj = await self.get(db, id_realisasi)
        if not db_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Transaksi realisasi tidak ditemukan",
            )

        # Only draft or rejected transactions can be modified
        if db_obj.status not in ["draft", "rejected"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Transaksi dengan status '{db_obj.status}' tidak dapat diubah",
            )

        update_data = obj_in.model_dump(exclude_unset=True)
        if "jumlah_realisasi" in update_data and update_data["jumlah_realisasi"] <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Jumlah realisasi transaksi harus lebih besar dari 0",
            )

        for field, val in update_data.items():
            setattr(db_obj, field, val)

        # If it was rejected, reset to draft upon edit
        if db_obj.status == "rejected":
            db_obj.status = "draft"
            db_obj.catatan_verifikasi = None

        db.add(db_obj)
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
        db_obj = await self.get(db, id_realisasi)
        if not db_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Transaksi realisasi tidak ditemukan",
            )

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

        # Check available budget
        summary = await calculate_budget_summary(db, db_obj.id_pagu)
        if db_obj.jumlah_realisasi > summary.sisa_anggaran:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Jumlah transaksi ({db_obj.jumlah_realisasi:,.2f}) melebihi sisa anggaran yang tersedia ({summary.sisa_anggaran:,.2f})",
            )

        db_obj.status = "submitted"
        db.add(db_obj)
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
        tx_stmt = select(RealisasiAnggaran).where(RealisasiAnggaran.id_realisasi == id_realisasi).with_for_update()
        tx_res = await db.execute(tx_stmt)
        tx = tx_res.scalar_one_or_none()
        if not tx:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Transaksi realisasi tidak ditemukan",
            )

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

        # Atomic recalculation of verified realization
        sum_stmt = (
            select(func.coalesce(func.sum(RealisasiAnggaran.jumlah_realisasi), Decimal("0.00")))
            .where(
                RealisasiAnggaran.id_pagu == tx.id_pagu,
                RealisasiAnggaran.status == "verified",
            )
        )
        sum_res = await db.execute(sum_stmt)
        current_verified = Decimal(str(sum_res.scalar_one() or 0))

        pagu_aktif = pagu.pagu_aktif or Decimal("0.00")
        available_budget = pagu_aktif - current_verified

        if tx.jumlah_realisasi > available_budget:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Verifikasi ditolak: Transaksi ({tx.jumlah_realisasi:,.2f}) melebihi sisa anggaran aktif ({available_budget:,.2f})",
            )

        # Apply approval
        tx.status = "verified"
        tx.id_verifier = id_verifier
        tx.verified_at = datetime.now()
        tx.catatan_verifikasi = obj_in.catatan_verifikasi

        db.add(tx)
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
        tx = await self.get(db, id_realisasi)
        if not tx:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaksi realisasi tidak ditemukan")

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
        await db.commit()
        await db.refresh(tx)
        return await self.get_detail(db, tx.id_realisasi)

    async def delete_draft(
        self,
        db: AsyncSession,
        *,
        id_realisasi: int,
        current_user_id: int,
    ) -> RealisasiAnggaran:
        """
        Only draft transactions can be deleted.
        """
        tx = await self.get(db, id_realisasi)
        if not tx:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaksi tidak ditemukan")

        if tx.status != "draft":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Hanya transaksi berstatus 'draft' yang dapat dihapus",
            )

        await db.delete(tx)
        await db.commit()
        return tx

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
        tanggal_mulai: Optional[date] = None,
        tanggal_selesai: Optional[date] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> Tuple[List[Dict[str, Any]], int]:
        conditions = []
        if status:
            conditions.append(RealisasiAnggaran.status == status)
        if id_pagu:
            conditions.append(RealisasiAnggaran.id_pagu == id_pagu)
        if id_akun_anggaran:
            conditions.append(RealisasiAnggaran.id_akun_anggaran == id_akun_anggaran)
        if tanggal_mulai:
            conditions.append(RealisasiAnggaran.tanggal_transaksi >= tanggal_mulai)
        if tanggal_selesai:
            conditions.append(RealisasiAnggaran.tanggal_transaksi <= tanggal_selesai)
        if id_tahun_anggaran:
            conditions.append(
                RealisasiAnggaran.pagu_anggaran.has(PaguAnggaran.id_tahun_anggaran == id_tahun_anggaran)
            )
        if id_bagian:
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

        enriched_items = []
        for r in items:
            enriched_items.append(self.enrich_realisasi_dict(r))

        return enriched_items, total

    def enrich_realisasi_dict(self, r: RealisasiAnggaran) -> Dict[str, Any]:
        pagu_aktif = r.pagu_anggaran.pagu_aktif if r.pagu_anggaran else None
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
        }

    async def enrich_realisasi_response(self, db: AsyncSession, r: RealisasiAnggaran) -> Dict[str, Any]:
        return self.enrich_realisasi_dict(r)


# =========================================================
# 6. DASHBOARD & AGGREGATE SUMMARY SERVICE
# =========================================================

async def get_dashboard_summary(db: AsyncSession, id_tahun_anggaran: Optional[int] = None) -> Dict[str, Any]:
    """
    Calculates macro aggregate budget summary for active fiscal year or specified year.
    Returns:
    - total_pagu_aktif
    - total_realisasi_verified
    - total_sisa_anggaran
    - persentase_serapan
    - id_tahun_anggaran
    - tahun
    """
    if not id_tahun_anggaran:
        active_yr = await tahun_anggaran.get_active_year(db)
        if active_yr:
            id_tahun_anggaran = active_yr.id_tahun_anggaran
            tahun_val = active_yr.tahun
        else:
            # fallback to latest year
            latest_stmt = select(TahunAnggaran).order_by(desc(TahunAnggaran.tahun)).limit(1)
            latest_res = await db.execute(latest_stmt)
            latest_yr = latest_res.scalar_one_or_none()
            if latest_yr:
                id_tahun_anggaran = latest_yr.id_tahun_anggaran
                tahun_val = latest_yr.tahun
            else:
                return {
                    "id_tahun_anggaran": None,
                    "tahun": None,
                    "total_pagu_aktif": Decimal("0.00"),
                    "total_realisasi_verified": Decimal("0.00"),
                    "total_sisa_anggaran": Decimal("0.00"),
                    "persentase_serapan": 0.0,
                }
    else:
        yr = await db.get(TahunAnggaran, id_tahun_anggaran)
        tahun_val = yr.tahun if yr else None

    # Total pagu aktif for this year
    pagu_sum_stmt = select(
        func.coalesce(func.sum(PaguAnggaran.pagu_aktif), Decimal("0.00"))
    ).where(PaguAnggaran.id_tahun_anggaran == id_tahun_anggaran)
    pagu_res = await db.execute(pagu_sum_stmt)
    total_pagu = Decimal(str(pagu_res.scalar_one() or 0))

    # Total verified realization for this year
    real_sum_stmt = (
        select(func.coalesce(func.sum(RealisasiAnggaran.jumlah_realisasi), Decimal("0.00")))
        .join(PaguAnggaran, RealisasiAnggaran.id_pagu == PaguAnggaran.id_pagu)
        .where(
            PaguAnggaran.id_tahun_anggaran == id_tahun_anggaran,
            RealisasiAnggaran.status == "verified",
        )
    )
    real_res = await db.execute(real_sum_stmt)
    total_verified = Decimal(str(real_res.scalar_one() or 0))

    sisa = total_pagu - total_verified
    persentase = float((total_verified / total_pagu) * 100) if total_pagu > 0 else 0.0

    # Count transactions by status for this year
    async def get_tx_count(status_name: str) -> int:
        c_stmt = (
            select(func.count(RealisasiAnggaran.id_realisasi))
            .join(PaguAnggaran, RealisasiAnggaran.id_pagu == PaguAnggaran.id_pagu)
            .where(
                PaguAnggaran.id_tahun_anggaran == id_tahun_anggaran,
                RealisasiAnggaran.status == status_name,
            )
        )
        c_res = await db.execute(c_stmt)
        return int(c_res.scalar_one() or 0)

    draft_cnt = await get_tx_count("draft")
    submitted_cnt = await get_tx_count("submitted")
    verified_cnt = await get_tx_count("verified")
    rejected_cnt = await get_tx_count("rejected")

    status_val = yr.status if 'yr' in locals() and yr else (active_yr.status if 'active_yr' in locals() and active_yr else None)

    return {
        "id_tahun_anggaran": id_tahun_anggaran,
        "tahun": tahun_val,
        "status_tahun": status_val,
        "total_pagu_aktif": total_pagu,
        "total_realisasi_verified": total_verified,
        "total_sisa_anggaran": sisa,
        "persentase_serapan": round(persentase, 2),
        "total_transaksi_draft": draft_cnt,
        "total_transaksi_submitted": submitted_cnt,
        "total_transaksi_verified": verified_cnt,
        "total_transaksi_rejected": rejected_cnt,
    }


# Singletons
tahun_anggaran = CRUDTahunAnggaran(TahunAnggaran)
akun_anggaran = CRUDAkunAnggaran(AkunAnggaran)
pagu_anggaran = CRUDPaguAnggaran(PaguAnggaran)
revisi_anggaran = CRUDRevisiAnggaran(RevisiAnggaran)
realisasi_anggaran = CRUDRealisasiAnggaran(RealisasiAnggaran)
