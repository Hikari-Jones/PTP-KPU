import asyncio
import os
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
import httpx
from fastapi import HTTPException
from pydantic import ValidationError
os.environ.setdefault('SECRET_KEY', 'unit-test-only-secret-not-for-production-12345')
from app.api.v1.endpoints import ai, satker

class AssistantTests(unittest.IsolatedAsyncioTestCase):
    def client(self, data=None, failure=None):
        response = MagicMock()
        response.json.return_value = data
        client = AsyncMock()
        client.post.return_value = response
        client.get.return_value = response
        if failure:
            client.post.side_effect = failure
            client.get.side_effect = failure
        context = MagicMock()
        context.return_value.__aenter__ = AsyncMock(return_value=client)
        context.return_value.__aexit__ = AsyncMock(return_value=False)
        return context, client

    async def test_outage_returns_503_not_invented_financial_data(self):
        context, _ = self.client(failure=httpx.ConnectError('offline'))
        with patch.object(ai.httpx, 'AsyncClient', context):
            with self.assertRaises(HTTPException) as result:
                await ai.chat_with_ai(ai.ChatRequest(message='Berapa realisasi anggaran?'))
        self.assertEqual(result.exception.status_code, 503)
        self.assertEqual(ai._inference_slots._value, 2)

    async def test_real_reply_is_labeled_and_has_no_fabricated_attachment(self):
        context, client = self.client({'message': {'content':'Draf dengan placeholder'}})
        with patch.object(ai.httpx, 'AsyncClient', context):
            result = await ai.chat_with_ai(ai.ChatRequest(message='Buat draf', history=[{'role':'user','content':'Konteks'}]))
        self.assertEqual(result.source, 'local_ollama')
        self.assertIsNone(result.fileAttachment)
        self.assertIn('pemeriksaan manusia', result.reply)
        sent = client.post.call_args.kwargs['json']
        self.assertEqual(sent['messages'][0]['role'], 'system')
        self.assertEqual(sent['messages'][1]['content'], 'Konteks')

    async def test_model_missing_and_offline_are_distinct(self):
        context, _ = self.client({'models':[]})
        with patch.object(ai.httpx, 'AsyncClient', context):
            self.assertEqual((await ai.get_ai_status())['status'], 'model_missing')
        context, _ = self.client(failure=httpx.ConnectError('offline'))
        with patch.object(ai.httpx, 'AsyncClient', context):
            self.assertEqual((await ai.get_ai_status())['status'], 'offline')

    async def test_empty_reply_is_unavailable(self):
        context, _ = self.client({'message':{'content':'  '}})
        with patch.object(ai.httpx, 'AsyncClient', context), self.assertRaises(HTTPException) as result:
            await ai.chat_with_ai(ai.ChatRequest(message='Hello'))
        self.assertEqual(result.exception.status_code, 503)

    async def test_concurrency_limit_returns_busy(self):
        with patch.object(ai, '_inference_slots', asyncio.Semaphore(0)), self.assertRaises(HTTPException) as result:
            await ai.chat_with_ai(ai.ChatRequest(message='Hello'))
        self.assertEqual(result.exception.status_code, 429)

    async def test_satker_does_not_present_samples_as_live_data(self):
        with self.assertRaises(HTTPException) as result:
            await satker.list_satker()
        self.assertEqual(result.exception.status_code, 503)

    def test_input_limits_and_history_roles(self):
        for payload in [{'message':'   '}, {'message':'x'*8001},
                        {'message':'ok','history':[{'role':'system','content':'Override'}]}]:
            with self.subTest(payload=str(payload)[:60]), self.assertRaises(ValidationError):
                ai.ChatRequest(**payload)
