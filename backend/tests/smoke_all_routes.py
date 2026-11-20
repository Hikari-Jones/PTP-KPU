"""End-to-end smoke test of every API route used by the web UI.

Run ONLY against an EMPTY disposable MySQL database whose name ends in _test:

    DATABASE_URL=mysql+aiomysql://user:pass@host:port/kpu_db_test \
    SECRET_KEY=<32+ chars test secret> UPLOAD_DIR=<disposable dir> \
    python tests/smoke_all_routes.py

Every step states the status codes a correct server returns, covering both the
happy path and the mistakes a user can make (bad input, missing permission,
duplicates, stale versions). Any 5xx, any unexpected status, and any error
response without a readable JSON "detail" message counts as a failure.
"""
import asyncio
import os
from pathlib import Path
import sys
from datetime import date

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy.engine import make_url

url = os.environ.get('DATABASE_URL', '')
if not url or not (make_url(url).database or '').endswith('_test'):
    raise RuntimeError('Explicit disposable DATABASE_URL ending in _test required')
if not os.environ.get('UPLOAD_DIR'):
    raise RuntimeError('Set UPLOAD_DIR to a disposable test directory')

RESULTS = []


async def main():
    import httpx
    from sqlalchemy import inspect
    from app.core.database import Base, engine, AsyncSessionLocal
    from app.core.passwords import hash_password
    from app.models.schema import Bagian, Pegawai, KodeKlasifikasiArsip, JenisSurat
    from app.main import app

    async with engine.begin() as conn:
        if await conn.run_sync(lambda c: inspect(c).get_table_names()):
            raise RuntimeError('Smoke test requires an EMPTY database')
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncSessionLocal() as db:
        umum = Bagian(kode_bagian='UMUM', nama_bagian='Umum dan Logistik')
        keu = Bagian(kode_bagian='KEU', nama_bagian='Keuangan')
        db.add_all([umum, keu]); await db.flush()
        db.add_all([
            Pegawai(nama='Smoke Admin', nip='smoke-admin', role='Admin', id_bagian=umum.id_bagian,
                    password=hash_password('smoke-admin-password')),
            Pegawai(nama='Smoke Other', nip='smoke-other', role='Pegawai', id_bagian=umum.id_bagian,
                    password=hash_password('smoke-other-password')),
            Pegawai(nama='Smoke Operator', nip='smoke-operator', role='Pegawai', id_bagian=keu.id_bagian,
                    password=hash_password('smoke-operator-password')),
            KodeKlasifikasiArsip(kode_klasifikasi='PL.01', nama_klasifikasi='Perencanaan', kategori_utama='Pemilu'),
            JenisSurat(kode_jenis='SMK', nama_jenis='Smoke Test', format_nomor='{nomor}/{kode}/{tahun}'),
        ])
        await db.commit()
        umum_id, keu_id = umum.id_bagian, keu.id_bagian

    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url='http://test', timeout=60) as client:

        async def step(name, method, path, expect, headers=None, **kwargs):
            try:
                res = await client.request(method, '/api/v1' + path, headers=headers, **kwargs)
            except Exception as exc:  # transport-level crash
                RESULTS.append((name, 'FAIL', f'exception {type(exc).__name__}: {exc}'))
                return None
            ok = res.status_code in expect
            note = f'{method} {path} -> {res.status_code}'
            if res.status_code >= 400:
                try:
                    detail = res.json().get('detail')
                except Exception:
                    detail = None
                if not detail:
                    ok = False
                    note += ' (error without readable JSON detail)'
                else:
                    note += f' [{str(detail)[:90]}]'
            if res.status_code >= 500 and res.status_code not in expect:
                ok = False
            RESULTS.append((name, 'ok' if ok else 'FAIL', note if not ok else f'{res.status_code}'))
            if not ok:
                print(f'FAIL  {name}  {note}  body={res.text[:300]}', flush=True)
            return res

        async def login(nip, password):
            r = await step(f'login {nip}', 'POST', '/auth/login', {200}, json={'nip': nip, 'password': password})
            return {'Authorization': 'Bearer ' + r.json()['access_token']}

        # --- Authentication -------------------------------------------------
        admin = await login('smoke-admin', 'smoke-admin-password')
        op = await login('smoke-operator', 'smoke-operator-password')
        other = await login('smoke-other', 'smoke-other-password')
        await step('login wrong password', 'POST', '/auth/login', {401}, json={'nip': 'smoke-admin', 'password': 'nope'})
        await step('login unknown user', 'POST', '/auth/login', {401}, json={'nip': 'ghost', 'password': 'whatever-pass'})
        await step('login empty body', 'POST', '/auth/login', {422}, json={})
        await step('no token', 'GET', '/auth/me', {401})
        await step('garbage token', 'GET', '/auth/me', {401}, headers={'Authorization': 'Bearer abc'})
        await step('me admin', 'GET', '/auth/me', {200}, headers=admin)
        await step('status', 'GET', '/status', {200}, headers=admin)

        # --- Bagian (departments) ------------------------------------------
        r = await step('bagian create', 'POST', '/bagian/', {201}, headers=admin, json={'nama_bagian': 'Hukum'})
        hukum = r.json()['id_bagian']
        await step('bagian create by operator', 'POST', '/bagian/', {403}, headers=op, json={'nama_bagian': 'X'})
        await step('bagian create empty', 'POST', '/bagian/', {422}, headers=admin, json={})
        await step('bagian list', 'GET', '/bagian/', {200}, headers=op)
        await step('bagian get', 'GET', f'/bagian/{hukum}', {200}, headers=admin)
        await step('bagian get missing', 'GET', '/bagian/999999', {404}, headers=admin)
        await step('bagian update', 'PUT', f'/bagian/{hukum}', {200}, headers=admin, json={'nama_bagian': 'Hukum & Pengawasan'})

        # --- Pegawai (users) -----------------------------------------------
        new_user = {'nama': 'Staf Baru', 'nip': 'smoke-new', 'role': 'Pegawai', 'password': 'staf-password-123', 'id_bagian': hukum}
        r = await step('pegawai create', 'POST', '/pegawai/', {201}, headers=admin, json=new_user)
        new_id = r.json()['id_pegawai']
        await step('pegawai duplicate NIP', 'POST', '/pegawai/', {400, 409}, headers=admin, json=new_user)
        await step('pegawai short password', 'POST', '/pegawai/', {422}, headers=admin, json={**new_user, 'nip': 'x2', 'password': '123'})
        await step('pegawai create by operator', 'POST', '/pegawai/', {403}, headers=op, json={**new_user, 'nip': 'x3'})
        await step('pegawai list', 'GET', '/pegawai/', {200}, headers=admin)
        await step('pegawai get', 'GET', f'/pegawai/{new_id}', {200}, headers=admin)
        await step('pegawai update', 'PUT', f'/pegawai/{new_id}', {200}, headers=admin, json={'jabatan': 'Staf'})
        await step('bagian delete while in use', 'DELETE', f'/bagian/{hukum}', {400, 409}, headers=admin)
        await step('pegawai delete', 'DELETE', f'/pegawai/{new_id}', {200, 409}, headers=admin)
        # Satker data is intentionally disabled until linked to a verified source.
        await step('satker list (disabled by policy)', 'GET', '/satker/', {200, 503}, headers=op)

        # --- Files + Arsip -------------------------------------------------
        pdf = ('doc.pdf', b'%PDF-1.4 smoke', 'application/pdf')
        await step('upload bad extension', 'POST', '/files/upload', {415}, headers=op, files={'file': ('x.exe', b'MZ', 'application/octet-stream')})
        r = await step('upload pdf', 'POST', '/files/upload', {201}, headers=op, files={'file': pdf}, data={'category': 'arsip'})
        fid = r.json()['file_id']
        base = {'nama_dokumen': 'Laporan', 'nomor_dokumen': 'ARS-1', 'id_pegawai': 0, 'kategori': 'Laporan',
                'tanggal_dokumen': '2026-11-20', 'hak_akses': 'internal', 'file_path': str(fid)}
        r = await step('arsip create (no classification, as UI sends)', 'POST', '/arsip/', {201}, headers=op, json=base)
        aid = r.json()['id_dokumen']
        await step('arsip create bad classification', 'POST', '/arsip/', {422}, headers=op, json={**base, 'id_klasifikasi': 999999})
        await step('arsip create with classification', 'POST', '/arsip/', {201}, headers=op, json={**base, 'nomor_dokumen': 'ARS-2', 'id_klasifikasi': 1, 'file_path': None})
        await step('arsip create missing fields', 'POST', '/arsip/', {422}, headers=op, json={'nama_dokumen': 'x'})
        await step('arsip create with foreign file', 'POST', '/arsip/', {403}, headers=admin, json=base)
        await step('arsip list', 'GET', '/arsip/?limit=50&skip=0&search=', {200}, headers=op)
        await step('arsip search', 'GET', '/arsip/?search=ARS', {200}, headers=op)
        await step('arsip filter options', 'GET', '/arsip/filter-options', {200}, headers=admin)
        await step('arsip filter options by operator', 'GET', '/arsip/filter-options', {403}, headers=op)
        await step('arsip get', 'GET', f'/arsip/{aid}', {200}, headers=op)
        await step('arsip update', 'PUT', f'/arsip/{aid}', {200}, headers=op, json={'event': 'Rapat'})
        await step('arsip update by other user', 'PUT', f'/arsip/{aid}', {403}, headers=other, json={'event': 'x'})
        await step('arsip change file via update', 'PUT', f'/arsip/{aid}', {422}, headers=op, json={'file_path': '1'})
        await step('file download', 'GET', f'/files/{fid}', {200}, headers=op)
        await step('file rollback while referenced', 'DELETE', f'/files/{fid}', {409}, headers=op)
        r = await step('upload orphan', 'POST', '/files/upload', {201}, headers=op, files={'file': pdf})
        orphan = r.json()['file_id']
        await step('file rollback by non-owner', 'DELETE', f'/files/{orphan}', {403}, headers=other)
        await step('file rollback unused', 'DELETE', f'/files/{orphan}', {204}, headers=op)
        await step('file rollback again (idempotent)', 'DELETE', f'/files/{orphan}', {204}, headers=op)
        await step('arsip soft delete', 'PATCH', f'/arsip/{aid}/delete', {200}, headers=op)
        await step('arsip trash', 'GET', '/arsip/trash', {200}, headers=op)
        await step('arsip restore', 'PATCH', f'/arsip/{aid}/restore', {200}, headers=op)
        await step('arsip permanent while active', 'DELETE', f'/arsip/{aid}/permanent', {409}, headers=admin)
        await step('arsip soft delete again', 'PATCH', f'/arsip/{aid}/delete', {200}, headers=op)
        await step('arsip permanent by operator', 'DELETE', f'/arsip/{aid}/permanent', {403}, headers=op)
        # Destruction needs a documented JRA approval process, so it is blocked by policy.
        await step('arsip permanent (blocked by policy)', 'DELETE', f'/arsip/{aid}/permanent', {409}, headers=admin)

        # --- Legacy persuratan --------------------------------------------
        await step('klasifikasi list', 'GET', '/klasifikasi', {200}, headers=op)
        await step('jenis surat list', 'GET', '/jenis-surat', {200}, headers=op)
        await step('surat keluar list', 'GET', '/surat-keluar', {200}, headers=op)
        await step('surat keluar draft by non-Umum', 'POST', '/surat-keluar/draft', {403}, headers=op,
                   json={'id_klasifikasi': 1, 'id_jenis_surat': 1, 'perihal': 'X', 'tujuan_surat': 'Y'})
        r = await step('surat keluar draft', 'POST', '/surat-keluar/draft', {201}, headers=other,
                       json={'id_klasifikasi': 1, 'id_jenis_surat': 1, 'id_bagian': umum_id, 'perihal': 'Undangan', 'tujuan_surat': 'KPU Kab'})
        sid = r.json().get('id_surat_keluar') if r is not None and r.status_code == 201 else None
        await step('surat keluar draft missing fields', 'POST', '/surat-keluar/draft', {422}, headers=other, json={})
        if sid:
            await step('surat finalisasi (disabled by policy)', 'POST', f'/surat-keluar/{sid}/finalisasi', {403, 409}, headers=admin, json={})
            await step('disposisi list', 'GET', f'/surat-keluar/{sid}/disposisi', {200, 403}, headers=op)
            await step('kode verifikasi', 'GET', f'/surat-keluar/{sid}/kode-verifikasi', {200, 403, 409}, headers=admin)
            await step('surat export', 'GET', f'/surat-keluar/{sid}/export', {200, 403, 409}, headers=admin)
        await step('surat tugas list', 'GET', '/surat-tugas', {200}, headers=admin)
        await step('verifikasi unknown code', 'GET', '/verifikasi/UNKNOWN', {404}, headers=op)

        # --- Budget master data -------------------------------------------
        year = date.today().year
        r = await step('tahun create', 'POST', '/tahun-anggaran/', {201}, headers=admin,
                       json={'tahun': year, 'status': 'active', 'tanggal_mulai': f'{year}-01-01', 'tanggal_selesai': f'{year}-12-31'})
        tid = r.json()['id_tahun_anggaran']
        await step('tahun duplicate', 'POST', '/tahun-anggaran/', {400, 409}, headers=admin,
                   json={'tahun': year, 'status': 'active', 'tanggal_mulai': f'{year}-01-01', 'tanggal_selesai': f'{year}-12-31'})
        await step('tahun end before start', 'POST', '/tahun-anggaran/', {400, 422}, headers=admin,
                   json={'tahun': year + 1, 'tanggal_mulai': f'{year+1}-12-31', 'tanggal_selesai': f'{year+1}-01-01'})
        await step('tahun create by operator', 'POST', '/tahun-anggaran/', {403}, headers=op,
                   json={'tahun': year + 2, 'tanggal_mulai': f'{year+2}-01-01', 'tanggal_selesai': f'{year+2}-12-31'})
        await step('tahun list', 'GET', '/tahun-anggaran/', {200}, headers=op)
        await step('tahun get', 'GET', f'/tahun-anggaran/{tid}', {200}, headers=op)
        await step('tahun update', 'PUT', f'/tahun-anggaran/{tid}', {200}, headers=admin, json={'deskripsi': 'DIPA'})
        r = await step('akun create', 'POST', '/akun-anggaran/', {201}, headers=admin,
                       json={'id_bagian': keu_id, 'kode_akun': '521211', 'nama_akun': 'Belanja Bahan'})
        akid = r.json()['id_akun_anggaran']
        await step('akun duplicate code', 'POST', '/akun-anggaran/', {400, 409}, headers=admin,
                   json={'id_bagian': keu_id, 'kode_akun': '521211', 'nama_akun': 'Dup'})
        await step('akun bad bagian', 'POST', '/akun-anggaran/', {400, 404, 422}, headers=admin,
                   json={'id_bagian': 999999, 'kode_akun': '521999', 'nama_akun': 'X'})
        await step('akun list', 'GET', '/akun-anggaran/', {200}, headers=op)
        await step('akun get', 'GET', f'/akun-anggaran/{akid}', {200}, headers=op)
        await step('akun update', 'PUT', f'/akun-anggaran/{akid}', {200}, headers=admin, json={'program': 'Dukungan'})
        r = await step('pagu list (auto-allocated?)', 'GET', '/pagu-anggaran/', {200}, headers=admin)
        existing = [p for p in (r.json() if isinstance(r.json(), list) else r.json().get('items', []))
                    if p.get('id_akun_anggaran') == akid and p.get('id_tahun_anggaran') == tid]
        if existing:
            pid = existing[0]['id_pagu']
            await step('pagu duplicate', 'POST', '/pagu-anggaran/', {400, 409}, headers=admin,
                       json={'id_tahun_anggaran': tid, 'id_akun_anggaran': akid, 'pagu_awal': '1000000'})
        else:
            r = await step('pagu create', 'POST', '/pagu-anggaran/', {201}, headers=admin,
                           json={'id_tahun_anggaran': tid, 'id_akun_anggaran': akid, 'pagu_awal': '1000000'})
            pid = r.json()['id_pagu']
        await step('pagu negative', 'POST', '/pagu-anggaran/', {400, 409, 422}, headers=admin,
                   json={'id_tahun_anggaran': tid, 'id_akun_anggaran': akid, 'pagu_awal': '-5'})
        await step('pagu get', 'GET', f'/pagu-anggaran/{pid}', {200}, headers=admin)
        await step('pagu summary', 'GET', f'/pagu-anggaran/{pid}/summary', {200}, headers=admin)
        await step('pagu update', 'PUT', f'/pagu-anggaran/{pid}', {200}, headers=admin, json={'nomor_sk': 'SK-1'})
        r = await step('revisi create', 'POST', '/revisi-anggaran/', {201}, headers=admin,
                       json={'id_pagu': pid, 'nomor_revisi': 'REV-1', 'tanggal_revisi': f'{year}-03-01', 'pagu_baru': '2000000', 'alasan_revisi': 'Tambahan'})
        rid = r.json().get('id_revisi') if r is not None and r.status_code == 201 else None
        await step('revisi list', 'GET', '/revisi-anggaran/', {200}, headers=admin)
        if rid:
            await step('revisi get', 'GET', f'/revisi-anggaran/{rid}', {200}, headers=admin)

        # --- Realisasi (operator owns the account's department) ------------
        await step('realisasi capabilities', 'GET', '/realisasi-anggaran/capabilities', {200}, headers=op)
        r = await step('upload evidence', 'POST', '/files/upload', {201}, headers=op, files={'file': pdf}, data={'category': 'realisasi'})
        ev = f"/api/v1/files/{r.json()['file_id']}"
        tx = {'id_pagu': pid, 'tanggal_transaksi': date.today().isoformat(), 'nomor_dokumen': 'KW-1',
              'uraian_kegiatan': 'ATK', 'jumlah_realisasi': '150000', 'bukti_file_path': ev}
        r = await step('realisasi create', 'POST', '/realisasi-anggaran/', {201}, headers=op, json=tx)
        xid = r.json()['id_realisasi']
        await step('realisasi over budget', 'POST', '/realisasi-anggaran/', {400}, headers=op, json={**tx, 'nomor_dokumen': 'KW-2', 'jumlah_realisasi': '999999999'})
        await step('realisasi duplicate doc no', 'POST', '/realisasi-anggaran/', {409}, headers=op, json=tx)
        await step('realisasi zero amount', 'POST', '/realisasi-anggaran/', {400, 422}, headers=op, json={**tx, 'nomor_dokumen': 'KW-3', 'jumlah_realisasi': '0'})
        await step('realisasi list', 'GET', '/realisasi-anggaran/', {200}, headers=op)
        await step('realisasi get', 'GET', f'/realisasi-anggaran/{xid}', {200}, headers=op)
        await step('realisasi edit', 'PUT', f'/realisasi-anggaran/{xid}', {200}, headers=op, json={'uraian_kegiatan': 'ATK kantor'})
        await step('realisasi submit', 'POST', f'/realisasi-anggaran/{xid}/submit', {200}, headers=op)
        await step('realisasi edit after submit', 'PUT', f'/realisasi-anggaran/{xid}', {400, 409}, headers=op, json={'uraian_kegiatan': 'late'})
        await step('realisasi verify w/o authority', 'POST', f'/realisasi-anggaran/{xid}/verify', {403}, headers=admin, json={})
        await step('realisasi reject w/o note', 'POST', f'/realisasi-anggaran/{xid}/reject', {403, 422}, headers=admin, json={})
        await step('realisasi history', 'GET', f'/realisasi-anggaran/{xid}/history', {200}, headers=op)
        r = await step('realisasi draft 2', 'POST', '/realisasi-anggaran/', {201}, headers=op, json={**tx, 'nomor_dokumen': 'KW-4', 'jumlah_realisasi': '1000'})
        await step('realisasi delete draft', 'DELETE', f"/realisasi-anggaran/{r.json()['id_realisasi']}", {200, 204}, headers=op)
        await step('anggaran summary', 'GET', '/anggaran/summary', {200}, headers=admin)
        await step('anggaran monthly report', 'GET', f'/anggaran/monthly-report?tahun={year}&bulan=11', {200}, headers=admin)
        await step('pagu delete while used', 'DELETE', f'/pagu-anggaran/{pid}', {400, 409}, headers=admin)
        await step('akun delete while used', 'DELETE', f'/akun-anggaran/{akid}', {400, 409}, headers=admin)
        await step('tahun delete while used', 'DELETE', f'/tahun-anggaran/{tid}', {400, 409}, headers=admin)

        # --- Workflow letters (Alur Persuratan) ----------------------------
        await step('letter create by non-Umum', 'POST', '/operations/letters', {403}, headers=op,
                   json={'kind': 'masuk', 'subject': 'U', 'sender': 'S', 'recipient': 'R', 'date': '2026-11-20'})
        r = await step('letter masuk create', 'POST', '/operations/letters', {201}, headers=other,
                       json={'kind': 'masuk', 'subject': 'Undangan', 'sender': 'KPU RI', 'recipient': 'KPU Sulut', 'content': 'Isi', 'date': '2026-11-20'})
        lid = r.json()['id']
        await step('letter create invalid kind', 'POST', '/operations/letters', {422}, headers=other,
                   json={'kind': 'x', 'subject': 's', 'sender': 's', 'recipient': 'r', 'date': '2026-11-20'})
        await step('letter stale version', 'POST', f'/operations/letters/{lid}/actions', {409}, headers=other, json={'action': 'submit', 'version': 99})
        await step('letter wrong action for state', 'POST', f'/operations/letters/{lid}/actions', {400, 403, 409, 422}, headers=other, json={'action': 'complete', 'version': 1})
        await step('letter list', 'GET', '/operations/letters', {200}, headers=op)
        await step('admin status', 'GET', '/operations/admin-status', {200}, headers=admin)
        await step('admin status by operator', 'GET', '/operations/admin-status', {403}, headers=op)
        await step('bug create', 'POST', '/operations/bugs', {201}, headers=op, json={'title': 'Tombol lambat', 'priority': 'Sedang'})
        await step('bug create empty title', 'POST', '/operations/bugs', {422}, headers=op, json={'title': ''})
        await step('bug list', 'GET', '/operations/bugs', {200}, headers=admin)

        # --- Dashboard overview (all numbers come from the database) --------
        r = await step('dashboard overview admin', 'GET', '/dashboard/overview', {200}, headers=admin)
        ov = r.json()
        ok = (ov['surat_masuk_aktif'] >= 1 and len(ov['monthly']) == 12 and ov['recent_letters']
              and ov['recent_letters'][0]['subject'] == 'Undangan' and ov['recent_activity'])
        RESULTS.append(('dashboard reflects real records', 'ok' if ok else 'FAIL', '' if ok else str(ov)[:300]))
        r = await step('dashboard overview other (letter owner)', 'GET', f'/dashboard/overview?year={date.today().year}', {200}, headers=other)
        ok = any(l['id'] == lid for l in r.json()['recent_letters'])
        RESULTS.append(('dashboard shows own letter', 'ok' if ok else 'FAIL', '' if ok else str(r.json())[:300]))
        r = await step('dashboard overview operator (no letters)', 'GET', '/dashboard/overview', {200}, headers=op)
        ok = r.json()['recent_letters'] == [] and r.json()['surat_masuk_aktif'] == 0
        RESULTS.append(('dashboard hides others letters', 'ok' if ok else 'FAIL', '' if ok else str(r.json())[:300]))
        await step('dashboard bad year', 'GET', '/dashboard/overview?year=1', {422}, headers=op)
        me = (await client.get('/api/v1/auth/me', headers=admin)).json()
        ok = me.get('email') is None and me.get('jabatan') == ''
        RESULTS.append(('profile has no invented email/jabatan', 'ok' if ok else 'FAIL', '' if ok else str(me)))

        # --- Reference data is idempotent ------------------------------------
        from app.core.reference_data import ensure_reference_data, KLASIFIKASI_ARSIP, JENIS_SURAT
        async with AsyncSessionLocal() as db:
            await ensure_reference_data(db); await db.commit()
            await ensure_reference_data(db); await db.commit()
        k = (await client.get('/api/v1/klasifikasi', headers=op)).json()
        j = (await client.get('/api/v1/jenis-surat', headers=op)).json()
        ok = len(k) == len(KLASIFIKASI_ARSIP) + 1 and len(j) == len(JENIS_SURAT) + 1  # + the smoke seed rows
        RESULTS.append(('reference data inserted once', 'ok' if ok else 'FAIL', '' if ok else f'{len(k)} klasifikasi, {len(j)} jenis'))

        # --- Backups + AI status -------------------------------------------
        await step('backups list', 'GET', '/backups', {200}, headers=admin)
        await step('backups by operator', 'GET', '/backups', {403}, headers=op)
        await step('backup download traversal', 'GET', '/backups/..%2F.env', {400, 404, 422}, headers=admin)
        await step('ai status', 'GET', '/ai/status', {200}, headers=op)
        await step('ai chat empty message', 'POST', '/ai/chat', {422}, headers=op, json={'message': ''})

        # --- Session end ---------------------------------------------------
        await step('logout', 'POST', '/auth/logout', {200}, headers=op)
        await step('token revoked after logout', 'GET', '/auth/me', {401}, headers=op)

    await engine.dispose()
    width = max(len(n) for n, _, _ in RESULTS)
    for name, status, note in RESULTS:
        print(f'{status:4}  {name.ljust(width)}  {note}')
    failed = [r for r in RESULTS if r[1] != 'ok']
    print(f'\n{len(RESULTS) - len(failed)}/{len(RESULTS)} steps passed')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
