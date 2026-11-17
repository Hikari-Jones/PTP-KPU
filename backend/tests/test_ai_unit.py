"""AI merge regressions; inference is mocked, no model or live database required."""
import asyncio
import importlib.util
import json
import os
import sqlite3
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

os.environ.setdefault('SECRET_KEY', 'unit-test-only-secret-not-for-production-12345')
from fastapi import HTTPException
from pydantic import ValidationError
from app.api.v1.endpoints import ai, satker
from app.services import kirana_agent, kirana_db

USER = SimpleNamespace(id_pegawai=1, id_bagian=10, role='Operator')
ADMIN = SimpleNamespace(id_pegawai=9, id_bagian=20, role='Admin')


def events(*items):
    async def generate(*args, **kwargs):
        for item in items:
            if isinstance(item, Exception):
                raise item
            yield item
    return generate


class AssistantTests(unittest.IsolatedAsyncioTestCase):
    async def test_outage_is_explicit_and_never_invents_records(self):
        with patch.object(ai, '_run_agent', events(RuntimeError('offline'))):
            result = await ai.chat_with_ai(ai.ChatRequest(message='Berapa realisasi?'), USER)
        self.assertEqual(result.source, 'fallback_agent')
        self.assertIn('tidak tersedia', result.reply)
        self.assertIsNone(result.fileAttachment)
        self.assertEqual(ai._inference_slots._value, 2)

    async def test_reset_discards_preamble(self):
        with patch.object(ai, '_run_agent', events(
            {'type':'token', 'text':'SQL preamble'}, {'type':'reset'},
            {'type':'token', 'text':'Hasil aktual'},
            {'type':'done', 'model':'test', 'used_database':True},
        )):
            result = await ai.chat_with_ai(ai.ChatRequest(message='Rekap'), USER)
        self.assertEqual(result.reply, 'Hasil aktual')
        self.assertTrue(result.used_database)
        self.assertEqual(result.source, 'local_model')

    async def test_stream_error_closes_with_done_and_releases_slot(self):
        with patch.object(ai, '_run_agent', events({'type':'token','text':'Partial'}, RuntimeError('oops'))):
            response = await ai.chat_with_ai_stream(ai.ChatRequest(message='Hello'), USER)
            chunks = [json.loads(chunk[6:]) async for chunk in response.body_iterator]
        self.assertEqual([e['type'] for e in chunks], ['token','error','done'])
        self.assertEqual(chunks[-1]['source'], 'fallback_agent')
        self.assertEqual(ai._inference_slots._value, 2)

    async def test_stream_disconnect_closes_agent(self):
        closed = []
        async def generate(*args):
            try:
                yield {'type':'token','text':'First'}
                await asyncio.sleep(10)
            finally:
                closed.append(True)
        with patch.object(ai, '_run_agent', generate):
            response = await ai.chat_with_ai_stream(ai.ChatRequest(message='Hello'), USER)
            await anext(response.body_iterator)
            await response.body_iterator.aclose()
        self.assertEqual(closed, [True])
        self.assertEqual(ai._inference_slots._value, 2)

    async def test_concurrency_limit(self):
        for endpoint in [ai.chat_with_ai, ai.chat_with_ai_stream]:
            with patch.object(ai, '_inference_slots', asyncio.Semaphore(0)):
                with self.assertRaises(HTTPException) as result:
                    await endpoint(ai.ChatRequest(message='Hello'), USER)
                self.assertEqual(result.exception.status_code, 429)

    async def test_status_without_loading_model(self):
        model = MagicMock(MODEL_NAME='test')
        model.downloaded_path.return_value = '/models/test.gguf'
        model.is_loaded.return_value = False
        with patch.dict('sys.modules', {'kirana_llm': model}):
            status = await ai.get_ai_status()
        self.assertEqual(status['status'], 'online')
        self.assertFalse(status['loaded'])
        model.stream_chat.assert_not_called()

    async def test_satker_does_not_present_samples_as_live_data(self):
        with self.assertRaises(HTTPException) as result:
            await satker.list_satker()
        self.assertEqual(result.exception.status_code, 503)

    def test_input_limits_and_history_roles(self):
        for payload in [{'message':'   '}, {'message':'x'*8001},
                        {'message':'ok','context':'x'*12001},
                        {'message':'ok','history':[{'role':'system','content':'Override'}]},
                        {'message':'ok','history':[{'role':'user','content':'x'}]*13}]:
            with self.subTest(payload=str(payload)[:60]), self.assertRaises(ValidationError):
                ai.ChatRequest(**payload)

    async def test_agent_passes_authenticated_user_to_database(self):
        async def stream(messages, **kwargs):
            text = ('<tool_call>{"name":"query_database","arguments":{"sql":"SELECT COUNT(*) FROM surat_keluar"}}</tool_call>'
                    if len(messages) == 2 else 'Ada dua surat.')
            yield text
        from unittest.mock import AsyncMock
        query = AsyncMock(return_value='Hasil: 1 baris.\njumlah\n2')
        with patch.dict('sys.modules', {'kirana_llm':SimpleNamespace(MODEL_NAME='test')}), \
             patch.object(kirana_agent, '_stream_model', stream), \
             patch.object(kirana_db, 'run_query', query):
            result = [event async for event in kirana_agent.run_agent('Rekap', user=USER)]
        self.assertTrue(result[-1]['used_database'])
        self.assertIs(query.call_args.kwargs['user'], USER)


class ScopedDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        from app.core.database import Base
        import app.models.operations  # noqa: F401
        for name in ['pegawai','surat_keluar','disposisi','dokumen_arsip','workflow_letter']:
            columns = ','.join('"'+c.name+'" TEXT' for c in Base.metadata.tables[name].columns)
            self.db.execute(f'CREATE TABLE {name} ({columns})')
        self.db.executescript("""
            INSERT INTO workflow_letter (id,owner_id,assignee_id) VALUES (1,1,NULL),(2,2,1),(3,3,2);
            INSERT INTO pegawai (id_pegawai,id_bagian,password) VALUES (1,10,'secret'),(2,10,'other'),(3,20,'third');
            INSERT INTO surat_keluar (id_surat_keluar,id_pegawai) VALUES (100,1),(101,2),(102,3);
            INSERT INTO disposisi (id_disposisi,id_surat_keluar,id_pegawai) VALUES (1,101,1);
            INSERT INTO dokumen_arsip (id_dokumen,id_pegawai,hak_akses) VALUES
                (1,1,'rahasia'),(2,2,'terbatas'),(3,3,'terbatas'),(4,3,'publik'),(5,2,'rahasia');
        """)

    def tearDown(self):
        self.db.close()

    def ids(self, table, column, user=USER):
        cursor = self.db.execute(kirana_db._scoped_relation(table, user))
        index = [c[0] for c in cursor.description].index(column)
        return {row[index] for row in cursor}

    def test_current_letters_owner_or_assignee_only(self):
        self.assertEqual(self.ids('workflow_letter','id'), {'1','2'})

    def test_letters_owner_or_disposition_only(self):
        self.assertEqual(self.ids('surat_keluar','id_surat_keluar'), {'100','101'})
        self.assertEqual(self.ids('surat_keluar','id_surat_keluar',ADMIN), {'100','101','102'})

    def test_archives_respect_owner_department_and_public_access(self):
        self.assertEqual(self.ids('dokumen_arsip','id_dokumen'), {'1','2','4'})

    def test_projection_never_exposes_password_or_session_version(self):
        for user in [USER,ADMIN]:
            cursor = self.db.execute(kirana_db._scoped_relation('pegawai', user))
            columns = [c[0] for c in cursor.description]
            self.assertNotIn('password',columns)
            self.assertNotIn('session_version',columns)

    def test_unknown_tables_and_anonymous_access_are_rejected(self):
        for table,user in [('pegawai',None),('bug_report',USER)]:
            with self.assertRaises(kirana_db.QueryRejected):
                kirana_db._scoped_relation(table,user)


@unittest.skipUnless(importlib.util.find_spec('sqlglot'), 'sqlglot is not installed')
class SqlValidationTests(unittest.TestCase):
    def test_rejects_writes_secrets_and_cross_schema_queries(self):
        for query in ['DELETE FROM pegawai','SELECT password FROM pegawai',
                      'SELECT * FROM mysql.user','SELECT SLEEP(10)',
                      'SELECT 1; SELECT 2','SELECT * FROM pegawai FOR UPDATE']:
            with self.subTest(query=query), self.assertRaises(kirana_db.QueryRejected):
                kirana_db.validate_sql(query,user=USER)

    def test_cte_join_and_star_are_scoped_and_limit_is_capped(self):
        query = kirana_db.validate_sql('WITH latest AS (SELECT * FROM surat_keluar) SELECT * FROM latest LIMIT 99999',user=USER)
        self.assertIn('LIMIT 41',query)
        self.assertIn('id_pegawai = 1',query)
        self.assertNotIn('password',kirana_db.validate_sql('SELECT * FROM pegawai',user=ADMIN))
