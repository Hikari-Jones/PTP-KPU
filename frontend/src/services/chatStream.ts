import type { ChatStreamEvent } from './api';

/** Decode SSE across arbitrary UTF-8 and CRLF network chunk boundaries. */
export async function consumeChatStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ChatStreamEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed = false;
  try {
    while (!completed) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = block.split('\n').filter(line => line.startsWith('data:'))
          .map(line => line.slice(5).trimStart()).join('\n');
        if (!data) continue; // SSE comment/heartbeat
        const event = JSON.parse(data) as ChatStreamEvent;
        onEvent(event);
        if (event.type === 'done') {
          completed = true;
          break;
        }
      }
      if (done) break;
    }
    if (!completed) throw new Error('Jawaban AI terputus sebelum selesai. Silakan coba lagi.');
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
