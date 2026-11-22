"""Latency check with several years of realistic data. Disposable *_test database only.

    DATABASE_URL=mysql+aiomysql://user:pass@host:3306/kpu_perf_test UPLOAD_DIR=/tmp/up \
    SECRET_KEY=<32+ chars> python tests/perf_endpoints.py
Run the container with e.g. --cpus=2 to approximate the target hardware.
"""
import asyncio
import os
import statistics
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy.engine import make_url

url = os.environ.get('DATABASE_URL', '')
if not url or not (make_url(url).database or '').endswith('_test'):
    raise RuntimeError('Explicit disposable DATABASE_URL ending in _test required')

YEARS = list(range(2021, 2027))
N_AKUN, N_TX, N_LETTERS, N_SURAT, N_ARSIP = 120, 4000, 3000, 2000, 3000
SLOW_MS = 500  # budget for one API call on the target AIO


async def seed():
    from datetime import date, timedelta
    from decimal import Decimal
    from random import Random
    from sqlalchemy import inspect
    from app.core.database import Base, engine, AsyncSessionLocal
    from app.core.passwords import hash_password
    from app.core.reference_data import ensure_reference_data
    from app.models.operations import WorkflowLetter
    from app.models.schema import (AkunAnggaran, Bagian, DokumenArsip, FileRecord, JenisSurat,
                                   KodeKlasifikasiArsip, PaguAnggaran, Pegawai, RealisasiAnggaran,
                                   SuratKeluar, TahunAnggaran)
    from sqlalchemy import select
    rnd = Random(7)
    async with engine.begin() as conn:
        if await conn.run_sync(lambda c: inspect(c).get_table_names()):
            raise RuntimeError('Perf test requires an EMPTY database')
        await conn.run_sync(Base.metadata.create_all)
    t0 = time.perf_counter()
    async with AsyncSessionLocal() as db:
        await ensure_reference_data(db)
        sections = [Bagian(kode_bagian=f'B{i}', nama_bagian=n) for i, n in enumerate(
            ['Umum dan Logistik', 'Keuangan', 'Perencanaan, Data dan Informasi', 'Hukum', 'Teknis', 'SDM'])]
        db.add_all(sections); await db.flush()
        users = [Pegawai(nama=f'Pegawai {i}', nip=f'perf-{i}', role='Admin' if i == 0 else 'Pegawai',
                         id_bagian=sections[i % len(sections)].id_bagian, password=hash_password('perf-password-123'))
                 for i in range(40)]
        db.add_all(users); await db.flush()
        klas = (await db.scalars(select(KodeKlasifikasiArsip))).all()
        jenis = (await db.scalars(select(JenisSurat))).all()
        years = [TahunAnggaran(tahun=y, status='active' if y == YEARS[-1] else 'closed',
                               tanggal_mulai=date(y, 1, 1), tanggal_selesai=date(y, 12, 31)) for y in YEARS]
        akun = [AkunAnggaran(kode_akun=f'52{i:04d}', nama_akun=f'Belanja {i}', id_bagian=sections[i % 6].id_bagian)
                for i in range(N_AKUN)]
        db.add_all(years + akun); await db.flush()
        pagu = [PaguAnggaran(id_tahun_anggaran=y.id_tahun_anggaran, id_akun_anggaran=a.id_akun_anggaran,
                             pagu_awal=Decimal('500000000'), pagu_aktif=Decimal('500000000')) for y in years for a in akun]
        db.add_all(pagu); await db.flush()
        files = [FileRecord(original_name=f'f{i}.pdf', stored_name=f'f{i}.pdf', relative_path=f'x/f{i}.pdf',
                            mime_type='application/pdf', file_size=200_000, category='realisasi',
                            uploaded_by=users[i % 40].id_pegawai) for i in range(N_TX)]
        db.add_all(files); await db.flush()
        for i in range(N_TX):
            p = pagu[rnd.randrange(len(pagu))]
            y = YEARS[[yy.id_tahun_anggaran for yy in years].index(p.id_tahun_anggaran)]
            db.add(RealisasiAnggaran(id_pagu=p.id_pagu, id_akun_anggaran=p.id_akun_anggaran,
                                     id_pegawai=users[i % 40].id_pegawai, tanggal_transaksi=date(y, 1, 1) + timedelta(days=rnd.randrange(360)),
                                     nomor_dokumen=f'BUD-{i}', uraian_kegiatan=f'Kegiatan {i}', jumlah_realisasi=Decimal(rnd.randrange(1, 5_000_000)),
                                     status='verified', bukti_file_path=f'/api/v1/files/{files[i].id_file}'))
        for i in range(N_LETTERS):
            d = date(rnd.choice(YEARS), 1, 1) + timedelta(days=rnd.randrange(360))
            db.add(WorkflowLetter(kind=rnd.choice(['masuk', 'keluar']), subject=f'Surat perihal {i}', sender='KPU RI',
                                  recipient='Sekretaris', content='Isi ' * 50, date=d, status='registered',
                                  owner_id=users[i % 40].id_pegawai, version=1, history=[]))
        for i in range(N_SURAT):
            d = date(rnd.choice(YEARS), 1, 1) + timedelta(days=rnd.randrange(360))
            db.add(SuratKeluar(id_pegawai=users[i % 40].id_pegawai, id_bagian=sections[0].id_bagian,
                               id_klasifikasi=rnd.choice(klas).id_klasifikasi, id_jenis_surat=rnd.choice(jenis).id_jenis_surat,
                               tahun=d.year, bulan_romawi='I', perihal=f'Perihal {i}', tujuan_surat='KPU Kab', tanggal_surat=d, status='draft'))
        for i in range(N_ARSIP):
            d = date(rnd.choice(YEARS), 1, 1) + timedelta(days=rnd.randrange(360))
            db.add(DokumenArsip(id_pegawai=users[i % 40].id_pegawai, nama_dokumen=f'Dokumen {i}', nomor_dokumen=f'ARS-{i}',
                                kategori=rnd.choice(['Laporan', 'SK', 'Notulen']), tanggal_dokumen=d, hak_akses='internal'))
        await db.commit()
    print(f'seeded in {time.perf_counter() - t0:.1f}s')
    from app.services.arsip_sync import sync_all
    for label in ('first full sync (startup backfill)', 'repeat sync (every later startup)'):
        t0 = time.perf_counter()
        async with AsyncSessionLocal() as db:
            counts = await sync_all(db)
        print(f'{label}: {time.perf_counter() - t0:.1f}s {counts}')


