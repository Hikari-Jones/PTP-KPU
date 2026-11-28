import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import * as activity from '../src/services/activity'

// Minimal browser stand-in: activity.ts patches window.fetch and uses timers.
const calls: string[] = []
let nextResponse: () => Promise<Response> = async () => new Response('{}', { status: 200 })
const fakeWindow = {
  fetch: async (input: RequestInfo | URL) => { calls.push(String(input)); return nextResponse() },
  setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms).unref(),
}
;(globalThis as unknown as { window: typeof fakeWindow }).window = fakeWindow

activity.installActivityTracking('/api/v1')
const latestToast = () => activity.getActivity().toasts.at(-1)

test('successful write shows a success toast and clears the busy counter', async () => {
  nextResponse = async () => new Response('{}', { status: 201 })
  await window.fetch('/api/v1/arsip/', { method: 'POST', body: '{"a":1}' })
  assert.equal(latestToast()?.kind, 'success')
  assert.equal(activity.getActivity().writes, 0)
})

test('failed write shows the server detail message', async () => {
  nextResponse = async () => new Response(JSON.stringify({ detail: 'Nomor dokumen sudah tercatat' }), { status: 409 })
  const res = await window.fetch('/api/v1/realisasi-anggaran/', { method: 'POST', body: '{}' })
  assert.equal(res.status, 409)
  assert.deepEqual(await res.json(), { detail: 'Nomor dokumen sudah tercatat' }) // body still readable by caller
  assert.equal(latestToast()?.kind, 'error')
  assert.equal(latestToast()?.text, 'Nomor dokumen sudah tercatat')
})

test('validation errors are summarised readably', async () => {
  nextResponse = async () => new Response(JSON.stringify({ detail: [{ loc: ['body', 'perihal'], msg: 'Field required' }] }), { status: 422 })
  await window.fetch('/api/v1/surat-keluar/draft', { method: 'POST', body: '{}' })
  assert.equal(latestToast()?.text, 'Data tidak valid (perihal): Field required')
})

test('network failure shows a connection toast and rethrows', async () => {
  nextResponse = async () => { throw new TypeError('Failed to fetch') }
  await assert.rejects(window.fetch('/api/v1/bagian/', { method: 'GET' }))
  assert.match(latestToast()?.text ?? '', /Tidak dapat terhubung/)
  assert.equal(activity.getActivity().reads, 0)
})

test('identical double-submitted write is sent once; both callers get the response', async () => {
  calls.length = 0
  let release!: () => void
  nextResponse = () => new Promise((resolve) => { release = () => resolve(new Response('{"id":7}', { status: 201 })) })
  const first = window.fetch('/api/v1/operations/bugs', { method: 'POST', body: '{"title":"x"}' })
  const second = window.fetch('/api/v1/operations/bugs', { method: 'POST', body: '{"title":"x"}' })
  assert.equal(activity.getActivity().writes, 1)
  release()
  const [a, b] = await Promise.all([first, second])
  assert.equal(calls.length, 1)
  assert.deepEqual(await a.json(), { id: 7 })
  assert.deepEqual(await b.json(), { id: 7 })
})

test('upload rollback and login stay quiet; non-API requests are untouched', async () => {
  nextResponse = async () => new Response(null, { status: 204 })
  const before = activity.getActivity().toasts.length
  await window.fetch('/api/v1/files/12', { method: 'DELETE' })
  nextResponse = async () => new Response('{}', { status: 401 })
  await window.fetch('/api/v1/auth/login', { method: 'POST', body: '{}' })
  nextResponse = async () => new Response('', { status: 500 })
  await window.fetch('/assets/logo.png')
  assert.equal(activity.getActivity().toasts.length, before)
})
