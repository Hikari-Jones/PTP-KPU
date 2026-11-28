"""Release-checklist verification (AUTH, SURAT, MASTER, BUDGET, REPORT, ARSIP, OTHER, AI-guard).

Runs against an EMPTY disposable MySQL database ending in _test; never uses live data.
Every check is recorded; the run continues after a failure and exits 1 if any failed.

    DATABASE_URL=mysql+aiomysql://user:pass@host:3306/kpu_check_test UPLOAD_DIR=/tmp/up \
    SECRET_KEY=<32+ chars> python tests/e2e_checklist.py
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

RESULTS: list[tuple[str, str, bool, str]] = []


def check(item: str, name: str, ok: bool, detail: object = '') -> bool:
    RESULTS.append((item, name, bool(ok), '' if ok else str(detail)[:220]))
    print(f"  {'ok  ' if ok else 'FAIL'} [{item}] {name}" + ('' if ok else f'  :: {str(detail)[:220]}'))
    return bool(ok)


async def main():
    import httpx
    from datetime import date, datetime, timedelta, timezone
    from decimal import Decimal
    from jose import jwt
    from sqlalchemy import inspect, select, func, text
    from app.core.config import settings
    from app.core.database import Base, engine, AsyncSessionLocal
    from app.core.passwords import hash_password
    from app.core.reference_data import ensure_reference_data
    from app.main import app
    from app.models.operations import BudgetEvent
    from app.models.schema import Bagian, JenisSurat, KodeKlasifikasiArsip, Pegawai
    from app.services.kirana_db import run_query

    async with engine.begin() as conn:
        if await conn.run_sync(lambda c: inspect(c).get_table_names()):
            raise RuntimeError('Checklist test requires an EMPTY database')
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        await ensure_reference_data(db)
        umum = Bagian(kode_bagian='CK-UM', nama_bagian='Umum dan Logistik')
        keu = Bagian(kode_bagian='CK-KEU', nama_bagian='Keuangan')
        hukum = Bagian(kode_bagian='CK-HK', nama_bagian='Hukum')
        db.add_all([umum, keu, hukum]); await db.flush()
        pw = 'checklist-password-1'
        users = {
            'admin': Pegawai(nama='CK Admin', nip='100000000000000001', role='Admin', id_bagian=umum.id_bagian, password=hash_password(pw)),
            'surat': Pegawai(nama='CK Operator Surat', nip='100000000000000002', role='Pegawai', id_bagian=umum.id_bagian, password=hash_password(pw)),
            'keu': Pegawai(nama='CK Operator Keuangan', nip='100000000000000003', role='Pegawai', id_bagian=keu.id_bagian, password=hash_password(pw)),
            'other': Pegawai(nama='CK Staf Hukum', nip='100000000000000004', role='Pegawai', id_bagian=hukum.id_bagian, password=hash_password(pw)),
            'inactive': Pegawai(nama='CK Nonaktif', nip='100000000000000005', role='Pegawai', id_bagian=hukum.id_bagian, password=hash_password(pw), is_active=False),
        }
        db.add_all(users.values()); await db.commit()
        ids = {k: v.id_pegawai for k, v in users.items()}
        sections = {'umum': umum.id_bagian, 'keu': keu.id_bagian, 'hukum': hukum.id_bagian}
        klas_id = (await db.scalar(select(KodeKlasifikasiArsip.id_klasifikasi)))
        jenis_id = (await db.scalar(select(JenisSurat.id_jenis_surat)))

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://t') as c:
        V = '/api/v1'

        async def login(nip, password=pw, prefix=V):
            return await c.post(f'{prefix}/auth/login', json={'nip': nip, 'password': password})

        H = {}
        for key in ('admin', 'surat', 'keu', 'other'):
            r = await login(users[key].nip)
            H[key] = {'Authorization': 'Bearer ' + r.json()['access_token']}

        # ================= AUTH =================
        print('[AUTH]')
        check('AUTH-01', 'correct login', (await login(users['other'].nip)).status_code == 200)
        check('AUTH-01', 'wrong password refused (401)', (await login(users['other'].nip, 'wrong-password-123')).status_code == 401)
        r = await login(users['inactive'].nip)
        check('AUTH-01', 'inactive account cannot log in', r.status_code in (401, 403), r.text)
        check('AUTH-01', '/api alias login works too', (await login(users['other'].nip, prefix='/api')).status_code == 200)
        check('AUTH-01', 'missing token refused (401)', (await c.get(f'{V}/auth/me')).status_code == 401)
        check('AUTH-01', '/api alias also requires token', (await c.get('/api/auth/me')).status_code == 401)
        token = H['other']['Authorization'].split()[1]
        tampered = token[:-4] + ('AAAA' if not token.endswith('AAAA') else 'BBBB')
        check('AUTH-01', 'tampered token refused (401)', (await c.get(f'{V}/auth/me', headers={'Authorization': 'Bearer ' + tampered})).status_code == 401)
        claims = jwt.get_unverified_claims(token)
        expired = jwt.encode({**claims, 'exp': int((datetime.now(timezone.utc) - timedelta(minutes=5)).timestamp())}, settings.SECRET_KEY, algorithm='HS256')
        check('AUTH-01', 'expired token refused (401)', (await c.get(f'{V}/auth/me', headers={'Authorization': 'Bearer ' + expired})).status_code == 401)
        forged = jwt.encode({**claims, 'exp': int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp())}, 'not-the-server-secret-' * 2, algorithm='HS256')
        check('AUTH-01', 'token signed with another key refused (401)', (await c.get(f'{V}/auth/me', headers={'Authorization': 'Bearer ' + forged})).status_code == 401)
        r = await c.put(f"{V}/pegawai/{ids['other']}", headers=H['other'], json={'role': 'Admin'})
        check('AUTH-04', 'staff cannot promote themselves to Admin', r.status_code == 403, r.text)
        r = await c.post(f'{V}/pegawai/', headers=H['surat'], json={'nama': 'X', 'nip': '100000000000000099', 'role': 'Admin', 'password': 'long-password-1'})
        check('AUTH-03', 'staff cannot create accounts', r.status_code == 403, r.text)
        r = await c.post(f'{V}/pegawai/', headers=H['admin'], json={'nama': 'Dup', 'nip': users['other'].nip, 'role': 'Pegawai', 'password': 'long-password-1'})
        check('AUTH-06', 'duplicate NIP refused', r.status_code in (400, 409, 422), r.text)
        r = await c.put(f"{V}/pegawai/{ids['surat']}", headers=H['admin'], json={'jabatan': 'Kasubbag'})
        check('AUTH-06', 'editing a user keeps their role', r.status_code == 200 and r.json()['role'] in ('Pegawai', 'pegawai'), r.text)

        # ================= OTHER-07 backups =================
        print('[OTHER-07 backups]')
        check('OTHER-07', 'staff cannot list backups', (await c.get(f'{V}/backups', headers=H['other'])).status_code == 403)
        check('OTHER-07', 'staff cannot create backups', (await c.post(f'{V}/backups', headers=H['other'])).status_code == 403)
        check('OTHER-07', 'staff cannot download a backup by name', (await c.get(f'{V}/backups/kpu-backup.zip', headers=H['other'])).status_code == 403)
        check('OTHER-07', 'unauthenticated backup list refused', (await c.get(f'{V}/backups')).status_code == 401)

        # ================= SURAT =================
        print('[SURAT]')
        L = f'{V}/operations/letters'
        up = await c.post(f'{V}/files/upload', headers=H['surat'], files={'file': ('undangan.pdf', b'%PDF-1.4 undangan', 'application/pdf')}, data={'category': 'surat'})
        fid = up.json()['file_id']
        r = await c.post(L, headers=H['surat'], json={'kind': 'masuk', 'subject': 'Undangan Rakor', 'sender': 'KPU RI', 'recipient': 'Sekretaris', 'number': '123/PL.01/2026', 'content': 'Isi undangan', 'date': '2026-11-20', 'file_id': fid})
        check('SURAT-01', 'incoming letter registered with source number & attachment', r.status_code == 201 and r.json()['number'] == '123/PL.01/2026', r.text)
        masuk = r.json(); mid = masuk['id']

        async def act(lid, headers, action, version, **extra):
            return await c.post(f'{L}/{lid}/actions', headers=headers, json={'action': action, 'version': version, 'note': f'catatan {action}', **extra})
        r = await act(mid, H['admin'], 'assign', masuk['version'], assignee_id=ids['inactive'])
        check('SURAT-06', 'assigning an inactive recipient refused', r.status_code == 422, r.text)
        r = await act(mid, H['surat'], 'assign', masuk['version'], assignee_id=ids['other'])
        check('SURAT-03', 'non-admin cannot assign disposition', r.status_code == 403, r.text)
        r = await act(mid, H['admin'], 'assign', masuk['version'], assignee_id=ids['other'])
        check('SURAT-01', 'admin assigns an active recipient', r.status_code == 200 and r.json()['status'] == 'assigned', r.text)
        v = r.json()['version']
        check('SURAT-03', 'assignee can now read the letter', any(x['id'] == mid for x in (await c.get(L, headers=H['other'])).json()))
        check('SURAT-03', 'assignee can download its attachment', (await c.get(f'{V}/files/{fid}', headers=H['other'])).status_code == 200)
        check('SURAT-03', 'unrelated staff cannot download it', (await c.get(f'{V}/files/{fid}', headers=H['keu'])).status_code == 403)
        r = await act(mid, H['keu'], 'complete', v)
        check('SURAT-03', 'unrelated staff cannot act on the letter', r.status_code in (403, 404), r.text)
        r = await act(mid, H['other'], 'complete', v)
        check('SURAT-01', 'assignee completes the disposition', r.status_code == 200 and r.json()['status'] == 'completed', r.text)
        r = await act(mid, H['surat'], 'archive', r.json()['version'])
        check('SURAT-01', 'completed letter archived', r.status_code == 200 and r.json()['status'] == 'archived', r.text)
        hist = r.json()['history']
        check('SURAT-07', 'history records actor, action, time and note for every step',
              [h['action'] for h in hist] == ['create', 'assign', 'complete', 'archive'] and all(h.get('actor_id') and h.get('at') for h in hist) and hist[1]['note'] == 'catatan assign',
              hist)
        check('SURAT-07', 'history actors are the real users', [h['actor_id'] for h in hist] == [ids['surat'], ids['admin'], ids['other'], ids['surat']], hist)
        check('SURAT-07', 'no API can rewrite a letter or its history', (await c.put(f'{L}/{mid}', headers=H['admin'], json={'history': []})).status_code in (404, 405))

        r = await c.post(L, headers=H['surat'], json={'kind': 'keluar', 'subject': 'Draft Surat Edaran', 'sender': 'Sekretariat', 'recipient': 'KPU Kab/Kota', 'content': 'v1', 'date': '2026-11-21'})
        ko = r.json(); kid = ko['id']
        check('SURAT-08', 'outgoing draft has no official number', r.status_code == 201 and ko['number'] is None, r.text)
        r = await act(kid, H['admin'], 'approve', ko['version'])
        check('SURAT-02', 'approving a draft out of order refused (409)', r.status_code == 409, r.text)
        r = await act(kid, H['surat'], 'submit', ko['version']); v = r.json()['version']
        check('SURAT-02', 'draft submitted', r.status_code == 200 and r.json()['status'] == 'submitted', r.text)
        r = await act(kid, H['admin'], 'revise', v); v = r.json()['version']
        check('SURAT-02', 'admin requests revision', r.status_code == 200 and r.json()['status'] == 'revision', r.text)
        r = await act(kid, H['surat'], 'edit', v, content='v2 diperbaiki')
        check('SURAT-02', 'owner edits the revision', r.status_code == 200 and r.json()['content'] == 'v2 diperbaiki', r.text)
        stale = v; v = r.json()['version']
        r = await act(kid, H['surat'], 'edit', stale, content='v-lama dari tab lain')
        check('SURAT-04', 'stale tab (old version) gets 409 conflict', r.status_code == 409, r.text)
        check('SURAT-04', 'stale write did not overwrite content', (await c.get(L, headers=H['surat'])).json()[0]['content'] == 'v2 diperbaiki')
        r = await act(kid, H['surat'], 'submit', v); v = r.json()['version']
        r = await act(kid, H['admin'], 'approve', v)
        check('SURAT-08', 'internal approval gives an ALUR register number, not an official one',
              r.status_code == 200 and str(r.json()['number']).startswith('ALUR/'), r.text)
        r = await act(kid, H['surat'], 'archive', r.json()['version'])
        check('SURAT-02', 'approved letter archived', r.status_code == 200 and r.json()['status'] == 'archived', r.text)
        r = await act(kid, H['surat'], 'submit', r.json()['version'])
        check('SURAT-02', 'acting on an archived letter refused (409)', r.status_code == 409, r.text)

        SK = f'{V}/surat-keluar'
        base = {'id_bagian': sections['umum'], 'id_klasifikasi': klas_id, 'id_jenis_surat': jenis_id, 'perihal': 'Pemberitahuan', 'tujuan_surat': 'KPU Kab', 'tanggal_surat': '2026-11-20'}
        r = await c.post(f'{SK}/draft', headers=H['surat'], json={**base, 'tahun': 2025})
        check('SURAT-06', 'year not matching the letter date refused', r.status_code == 422, r.text)
        r = await c.post(f'{SK}/draft', headers=H['surat'], json={**base, 'id_klasifikasi': 999999})
        check('SURAT-06', 'unknown classification refused', r.status_code == 422, r.text)
        r = await c.post(f'{SK}/draft', headers=H['surat'], json={**base, 'id_bagian': sections['hukum']})
        check('SURAT-06', 'drafting for another department refused', r.status_code == 403, r.text)
        r = await c.post(f'{SK}/draft', headers=H['other'], json={**base, 'id_bagian': sections['hukum']})
        check('SURAT-03', 'non-Umum staff cannot draft official letters', r.status_code == 403, r.text)
        a = (await c.post(f'{SK}/draft', headers=H['surat'], json=base)).json()
        b = (await c.post(f'{SK}/draft', headers=H['surat'], json={**base, 'perihal': 'Lain'})).json()
        r = await c.post(f"{SK}/{a['id_surat_keluar']}/disposisi", headers=H['surat'], json={'id_penerima': ids['other'], 'instruksi': 'Tindak lanjuti'})
        check('SURAT-06', 'disposition on own letter created', r.status_code == 201, r.text)
        parent_a = r.json()['id_disposisi']
        r = await c.post(f"{SK}/{b['id_surat_keluar']}/disposisi", headers=H['surat'], json={'id_penerima': ids['other'], 'instruksi': 'x', 'id_parent': parent_a})
        check('SURAT-06', "parent disposition from another letter refused (400)", r.status_code == 400, r.text)
        r = await c.post(f"{SK}/{a['id_surat_keluar']}/disposisi", headers=H['surat'], json={'id_penerima': ids['inactive'], 'instruksi': 'x'})
        check('SURAT-06', 'disposition to inactive staff refused', r.status_code == 404, r.text)
        check('SURAT-03', 'unrelated staff cannot read dispositions', (await c.get(f"{SK}/{a['id_surat_keluar']}/disposisi", headers=H['keu'])).status_code == 403)
        check('SURAT-03', 'unrelated staff cannot export the letter', (await c.get(f"{SK}/{a['id_surat_keluar']}/export?format=pdf", headers=H['keu'])).status_code == 403)
        check('SURAT-03', 'draft letter has no verification code (409)', (await c.get(f"{SK}/{a['id_surat_keluar']}/kode-verifikasi", headers=H['surat'])).status_code == 409)
        check('SURAT-03', 'forged verification code rejected', (await c.get(f'{V}/verifikasi/Zm9yZ2Vk')).status_code == 404)
        r = await c.post(f"{SK}/{a['id_surat_keluar']}/finalisasi", headers=H['admin'], json={})
        check('SURAT-05', 'official numbering locked while not enabled (409)', r.status_code == 409, r.text)

        # ================= MASTER =================
        print('[MASTER]')
        TA = f'{V}/tahun-anggaran/'
        def year(t, status='active', **extra):
            return {'tahun': t, 'status': status, 'tanggal_mulai': f'{t}-01-01', 'tanggal_selesai': f'{t}-12-31', **extra}
        check('MASTER-04', 'staff cannot create fiscal years', (await c.post(TA, headers=H['keu'], json=year(2026))).status_code == 403)
        y25 = (await c.post(TA, headers=H['admin'], json=year(2025))).json()
        y26 = (await c.post(TA, headers=H['admin'], json=year(2026, konfirmasi_tutup_tahun=2025))).json()
        check('MASTER-02', 'activating 2026 closed 2025', y26.get('status') == 'active' and next(y for y in (await c.get(TA, headers=H['admin'])).json()['items'] if y['tahun'] == 2025)['status'] == 'closed')
        r = await c.put(f"{TA}{y25['id_tahun_anggaran']}", headers=H['admin'], json={'status': 'active'})
        check('MASTER-02', 'closed year cannot be reopened', r.status_code == 400, r.text)
        AK = f'{V}/akun-anggaran/'
        r = await c.post(AK, headers=H['keu'], json={'kode_akun': '521211', 'nama_akun': 'Belanja Bahan', 'id_bagian': sections['keu']})
        check('MASTER-04', 'staff cannot create budget accounts', r.status_code == 403, r.text)
        r = await c.post(AK, headers=H['admin'], json={'kode_akun': '521211', 'nama_akun': 'Belanja Bahan', 'id_bagian': sections['keu'], 'status': 'active'})
        check('MASTER-03', 'admin creates account', r.status_code == 201, r.text)
        akun = r.json()
        r = await c.post(AK, headers=H['admin'], json={'kode_akun': '521211', 'nama_akun': 'Duplikat', 'id_bagian': sections['keu'], 'status': 'active'})
        check('MASTER-03', 'duplicate account code refused', r.status_code in (400, 409), r.text)
        r = await c.post(AK, headers=H['admin'], json={'kode_akun': '521999', 'nama_akun': 'Tanpa bagian', 'id_bagian': 999999})
        check('MASTER-03', 'unknown department refused', r.status_code in (400, 404, 422), r.text)
        PG = f'{V}/pagu-anggaran/'
        r = await c.get(PG + f"?id_tahun_anggaran={y26['id_tahun_anggaran']}&limit=500", headers=H['admin'])
        pagu = next((p for p in r.json()['items'] if p['id_akun_anggaran'] == akun['id_akun_anggaran']), None)
        if pagu is None:
            r = await c.post(PG, headers=H['admin'], json={'id_tahun_anggaran': y26['id_tahun_anggaran'], 'id_akun_anggaran': akun['id_akun_anggaran'], 'pagu_awal': '1000000'})
            pagu = r.json()
        RV = f'{V}/revisi-anggaran/'
        r = await c.post(RV, headers=H['keu'], json={'id_pagu': pagu['id_pagu'], 'nomor_revisi': 'REV-X', 'tanggal_revisi': '2026-11-01', 'pagu_baru': '1000000', 'alasan_revisi': 'Penetapan pagu'})
        check('MASTER-04', 'staff cannot revise pagu', r.status_code == 403, r.text)
        r = await c.post(RV, headers=H['admin'], json={'id_pagu': pagu['id_pagu'], 'nomor_revisi': 'DIPA-REV-01', 'tanggal_revisi': '2026-11-01', 'pagu_baru': '1000000', 'alasan_revisi': 'Penetapan pagu awal'})
        check('MASTER-05', 'revision records before/after, number, reason and actor',
              r.status_code == 201 and Decimal(str(r.json()['pagu_sesudah'])) == Decimal('1000000') and r.json()['id_pegawai'] == ids['admin'], r.text)
        r = await c.delete(f"{AK}{akun['id_akun_anggaran']}", headers=H['admin'])
        check('MASTER-03', 'account referenced by pagu cannot be deleted', r.status_code in (400, 409), r.text)

        # ================= BUDGET =================
        print('[BUDGET]')
        R = f'{V}/realisasi-anggaran/'
        async def proof(headers, name='kuitansi.pdf'):
            u = await c.post(f'{V}/files/upload', headers=headers, files={'file': (name, b'%PDF-1.4 bukti', 'application/pdf')}, data={'category': 'realisasi'})
            return f"/api/v1/files/{u.json()['file_id']}"
        def tx(no, amount, when='2026-11-20', **extra):
            return {'id_pagu': pagu['id_pagu'], 'tanggal_transaksi': when, 'nomor_dokumen': no, 'uraian_kegiatan': 'Pembelian ATK', 'jumlah_realisasi': amount, **extra}
        events_before = None
        async with AsyncSessionLocal() as db:
            events_before = await db.scalar(select(func.count()).select_from(BudgetEvent))
        bad = [('0', 'zero amount'), ('-5', 'negative amount'), ('NaN', 'NaN amount'), ('100.001', 'over-precision amount'), ('abc', 'text amount')]
        for amount, label in bad:
            r = await c.post(R, headers=H['keu'], json=tx(f'BAD-{label}', amount, bukti_file_path=await proof(H['keu'])))
            check('BUDGET-07', f'{label} refused', r.status_code == 422, r.text)
        r = await c.post(R, headers=H['keu'], json={**tx('BAD-DESC', '100', bukti_file_path=await proof(H['keu'])), 'uraian_kegiatan': '   '})
        check('BUDGET-07', 'blank description refused', r.status_code == 422, r.text)
        r = await c.post(R, headers=H['keu'], json=tx('BAD-YEAR', '100', when='2025-06-01', bukti_file_path=await proof(H['keu'])))
        check('BUDGET-07', 'date outside the fiscal year refused', r.status_code in (400, 422), r.text)
        r = await c.post(R, headers=H['keu'], json=tx('BAD-DATE', '100', when='2026-02-30', bukti_file_path=await proof(H['keu'])))
        check('BUDGET-07', 'invalid calendar date refused', r.status_code == 422, r.text)
        r = await c.post(R, headers=H['keu'], json=tx('BAD-FILE', '100', bukti_file_path='/etc/passwd'))
        check('BUDGET-08', 'arbitrary evidence path refused', r.status_code in (403, 422), r.text)
        r = await c.post(R, headers=H['keu'], json=tx('BAD-FILE2', '100', bukti_file_path=await proof(H['surat'])))
        check('BUDGET-08', "another user's upload refused as evidence", r.status_code == 403, r.text)
        async with AsyncSessionLocal() as db:
            events_after = await db.scalar(select(func.count()).select_from(BudgetEvent))
        check('BUDGET-10', 'failed operations wrote no budget history', events_after == events_before, (events_before, events_after))
        p1, p2 = await proof(H['keu'], 'a.pdf'), await proof(H['keu'], 'b.pdf')
        results = await asyncio.gather(
            c.post(R, headers=H['keu'], json=tx('BUD-A', '600000', bukti_file_path=p1)),
            c.post(R, headers=H['keu'], json=tx('BUD-B', '600000', bukti_file_path=p2)),
        )
        codes = sorted(r.status_code for r in results)
        check('BUDGET-05', 'two concurrent Rp600.000 against Rp1.000.000: exactly one accepted', codes.count(201) == 1 and len([x for x in codes if x >= 400]) == 1, [r.text[:120] for r in results])
        ok_tx = next((r.json() for r in results if r.status_code == 201), None)
        r = await c.post(R, headers=H['keu'], json=tx('BUD-A', '1000', bukti_file_path=await proof(H['keu'])))
        check('BUDGET-06', 'duplicate document number on the same pagu refused (409)', r.status_code == 409, r.text)
        r = await c.post(R, headers=H['keu'], json=tx('BUD-JAN', '50000', when='2026-01-01', bukti_file_path=await proof(H['keu'])))
        check('REPORT-03', 'transaction on 1 January accepted', r.status_code == 201, r.text)
        async with AsyncSessionLocal() as db:
            ev = await db.scalar(select(func.count()).select_from(BudgetEvent))
        check('BUDGET-10', 'each committed transaction has a budget-history event', ev - events_after == 2, ev - events_after)
        if ok_tx:
            r = await c.put(f"{R}{ok_tx['id_realisasi']}", headers=H['other'], json={'jumlah_realisasi': '1'})
            check('BUDGET-08', "another user cannot edit a transaction", r.status_code == 403, r.text)
            r = await c.delete(f"{R}{ok_tx['id_realisasi']}", headers=H['other'])
            check('BUDGET-08', "another user cannot delete a transaction", r.status_code == 403, r.text)

        # ================= REPORT reconciliation =================
        print('[REPORT]')
        yid = y26['id_tahun_anggaran']
        expected = Decimal('650000')
        lst = (await c.get(f'{R}?id_tahun_anggaran={yid}&status=verified&limit=500', headers=H['admin'])).json()
        list_sum = sum(Decimal(str(i['jumlah_realisasi'])) for i in lst['items'])
        pd = (await c.get(f"{PG}{pagu['id_pagu']}", headers=H['admin'])).json()
        summ = (await c.get(f'{V}/anggaran/summary?id_tahun_anggaran={yid}', headers=H['admin'])).json()
        mon = (await c.get(f'{V}/anggaran/monthly-report?id_tahun_anggaran={yid}', headers=H['admin'])).json()
        yr = next(y for y in (await c.get(TA, headers=H['admin'])).json()['items'] if y['tahun'] == 2026)
        figures = {
            'transaction list': list_sum,
            'pagu detail': Decimal(str(pd['total_realisasi_verified'])),
            'dashboard summary': Decimal(str(summ['total_realisasi_verified'])),
            'monthly report total': Decimal(str(mon['total']['total_realisasi'])),
            'fiscal-year list': Decimal(str(yr['total_realisasi_verified'])),
        }
        check('REPORT-01', 'verified total identical on all 5 screens (Rp650.000)', all(v == expected for v in figures.values()), figures)
        check('BUDGET-02', 'remaining = pagu - verified (Rp350.000)', Decimal(str(pd['sisa_anggaran'])) == Decimal('350000') and Decimal(str(summ['total_sisa_anggaran'])) == Decimal('350000'), (pd['sisa_anggaran'], summ['total_sisa_anggaran']))
        check('REPORT-03', 'January and November land in the right monthly columns',
              Decimal(str(mon['total']['januari'])) == Decimal('50000') and Decimal(str(mon['total']['november'])) == Decimal('600000') and Decimal(str(mon['total']['desember'])) == 0, mon['total'])
        old = (await c.get(f"{V}/anggaran/summary?id_tahun_anggaran={y25['id_tahun_anggaran']}", headers=H['admin'])).json()
        check('REPORT-02', 'other fiscal year not inflated', Decimal(str(old['total_realisasi_verified'])) == 0, old['total_realisasi_verified'])

        # ================= ARSIP =================
        print('[ARSIP]')
        A = f'{V}/arsip/'
        async def upload(headers, name, content, ctype='application/pdf'):
            return await c.post(f'{V}/files/upload', headers=headers, files={'file': (name, content, ctype)}, data={'category': 'arsip'})
        r = await upload(H['surat'], 'kosong.pdf', b'')
        check('ARSIP-05', 'empty file refused', r.status_code == 422, r.text)
        r = await upload(H['surat'], 'virus.pdf', b'MZ\x90\x00\x03 fake executable', 'application/pdf')
        check('ARSIP-05', 'executable disguised as PDF refused', r.status_code == 415, r.text)
        r = await upload(H['surat'], 'halaman.pdf', b'<html><script>alert(1)</script>', 'text/html')
        check('ARSIP-05', 'HTML disguised as PDF refused', r.status_code == 415, r.text)
        r = await upload(H['surat'], 'tabel.csv', b'MZ\x90\x00binary', 'text/csv')
        check('ARSIP-05', 'binary disguised as CSV refused', r.status_code == 415, r.text)
        r = await upload(H['surat'], 'skrip.exe', b'MZ', 'application/octet-stream')
        check('ARSIP-05', 'disallowed extension refused', r.status_code == 415, r.text)
        r = await upload(H['surat'], '../../../etc/cron.d/x.pdf', b'%PDF-1.4 traversal')
        check('ARSIP-05', 'path-traversal filename stored safely (basename only)', r.status_code == 201 and r.json()['filename'] == 'x.pdf', r.text)
        r1 = await upload(H['surat'], 'sama.pdf', b'%PDF-1.4 one'); r2 = await upload(H['surat'], 'sama.pdf', b'%PDF-1.4 two')
        check('ARSIP-05', 'duplicate filenames kept as separate files', r1.status_code == r2.status_code == 201 and r1.json()['file_id'] != r2.json()['file_id'])
        r = await upload(H['surat'], 'png.png', b'\x89PNG\r\n\x1a\nrest', 'image/png')
        check('ARSIP-05', 'genuine PNG accepted', r.status_code == 201, r.text)
        r = await upload(H['surat'], 'lapor.xlsx', b'PK\x03\x04rest-of-zip', 'application/octet-stream')
        check('ARSIP-05', 'genuine XLSX (zip) accepted', r.status_code == 201, r.text)
        r = await upload(H['surat'], 'trick.pdf', b'%PDF-1.4 actually fine', 'text/html')
        fid_html = r.json()['file_id']
        d = await c.get(f'{V}/files/{fid_html}', headers=H['surat'])
        check('ARSIP-06', 'download type comes from the extension, not the browser (no text/html)', d.headers.get('content-type', '').startswith('application/pdf'), d.headers.get('content-type'))
        check('ARSIP-06', 'download is an attachment, never rendered inline', d.headers.get('content-disposition', '').startswith('attachment'), d.headers.get('content-disposition'))

        docs = {}
        for akses in ('internal', 'terbatas', 'publik'):
            u = await upload(H['surat'], f'{akses}.pdf', f'%PDF-1.4 {akses}'.encode())
            r = await c.post(A, headers=H['surat'], json={'nama_dokumen': f'Dok {akses}', 'nomor_dokumen': f'A-{akses}', 'id_pegawai': 0, 'kategori': 'Laporan', 'tanggal_dokumen': '2026-11-20', 'hak_akses': akses, 'file_path': str(u.json()['file_id'])})
            docs[akses] = (r.json()['id_dokumen'], u.json()['file_id'])
        same_dept = await login(users['admin'].nip)  # admin is in Umum too; use surat colleague via admin? use dedicated check below
        def visible(listing, did):
            return any(x['id_dokumen'] == did for x in listing)
        lists = {who: (await c.get(A + '?limit=500', headers=H[who])).json() for who in ('surat', 'keu', 'admin')}
        matrix_ok = (
            visible(lists['keu'], docs['internal'][0]) and visible(lists['keu'], docs['publik'][0]) and not visible(lists['keu'], docs['terbatas'][0])
            and all(visible(lists['admin'], d[0]) for d in docs.values()) and all(visible(lists['surat'], d[0]) for d in docs.values())
        )
        check('ARSIP-02', 'list visibility: other dept sees internal/public, not restricted; owner & admin see all', matrix_ok)
        dl = {k: (await c.get(f'{V}/files/{v[1]}', headers=H['keu'])).status_code for k, v in docs.items()}
        check('ARSIP-02', 'direct file access matches list visibility for another department', dl == {'internal': 200, 'terbatas': 403, 'publik': 200}, dl)
        did = docs['internal'][0]
        r = await c.put(f'{A}{did}', headers=H['keu'], json={'nama_dokumen': 'diubah orang lain'})
        check('ARSIP-03', "another user cannot edit metadata", r.status_code == 403, r.text)
        r = await c.put(f'{A}{did}', headers=H['surat'], json={'hak_akses': 'rahasia-sekali'})
        check('ARSIP-03', 'unknown access label refused', r.status_code == 422, r.text)
        r = await c.put(f'{A}{did}', headers=H['surat'], json={'file_path': '1'})
        check('ARSIP-03', 'file reference cannot be swapped via metadata edit', r.status_code == 422, r.text)
        r = await c.patch(f'{A}{did}/delete', headers=H['surat'])
        check('ARSIP-01', 'move to trash', r.status_code == 200 and r.json()['status_hapus'] is True, r.text)
        r = await c.patch(f'{A}{did}/restore', headers=H['surat'])
        check('ARSIP-01', 'restore keeps metadata intact', r.status_code == 200 and r.json()['nama_dokumen'] == 'Dok internal' and r.json()['hak_akses'] == 'internal', r.text)
        r = await c.get(A + '?search=Dok%20internal', headers=H['surat'])
        check('ARSIP-01', 'search finds the document', any(x['id_dokumen'] == did for x in r.json()))

        # ================= AI database guard (no model needed) =================
        print('[AI guard]')
        async with AsyncSessionLocal() as db:
            u_other = await db.get(Pegawai, ids['other'])
            u_keu = await db.get(Pegawai, ids['keu'])
            u_admin = await db.get(Pegawai, ids['admin'])
        async def q(sql, user):
            return await run_query(sql, user=user)
        res = await q('SELECT COUNT(*) AS n FROM workflow_letter', u_keu)
        check('AI-06', "unrelated user's letter count excludes others' letters", '| 0' in res or res.strip().endswith('0'), res)
        res = await q('SELECT COUNT(*) AS n FROM workflow_letter', u_admin)
        check('AI-06', 'admin sees all letters', '| 2' in res or res.strip().endswith('2'), res)
        res = await q('SELECT * FROM workflow_letter', u_other)
        check('AI-06', 'assignee sees only the letter assigned to them via SELECT *', 'Undangan Rakor' in res and 'Draft Surat Edaran' not in res, res[:300])
        attacks = {
            'password column': 'SELECT nip, password FROM pegawai',
            'password via alias': 'SELECT p.password FROM pegawai p',
            'password via union': 'SELECT nama FROM pegawai UNION SELECT password FROM pegawai',
            'password in nested query': 'SELECT * FROM (SELECT password FROM pegawai) t',
            'password in CTE': 'WITH x AS (SELECT password FROM pegawai) SELECT * FROM x',
            'session_version': 'SELECT session_version FROM pegawai',
            'stored file path': 'SELECT file_path FROM dokumen_arsip',
            'evidence file path': 'SELECT bukti_file_path FROM realisasi_anggaran',
            'information_schema': 'SELECT table_name FROM information_schema.tables',
            'mysql.user': 'SELECT user FROM mysql.user',
            'other schema': 'SELECT * FROM kpu_db.pegawai',
            'UPDATE': "UPDATE pegawai SET role='Admin'",
            'DELETE': 'DELETE FROM dokumen_arsip',
            'DROP': 'DROP TABLE pegawai',
            'two statements': "SELECT 1; UPDATE pegawai SET role='Admin'",
            'INTO OUTFILE': "SELECT nama FROM pegawai INTO OUTFILE '/tmp/x'",
            'SLEEP': 'SELECT SLEEP(30)',
            'BENCHMARK': "SELECT BENCHMARK(100000000, MD5('a'))",
            'unknown table (satker)': 'SELECT * FROM satker',
            'file_record table': 'SELECT * FROM file_record',
        }
        for label, sql in attacks.items():
            res = await q(sql, u_other)
            check('AI-07', f'blocked: {label}', res.startswith('ERROR'), res[:160])
        res = await q('SELECT * FROM pegawai', u_other)
        check('AI-06', 'SELECT * on pegawai never returns password hashes', 'pbkdf2' not in res.lower() and 'password' not in res.lower(), res[:200])
        res = await q("WITH semua AS (SELECT * FROM workflow_letter) SELECT subject FROM semua", u_keu)
        check('AI-06', 'CTE cannot widen row access', 'Undangan Rakor' not in res, res[:200])
        res = await q("SELECT w.subject FROM workflow_letter w JOIN pegawai p ON p.id_pegawai = w.owner_id", u_keu)
        check('AI-06', 'JOIN cannot widen row access', 'Undangan Rakor' not in res, res[:200])
        res = await q("SELECT subject FROM workflow_letter WHERE 1=1 OR owner_id <> 0", u_keu)
        check('AI-08', "injected 'ignore permissions' WHERE clause cannot widen access", 'Undangan Rakor' not in res, res[:200])
        res = await q("SELECT nama_dokumen FROM dokumen_arsip WHERE hak_akses = 'terbatas'", u_keu)
        check('AI-06', "restricted archive documents of another department hidden", 'Dok terbatas' not in res, res[:200])
        res = await q('SELECT a.id_pegawai FROM pegawai a, pegawai b, pegawai c, pegawai d, pegawai e', u_admin)
        check('AI-07', 'large cross join is capped (row limit) instead of flooding', res.count('\n') < 60, len(res))

    await engine.dispose()
    failed = [r for r in RESULTS if not r[2]]
    by_item: dict[str, list[bool]] = {}
    for item, _, ok, _ in RESULTS:
        by_item.setdefault(item, []).append(ok)
    print('\nSummary per checklist item:')
    for item in sorted(by_item):
        oks = by_item[item]
        print(f"  {item:<10} {sum(oks)}/{len(oks)} {'PASS' if all(oks) else 'FAIL'}")
    print(f'\n{len(RESULTS) - len(failed)}/{len(RESULTS)} checks passed')
    if failed:
        sys.exit(1)


if __name__ == '__main__':
    asyncio.run(main())