async def measure():
    import httpx
    from app.main import app
    results = []
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://t', timeout=120) as c:
        async def token(nip):
            r = await c.post('/api/v1/auth/login', json={'nip': nip, 'password': 'perf-password-123'})
            return {'Authorization': 'Bearer ' + r.json()['access_token']}
        admin, staff = await token('perf-0'), await token('perf-1')
        checks = [
            ('Dashboard utama', '/api/v1/dashboard/overview?year=2026', admin),
            ('Ringkasan anggaran', '/api/v1/anggaran/summary', admin),
            ('Laporan bulanan', '/api/v1/anggaran/monthly-report', admin),
            ('Tahun anggaran (list)', '/api/v1/tahun-anggaran/?limit=100', admin),
            ('Pagu anggaran (list)', '/api/v1/pagu-anggaran/?limit=200', admin),
            ('Akun anggaran (list)', '/api/v1/akun-anggaran/?limit=200', admin),
            ('Transaksi realisasi p.1', '/api/v1/realisasi-anggaran/?limit=50', admin),
            ('Transaksi + filter bukti', '/api/v1/realisasi-anggaran/?limit=50&has_bukti=true&search=Kegiatan', admin),
            ('Surat keluar (100)', '/api/v1/surat-keluar?limit=100', admin),
            ('Surat masuk/alur p.1', '/api/v1/operations/letters?limit=51&kind=masuk', admin),
            ('Surat masuk + filter', '/api/v1/operations/letters?limit=51&search=perihal&year=2024', admin),
            ('Arsip p.1 (admin)', '/api/v1/arsip/?limit=50', admin),
            ('Arsip p.1 (staff, akses)', '/api/v1/arsip/?limit=50', staff),
            ('Arsip filter modul+sub', '/api/v1/arsip/?limit=50&sumber_modul=surat&sub_kategori=Surat%20Masuk', admin),
            ('Arsip filter options', '/api/v1/arsip/filter-options', staff),
            ('Klasifikasi', '/api/v1/klasifikasi', staff),
            ('Pegawai (1000)', '/api/v1/pegawai/?limit=1000', staff),
        ]
        for name, path, headers in checks:
            times = []
            for _ in range(5):
                t0 = time.perf_counter()
                r = await c.get(path, headers=headers)
                times.append((time.perf_counter() - t0) * 1000)
            size = len(r.content)
            results.append((name, r.status_code, statistics.median(times), max(times), size))
    print(f"\n{'Endpoint':<28}{'HTTP':>5}{'median ms':>11}{'max ms':>9}{'KB':>8}")
    for name, code, med, mx, size in results:
        flag = '  <-- SLOW' if med > SLOW_MS or code != 200 else ''
        print(f'{name:<28}{code:>5}{med:>11.0f}{mx:>9.0f}{size / 1024:>8.0f}{flag}')


async def main():
    await seed()
    await measure()
    from app.core.database import engine
    await engine.dispose()

if __name__ == '__main__':
    asyncio.run(main())
