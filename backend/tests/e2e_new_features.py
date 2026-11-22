"""End-to-end checks for: fiscal-year lifecycle, Surat Tugas, archive sync/filters,
realisasi evidence filter, Satker and bulk archive import.

Run explicitly against an EMPTY MySQL database ending in _test; never uses live data:
    DATABASE_URL=mysql+aiomysql://user:pass@host:3306/kpu_db_test UPLOAD_DIR=/tmp/up \
    SECRET_KEY=<32+ chars> python tests/e2e_new_features.py
"""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy.engine import make_url

url = os.environ.get('DATABASE_URL', '')
if not url or not (make_url(url).database or '').endswith('_test'):
    raise RuntimeError('Explicit disposable DATABASE_URL ending in _test required')
if not os.environ.get('UPLOAD_DIR'):
    raise RuntimeError('Set UPLOAD_DIR to a disposable test directory')

PASSED: list[str] = []


def check(name: str, condition: bool, detail: object = '') -> None:
    if not condition:
        raise AssertionError(f'FAILED: {name} :: {detail}')
    PASSED.append(name)
    print(f'  ok  {name}')


async def main():
    import httpx
    from datetime import date
    from decimal import Decimal
    from sqlalchemy import inspect, select
    from app.core.database import Base, engine, AsyncSessionLocal
    from app.core.passwords import hash_password
    from app.main import app
    from app.models.schema import (AkunAnggaran, Bagian, JenisSurat, PaguAnggaran, Pegawai,
                                   TahunAnggaran)

    async with engine.begin() as conn:
        tables = await conn.run_sync(lambda c: inspect(c).get_table_names())
        if tables:
            raise RuntimeError('E2E test requires an EMPTY database; provision a new disposable database')
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        umum = Bagian(kode_bagian='E2E-UM', nama_bagian='Umum dan Logistik')
        keu = Bagian(kode_bagian='E2E-KEU', nama_bagian='Keuangan')
        db.add_all([umum, keu]); await db.flush()
        people = [
            Pegawai(nama='E2E Admin', nip='e2e-admin', role='Admin', id_bagian=umum.id_bagian, password=hash_password('admin-e2e-password')),
            Pegawai(nama='E2E Umum', nip='e2e-umum', role='Pegawai', id_bagian=umum.id_bagian, password=hash_password('umum-e2e-password')),
            Pegawai(nama='E2E Keuangan', nip='e2e-keu', role='Pegawai', id_bagian=keu.id_bagian, password=hash_password('keu-e2e-password')),
            Pegawai(nama='E2E Viewer', nip='e2e-view', role='Pegawai', id_bagian=keu.id_bagian, password=hash_password('view-e2e-password')),
        ]
        db.add_all(people)
        db.add(JenisSurat(kode_jenis='ST', nama_jenis='Surat Tugas', format_nomor='{nomor_urut}/ST'))
        db.add(JenisSurat(kode_jenis='SD', nama_jenis='Surat Dinas', format_nomor='{nomor_urut}/SD'))
        await db.commit()
        admin_id, umum_id, keu_id, view_id = [p.id_pegawai for p in people]
        umum_bagian = umum.id_bagian
        jenis_sd = (await db.scalar(select(JenisSurat.id_jenis_surat).where(JenisSurat.kode_jenis == 'SD')))

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
        async def login(nip, password):
            r = await client.post('/api/v1/auth/login', json={'nip': nip, 'password': password})
            assert r.status_code == 200, r.text
            return {'Authorization': 'Bearer ' + r.json()['access_token']}
        admin = await login('e2e-admin', 'admin-e2e-password')
        umum = await login('e2e-umum', 'umum-e2e-password')
        keu = await login('e2e-keu', 'keu-e2e-password')
        viewer = await login('e2e-view', 'view-e2e-password')

        # ---------------- 1. Fiscal-year lifecycle with 2-step close ----------------
        print('[1] Tahun anggaran')
        TA = '/api/v1/tahun-anggaran/'
        def ta(tahun, status='active', **extra):
            return {'tahun': tahun, 'status': status, 'tanggal_mulai': f'{tahun}-01-01', 'tanggal_selesai': f'{tahun}-12-31', **extra}
        r = await client.post(TA, headers=admin, json=ta(2024))
        check('first active year needs no confirmation', r.status_code == 201, r.text)
        r = await client.post(TA, headers=admin, json=ta(2025))
        check('activating 2nd year without confirmation is refused (409)', r.status_code == 409, r.text)
        r = await client.post(TA, headers=admin, json=ta(2025, konfirmasi_tutup_tahun=2023))
        check('wrong confirmation year is refused (400)', r.status_code == 400, r.text)
        r = await client.post(TA, headers=admin, json=ta(2023, konfirmasi_tutup_tahun=2024))
        check('activating an OLDER year is refused (400)', r.status_code == 400, r.text)
        r = await client.post(TA, headers=umum, json=ta(2025, konfirmasi_tutup_tahun=2024))
        check('non-admin cannot activate a year (403)', r.status_code == 403, r.text)
        r = await client.post(TA, headers=admin, json=ta(2025, konfirmasi_tutup_tahun=2024))
        check('correct confirmation activates 2025', r.status_code == 201 and r.json()['status'] == 'active', r.text)
        years = {y['tahun']: y for y in (await client.get(TA, headers=admin)).json()['items']}
        check('2024 was closed automatically', years[2024]['status'] == 'closed', years[2024])
        r = await client.post(TA, headers=admin, json=ta(2026, 'draft'))
        draft_id = r.json()['id_tahun_anggaran']
        r = await client.put(f'{TA}{draft_id}', headers=admin, json={'status': 'active'})
        check('edit draft->active without confirmation refused (409)', r.status_code == 409, r.text)
        r = await client.put(f'{TA}{draft_id}', headers=admin, json={'status': 'active', 'konfirmasi_tutup_tahun': 2025})
        check('edit draft->active with confirmation succeeds', r.status_code == 200 and r.json()['status'] == 'active', r.text)
        listing = (await client.get(TA, headers=admin)).json()['items']
        actives = [y['tahun'] for y in listing if y['status'] == 'active']
        check('exactly one active year (2026)', actives == [2026], actives)
        async with AsyncSessionLocal() as db:
            db.add(TahunAnggaran(tahun=2030, status='Perencanaan', tanggal_mulai=date(2030, 1, 1), tanggal_selesai=date(2030, 12, 31)))
            await db.commit()
        r = await client.get(TA, headers=admin)
        legacy = next((y for y in r.json()['items'] if y['tahun'] == 2030), None) if r.status_code == 200 else None
        check('legacy "Perencanaan" row lists without HTTP 500 and reads as draft', r.status_code == 200 and legacy and legacy['status'] == 'draft', r.text[:200])
        r = await client.get(TA + '?status=active&limit=1', headers=keu)
        check('active-year lookup (Input Realisasi) returns 2026', r.status_code == 200 and r.json()['items'][0]['tahun'] == 2026, r.text[:200])

        # ---------------- 2. Surat: klasifikasi, draft, issuance lock, Surat Tugas ----------------
        print('[2] Surat Keluar / Surat Tugas')
        r = await client.post('/api/v1/klasifikasi', headers=admin, json={'kode_klasifikasi': 'E2E.01', 'nama_klasifikasi': 'Klasifikasi E2E', 'kategori_utama': 'Umum & Kepegawaian'})
        check('admin adds kode klasifikasi at /klasifikasi', r.status_code == 200, r.text)
        klas_id = r.json()['id_klasifikasi']
        r = await client.post('/api/v1/klasifikasi', headers=umum, json={'kode_klasifikasi': 'E2E.02', 'nama_klasifikasi': 'x', 'kategori_utama': 'x'})
        check('non-admin cannot add klasifikasi (403)', r.status_code == 403, r.text)
        r = await client.post('/api/v1/surat-keluar/draft', headers=umum, json={'id_bagian': umum_bagian, 'id_klasifikasi': klas_id, 'id_jenis_surat': jenis_sd, 'perihal': 'Undangan Rapat E2E', 'tujuan_surat': 'KPU Kota Manado', 'isi_surat': 'Isi surat lengkap', 'tanggal_surat': '2026-11-20'})
        check('Umum staff creates draft Surat Keluar', r.status_code == 201, r.text)
        sk_id = r.json()['id_surat_keluar']
        r = await client.get('/api/v1/surat-keluar/penerbitan-status', headers=admin)
        check('issuance status reports locked', r.status_code == 200 and r.json()['official_issuance_enabled'] is False, r.text)
        r = await client.post(f'/api/v1/surat-keluar/{sk_id}/finalisasi', headers=admin, json={})
        check('locked issuance returns 409 (UI disables the button)', r.status_code == 409, r.text)
        tugas = {'maksud_tugas': 'Supervisi coklit E2E', 'tempat_tugas': 'KPU Kota Bitung', 'tanggal_mulai': '2026-11-23', 'tanggal_selesai': '2026-11-25', 'beban_anggaran': 'Non-DIPA', 'id_klasifikasi': klas_id, 'pelaksana': [keu_id]}
        r = await client.post('/api/v1/surat-tugas', headers=keu, json=tugas)
        check('non-Umum staff cannot issue Surat Tugas (403)', r.status_code == 403, r.text)
        r = await client.post('/api/v1/surat-tugas', headers=umum, json={**tugas, 'tanggal_selesai': '2026-11-01'})
        check('end date before start refused (422)', r.status_code == 422, r.text)
        r = await client.post('/api/v1/surat-tugas', headers=umum, json={**tugas, 'pelaksana': [999999]})
        check('unknown pelaksana refused (422)', r.status_code == 422, r.text)
        r = await client.post('/api/v1/surat-tugas', headers=umum, json=tugas)
        check('Umum staff issues Surat Tugas as draft', r.status_code == 201 and r.json()['nomor_tugas'].startswith('DRAFT/ST/'), r.text)
        check('Surat Tugas returns its pelaksana', [p['id_pegawai'] for p in r.json()['pelaksana']] == [keu_id], r.text)
        r = await client.get('/api/v1/surat-tugas', headers=keu)
        check('assigned staff sees their Surat Tugas (read-only access)', r.status_code == 200 and len(r.json()) == 1, r.text)
        r = await client.get('/api/v1/surat-tugas', headers=viewer)
        check('unassigned staff sees no Surat Tugas', r.status_code == 200 and r.json() == [], r.text)
        r = await client.get('/api/v1/surat-tugas', headers=admin)
        check('admin sees all Surat Tugas', len(r.json()) == 1, r.text)

        # ---------------- 3. Surat Masuk with attachment + list filters ----------------
        print('[3] Surat Masuk')
        up = await client.post('/api/v1/files/upload', headers=umum, files={'file': ('undangan.pdf', b'%PDF-1.4 surat masuk', 'application/pdf')}, data={'category': 'surat'})
        check('attachment uploads', up.status_code == 201, up.text)
        letter_file = up.json()['file_id']
        r = await client.post('/api/v1/operations/letters', headers=umum, json={'kind': 'masuk', 'subject': 'Undangan Bimtek E2E', 'sender': 'KPU RI', 'recipient': 'Sekretaris', 'number': '01/E2E/2026', 'content': 'Isi undangan', 'date': '2026-11-18', 'file_id': letter_file})
        check('Surat Masuk registered with attachment', r.status_code == 201, r.text)
        L = '/api/v1/operations/letters'
        check('letters search filter', len((await client.get(L + '?search=Bimtek', headers=umum)).json()) == 1)
        check('letters search filter (no match)', (await client.get(L + '?search=tidakada', headers=umum)).json() == [])
        check('letters status filter', len((await client.get(L + '?status=registered', headers=umum)).json()) == 1)
        check('letters year filter', (await client.get(L + '?year=2020', headers=umum)).json() == [] and len((await client.get(L + '?year=2026', headers=umum)).json()) == 1)

        # ---------------- 4. Realisasi evidence -> archive, bukti filter ----------------
        print('[4] Realisasi Anggaran')
        async with AsyncSessionLocal() as db:
            year = await db.scalar(select(TahunAnggaran).where(TahunAnggaran.tahun == 2026))
            akun = AkunAnggaran(kode_akun='E2E-521', nama_akun='Belanja E2E', id_bagian=people[2].id_bagian)
            db.add(akun); await db.flush()
            pagu = PaguAnggaran(id_tahun_anggaran=year.id_tahun_anggaran, id_akun_anggaran=akun.id_akun_anggaran, pagu_awal=Decimal('1000'), pagu_aktif=Decimal('1000'))
            db.add(pagu); await db.commit(); pagu_id = pagu.id_pagu
        proof = await client.post('/api/v1/files/upload', headers=keu, files={'file': ('kuitansi.pdf', b'%PDF-1.4 bukti', 'application/pdf')}, data={'category': 'realisasi'})
        r = await client.post('/api/v1/realisasi-anggaran/', headers=keu, json={'id_pagu': pagu_id, 'tanggal_transaksi': '2026-11-16', 'nomor_dokumen': 'E2E-BUD-1', 'uraian_kegiatan': 'Pembelian ATK', 'jumlah_realisasi': '100.00', 'bukti_file_path': f"/api/v1/files/{proof.json()['file_id']}"})
        check('realisasi with bukti saved', r.status_code == 201, r.text)
        R = '/api/v1/realisasi-anggaran/'
        check('has_bukti=true lists it', (await client.get(R + '?has_bukti=true', headers=admin)).json()['total'] == 1)
        check('has_bukti=false excludes it', (await client.get(R + '?has_bukti=false', headers=admin)).json()['total'] == 0)

        # ---------------- 5. Archive: sync, filters, visibility, trash rules ----------------
        print('[5] Data Arsip')
        A = '/api/v1/arsip/'
        surat_docs = (await client.get(A + '?sumber_modul=surat', headers=admin)).json()
        subs = sorted(d['sub_kategori'] for d in surat_docs)
        check('Surat Masuk/Keluar/Tugas mirrored into archive automatically', subs == ['Surat Keluar', 'Surat Masuk', 'Surat Tugas'], subs)
        masuk = (await client.get(A + '?sumber_modul=surat&sub_kategori=Surat Masuk', headers=admin)).json()
        check('second-level filter Surat Masuk', len(masuk) == 1 and masuk[0]['file_path'] == str(letter_file), masuk)
        real = (await client.get(A + '?sumber_modul=realisasi', headers=admin)).json()
        check('bukti realisasi mirrored under its akun', len(real) == 1 and real[0]['sub_kategori'] == 'E2E-521 - Belanja E2E', real)
        opts = await client.get(A + 'filter-options', headers=umum)
        check('filter options available to non-admin', opts.status_code == 200, opts.text)
        o = opts.json()
        check('filter options list modules and sub-categories', set(o['sumber_modul']) >= {'surat', 'realisasi'} and set(o['sub_kategori']['surat']) == {'Surat Keluar', 'Surat Masuk', 'Surat Tugas'}, o)
        check('same-section staff see their section\'s letters', len((await client.get(A + '?sumber_modul=surat', headers=umum)).json()) == 3)
        check('other-section staff do not see restricted letters', (await client.get(A + '?sumber_modul=surat', headers=viewer)).json() == [])
        check('mirrored attachment downloadable by its section', (await client.get(f'/api/v1/files/{letter_file}', headers=umum)).status_code == 200)
        check('mirrored attachment blocked for other sections', (await client.get(f'/api/v1/files/{letter_file}', headers=viewer)).status_code == 403)
        before = len((await client.get(A + '?limit=500', headers=admin)).json())
        check('non-admin cannot run full sync (403)', (await client.post(A + 'sinkronkan', headers=umum)).status_code == 403)
        r = await client.post(A + 'sinkronkan', headers=admin)
        check('admin full sync runs', r.status_code == 200 and r.json()['realisasi'] == 1, r.text)
        check('sync is idempotent (no duplicates)', len((await client.get(A + '?limit=500', headers=admin)).json()) == before)
        masuk_id = masuk[0]['id_dokumen']
        check('mirrored doc can be moved to trash', (await client.patch(f'{A}{masuk_id}/delete', headers=umum)).status_code == 200)
        await client.post(A + 'sinkronkan', headers=admin)
        check('sync does not pull trashed doc back out of trash', any(d['id_dokumen'] == masuk_id for d in (await client.get(A + 'trash', headers=admin)).json()))
        r = await client.delete(f'{A}{masuk_id}/permanent', headers=admin)
        check('mirrored doc cannot be permanently deleted (409)', r.status_code == 409, r.text)

        # ---------------- 6. Bulk import (same API calls the UI makes per file) ----------------
        print('[6] Impor massal arsip')
        async def import_one(i):
            u = await client.post('/api/v1/files/upload', headers=keu, files={'file': (f'scan-{i}.pdf', f'%PDF-1.4 bulk {i}'.encode(), 'application/pdf')}, data={'category': 'arsip'})
            assert u.status_code == 201, u.text
            return await client.post(A, headers=keu, json={'nama_dokumen': f'Scan {i}', 'nomor_dokumen': f'IMPOR/E2E/{i:03d}', 'id_pegawai': 0, 'kategori': 'Laporan', 'tanggal_dokumen': '2026-11-22', 'hak_akses': 'internal', 'file_path': str(u.json()['file_id']), 'ukuran_file': u.json()['size']})
        results = await asyncio.gather(*[import_one(i) for i in range(1, 6)])
        check('5 parallel bulk-import saves succeed', all(r.status_code == 201 for r in results), [r.text for r in results if r.status_code != 201])
        manual = (await client.get(A + '?sumber_modul=arsip&limit=50', headers=viewer)).json()
        check('imported docs listed as Arsip Umum and visible (internal)', len(manual) == 5, len(manual))
        doc_id = manual[0]['id_dokumen']
        await client.patch(f'{A}{doc_id}/delete', headers=keu)
        check('permanent delete by non-admin (even the owner) refused (403)', (await client.delete(f'{A}{doc_id}/permanent', headers=keu)).status_code == 403)

        print('[6b] Permintaan hapus permanen (disetujui admin)')
        active_id = manual[1]['id_dokumen']
        r = await client.post(f'{A}{active_id}/ajukan-hapus', headers=keu, json={'alasan': 'Dokumen duplikat'})
        check('request on a document not in trash refused (409)', r.status_code == 409, r.text)
        r = await client.post(f'{A}{doc_id}/ajukan-hapus', headers=keu, json={'alasan': 'x'})
        check('request without a proper reason refused (422)', r.status_code == 422, r.text)
        r = await client.post(f'{A}{doc_id}/ajukan-hapus', headers=viewer, json={'alasan': 'Bukan dokumen saya'})
        check('non-owner cannot request deletion (403)', r.status_code == 403, r.text)
        r = await client.post(f'{A}{doc_id}/ajukan-hapus', headers=keu, json={'alasan': 'Dokumen duplikat'})
        check('owner requests permanent deletion', r.status_code == 200 and r.json()['hapus_status'] == 'diajukan' and r.json()['nama_pengaju_hapus'] == 'E2E Keuangan', r.text)
        check('duplicate pending request refused (409)', (await client.post(f'{A}{doc_id}/ajukan-hapus', headers=keu, json={'alasan': 'Dokumen duplikat'})).status_code == 409)
        queue = (await client.get(A + 'trash?hapus_status=diajukan', headers=admin)).json()
        check('admin approval queue lists the request', [d['id_dokumen'] for d in queue] == [doc_id], queue)
        check('non-admin cannot reject (403)', (await client.post(f'{A}{doc_id}/tolak-hapus', headers=keu, json={'catatan': 'tidak'})).status_code == 403)
        r = await client.post(f'{A}{doc_id}/tolak-hapus', headers=admin, json={'catatan': 'Masih masa retensi'})
        check('admin rejects with a note', r.status_code == 200 and r.json()['hapus_status'] == 'ditolak' and r.json()['hapus_catatan_admin'] == 'Masih masa retensi', r.text)
        check('rejected document is still in trash', any(d['id_dokumen'] == doc_id for d in (await client.get(A + 'trash', headers=keu)).json()))
        r = await client.post(f'{A}{doc_id}/ajukan-hapus', headers=keu, json={'alasan': 'Retensi sudah berakhir'})
        check('owner can re-request after rejection', r.status_code == 200 and r.json()['hapus_status'] == 'diajukan', r.text)
        r = await client.delete(f'{A}{doc_id}/permanent', headers=admin)
        check('admin approval permanently deletes the document', r.status_code == 200, r.text)
        check('deleted document is gone', (await client.get(f'{A}{doc_id}', headers=admin)).status_code == 404)
        await client.patch(f'{A}{active_id}/delete', headers=keu)
        await client.post(f'{A}{active_id}/ajukan-hapus', headers=keu, json={'alasan': 'Salah unggah'})
        r = await client.patch(f'{A}{active_id}/restore', headers=keu)
        check('restoring a document cancels its pending request', r.status_code == 200 and r.json()['hapus_status'] is None, r.text)
        r = await client.post(f'{A}{masuk_id}/ajukan-hapus', headers=umum, json={'alasan': 'Tidak diperlukan'})
        check('mirrored Surat/Realisasi documents cannot be requested for deletion (409)', r.status_code == 409, r.text)

        # ---------------- 7. Satker (database, no hardcoded rows) ----------------
        print('[7] Satker')
        S = '/api/v1/satker/'
        check('Satker starts empty (no hardcoded data)', (await client.get(S, headers=umum)).json() == [])
        body = {'kode_satker': '999001', 'nama_satker': 'KPU E2E', 'tingkat': 'Provinsi', 'alamat': 'Jl. Uji', 'pagu': 1000, 'realisasi': 500}
        check('non-admin cannot add Satker (403)', (await client.post(S, headers=umum, json=body)).status_code == 403)
        r = await client.post(S, headers=admin, json=body)
        check('admin adds Satker, persentase computed', r.status_code == 201 and r.json()['persentase'] == 50.0, r.text)
        check('duplicate kode refused (400)', (await client.post(S, headers=admin, json=body)).status_code == 400)
        check('realisasi > pagu refused (422)', (await client.post(S, headers=admin, json={**body, 'kode_satker': '999002', 'realisasi': 2000})).status_code == 422)
        check('Satker persisted in database', len((await client.get(S, headers=umum)).json()) == 1)

    await engine.dispose()
    print(f'\nE2E new-feature checks passed: {len(PASSED)} checks')


if __name__ == '__main__':
    asyncio.run(main())
