"""Run explicitly against an EMPTY MySQL database ending in _test; never uses live data."""
import asyncio
import os
from pathlib import Path
import sys
from uuid import uuid4
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy.engine import make_url
url = os.environ.get('DATABASE_URL', '')
if not url or not (make_url(url).database or '').endswith('_test'):
    raise RuntimeError('Explicit disposable DATABASE_URL ending in _test required')

if not os.environ.get('UPLOAD_DIR'):
    raise RuntimeError('Set UPLOAD_DIR to a disposable test directory')

async def main():
    import httpx
    from sqlalchemy import inspect
    from app.core.database import Base, engine, AsyncSessionLocal
    from app.models.schema import Bagian, Pegawai
    from app.core.passwords import hash_password
    from app.main import app
    async with engine.begin() as conn:
        tables = await conn.run_sync(lambda c: inspect(c).get_table_names())
        if tables: raise RuntimeError('Integration test requires an EMPTY database; provision a new disposable database')
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncSessionLocal() as db:
        section = Bagian(kode_bagian='TEST', nama_bagian='Umum dan Logistik')
        other = Bagian(kode_bagian='OTHER', nama_bagian='Keuangan')
        db.add_all([section, other]); await db.flush()
        people = [Pegawai(nama='Test Admin',nip='test-admin',role='Admin',id_bagian=section.id_bagian,password=hash_password('admin-test-password')),
                  Pegawai(nama='Test Operator',nip='test-operator',role='Pegawai',id_bagian=section.id_bagian,password=hash_password('operator-test-password')),
                  Pegawai(nama='Other Operator',nip='test-other',role='Pegawai',id_bagian=other.id_bagian,password=hash_password('other-test-password'))]
        db.add_all(people);await db.commit()
        admin_id, operator_id, other_id = [p.id_pegawai for p in people]
        section_id = section.id_bagian
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
        async def login(nip,password):
            result=await client.post('/api/v1/auth/login',json={'nip':nip,'password':password})
            assert result.status_code==200,result.text
            return {'Authorization':'Bearer '+result.json()['access_token']}
        admin=await login('test-admin','admin-test-password')
        operator=await login('test-operator','operator-test-password')
        other=await login('test-other','other-test-password')
        bad=await client.post('/api/v1/auth/login',json={'nip':'test-admin','password':'admin123'})
        assert bad.status_code==401
        assert (await client.post('/api/v1/pegawai/',headers=operator,json={'nama':'Invalid','nip':'invalid','role':'Admin','password':'long-password'})).status_code==403
        letter=await client.post('/api/v1/operations/letters',headers=operator,json={'kind':'keluar','subject':'Integration','sender':'Operator','recipient':'Office','content':'Draft','date':'2026-11-16'})
        assert letter.status_code==201,letter.text
        letter=letter.json(); lid=letter['id']
        async def action(action,headers,version):
            return await client.post(f'/api/v1/operations/letters/{lid}/actions',headers=headers,json={'action':action,'version':version})
        submitted=await action('submit',operator,1);assert submitted.status_code==200,submitted.text
        assert (await action('approve',operator,2)).status_code==403
        assert (await action('approve',admin,1)).status_code==409
        approved=await action('approve',admin,2);assert approved.status_code==200,approved.text
        assert approved.json()['history'][-1]['actor_id']==admin_id
        assert (await client.get('/api/v1/operations/letters',headers=other)).json()==[]
        assert (await client.get('/api/v1/operations/letters',headers=operator)).json()[0]['status']=='approved'
        bug=await client.post('/api/v1/operations/bugs',headers=operator,json={'title':'Integration bug','priority':'Tinggi'})
        assert bug.status_code==201,bug.text
        bid=bug.json()['id']
        assert (await client.patch(f'/api/v1/operations/bugs/{bid}',headers=other,json={'status':'Selesai'})).status_code==403
        assert (await client.patch(f'/api/v1/operations/bugs/{bid}',headers=admin,json={'status':'Selesai'})).status_code==200
        assert (await client.get('/api/v1/operations/bugs',headers=other)).json()==[]
        upload=await client.post('/api/v1/files/upload',headers=operator,files={'file':('test.pdf',b'%PDF-1.4 test','application/pdf')},data={'category':'integration'})
        assert upload.status_code==201,upload.text
        fid=upload.json()['file_id']
        archive=await client.post('/api/v1/arsip/',headers=operator,json={'nama_dokumen':'test.pdf','nomor_dokumen':'TEST-001','id_pegawai':0,'kategori':'Laporan','tanggal_dokumen':'2026-11-16','hak_akses':'terbatas','file_path':str(fid)})
        assert archive.status_code==201,archive.text
        aid=archive.json()['id_dokumen']
        assert (await client.get(f'/api/v1/files/{fid}',headers=other)).status_code==403
        assert (await client.get('/api/v1/arsip/',headers=other)).json()==[]
        assert (await client.get(f'/api/v1/files/{fid}',headers=operator)).content==b'%PDF-1.4 test'
        assert (await client.patch(f'/api/v1/arsip/{aid}/delete',headers=operator)).status_code==200
        assert len((await client.get('/api/v1/arsip/trash',headers=operator)).json())==1
        assert (await client.patch(f'/api/v1/arsip/{aid}/restore',headers=operator)).status_code==200
        assert (await client.get('/api/v1/backups',headers=operator)).status_code==403
        assert (await client.delete(f'/api/v1/arsip/{aid}/permanent',headers=admin)).status_code==409
        # Budget workflow: synthetic pagu, independent operator/reviewer and evidence.
        from datetime import date
        from decimal import Decimal
        from app.models.schema import TahunAnggaran, AkunAnggaran, PaguAnggaran
        from app.core.config import settings
        async with AsyncSessionLocal() as db:
            year = TahunAnggaran(tahun=2026, status='active', tanggal_mulai=date(2026,1,1), tanggal_selesai=date(2026,12,31))
            account = AkunAnggaran(kode_akun='TEST-521', nama_akun='Test expenses', id_bagian=people[2].id_bagian)
            db.add_all([year, account]); await db.flush()
            pagu = PaguAnggaran(id_tahun_anggaran=year.id_tahun_anggaran, id_akun_anggaran=account.id_akun_anggaran, pagu_awal=Decimal('100'), pagu_aktif=Decimal('100'))
            db.add(pagu); await db.commit(); pagu_id = pagu.id_pagu
        proof = await client.post('/api/v1/files/upload',headers=other,files={'file':('budget.pdf',b'%PDF-1.4 evidence','application/pdf')},data={'category':'realisasi'})
        assert proof.status_code == 201, proof.text
        payload = {'id_pagu':pagu_id, 'tanggal_transaksi':'2026-11-16', 'nomor_dokumen':'BUD-001', 'uraian_kegiatan':'Test expenses', 'jumlah_realisasi':'60.00', 'bukti_file_path':f"/api/v1/files/{proof.json()['file_id']}"}
        root = '/api/v1/realisasi-anggaran/'
        assert (await client.post(root,headers=operator,json=payload)).status_code == 403
        assert (await client.post(root,headers=other,json={**payload,'tanggal_transaksi':'2025-11-16'})).status_code == 422
        assert (await client.post(root,headers=other,json={**payload,'bukti_file_path':f'/api/v1/files/{fid}'})).status_code == 403
        created = await client.post(root,headers=other,json=payload)
        assert created.status_code == 201, created.text
        tx_id = created.json()['id_realisasi']
        assert created.json()['status'] == 'draft' and created.json()['id_verifier'] is None
        assert (await client.post(root,headers=other,json=payload)).status_code == 409
        assert (await client.put(root+str(tx_id),headers=admin,json={'jumlah_realisasi':'30'})).status_code == 403
        assert (await client.put(root+str(tx_id),headers=other,json={'jumlah_realisasi':None})).status_code == 422
        assert (await client.post(root+f'{tx_id}/submit',headers=admin)).status_code == 403
        assert (await client.post(root+f'{tx_id}/submit',headers=other)).status_code == 200
        assert (await client.post(root+f'{tx_id}/verify',headers=admin,json={})).status_code == 403
        today = date.today().isoformat()
        settings.AUTHORITY_GRANTS = [dict(pegawai_id=ident, action='verify_budget', document_reference='TEST ONLY', valid_from=today, valid_until=today) for ident in (admin_id, other_id)]
        assert (await client.post(root+f'{tx_id}/verify',headers=other,json={})).status_code == 403
        assert (await client.get(payload['bukti_file_path'],headers=admin)).status_code == 200
        rejected = await client.post(root+f'{tx_id}/reject',headers=admin,json={'catatan_verifikasi':'Correct details'})
        assert rejected.status_code == 200, rejected.text
        assert (await client.put(root+str(tx_id),headers=other,json={'uraian_kegiatan':'Corrected expenses'})).json()['status'] == 'draft'
        assert (await client.post(root+f'{tx_id}/submit',headers=other)).status_code == 200
        second = await client.post(root,headers=other,json={**payload,'nomor_dokumen':'BUD-002'})
        assert second.status_code == 201, second.text
        second_id = second.json()['id_realisasi']
        assert (await client.post(root+f'{second_id}/submit',headers=other)).status_code == 200
        results = await asyncio.gather(*[client.post(root+f'{ident}/verify',headers=admin,json={}) for ident in (tx_id,second_id)])
        assert sorted(r.status_code for r in results) == [200,400], [r.text for r in results]
        winning = next(r.json() for r in results if r.status_code == 200)
        assert winning['id_verifier'] == admin_id
        summary = await client.get(f'/api/v1/pagu-anggaran/{pagu_id}',headers=admin)
        assert summary.status_code == 200, summary.text
        assert Decimal(str(summary.json()['total_realisasi_verified'])) == Decimal('60')
        history = await client.get(root+f'{tx_id}/history',headers=other)
        assert history.status_code == 200, history.text
        actions = [event['action'] for event in history.json()]
        assert actions[:5] == ['create', 'submit', 'reject', 'edit', 'submit'], actions
        assert any(event['snapshot'].get('catatan_verifikasi') == 'Correct details' for event in history.json())
        settings.AUTHORITY_GRANTS = []
        assert (await client.post('/api/v1/auth/logout',headers=other)).status_code==200
        assert (await client.get('/api/v1/auth/me',headers=other)).status_code==401
        assert (await client.put(f'/api/v1/pegawai/{other_id}',headers=admin,json={'password':'new-other-password'})).status_code==200
        await login('test-other','new-other-password')

        assert (await client.put(f'/api/v1/pegawai/{admin_id}',headers=admin,json={'is_active':False})).status_code==409
        assert (await client.put(f'/api/v1/pegawai/{operator_id}',headers=admin,json={'is_active':False})).status_code==200
        assert (await client.get('/api/v1/operations/letters',headers=operator)).status_code==401
    await engine.dispose()
    print('Integration checks passed; test records retained in disposable database for inspection')

if __name__=='__main__': asyncio.run(main())
