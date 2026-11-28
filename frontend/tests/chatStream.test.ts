import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeChatStream } from '../src/services/chatStream.ts';

const encode = (text: string) => new TextEncoder().encode(text);
const stream = (chunks: Uint8Array[]) => new ReadableStream<Uint8Array>({
  start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close(); },
});

test('SSE accepts byte-by-byte UTF-8, split CRLF, and heartbeat comments', async () => {
  const bytes = encode(': ping\r\n\r\ndata: {"type":"token","text":"Halo…"}\r\n\r\ndata: {"type":"done","model":"test","source":"local_model","used_database":false}\r\n\r\n');
  const events: unknown[] = [];
  await consumeChatStream(stream(Array.from(bytes, byte => new Uint8Array([byte]))), event => events.push(event));
  assert.deepEqual(events[0], {type:'token',text:'Halo…'});
  assert.equal(events.length, 2);
});

test('SSE does not silently accept a truncated answer', async () => {
  await assert.rejects(consumeChatStream(stream([encode('data: {"type":"token","text":"Partial"}\n\n')]), () => {}), /terputus/);
});

test('SSE surfaces malformed events and consumer errors', async () => {
  await assert.rejects(consumeChatStream(stream([encode('data: invalid\n\n')]), () => {}), SyntaxError);
  await assert.rejects(consumeChatStream(stream([encode('data: {"type":"token","text":"hello"}\n\n')]), () => {throw new Error('consumer failed');}), /consumer failed/);
});

test('SSE cancellation errors propagate', async () => {
  const body = new ReadableStream<Uint8Array>({start(controller) {controller.error(new DOMException('Stopped', 'AbortError'));}});
  await assert.rejects(consumeChatStream(body, () => {}), {name:'AbortError'});
});
