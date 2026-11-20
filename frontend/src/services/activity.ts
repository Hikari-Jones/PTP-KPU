/**
 * Global request activity: drives the loading bar, the "Memproses…" indicator and
 * success/error toasts for every API call made with fetch, without each screen
 * having to wire it up. Installed once from main.tsx.
 *
 * - Every API request shows the top loading bar while in flight.
 * - Every write (POST/PUT/PATCH/DELETE) shows "Memproses…" and ends with a
 *   success or error toast. Errors use the server's "detail" message.
 * - Reads only toast when the server cannot be reached (screens show their own
 *   inline errors for failed reads).
 * - An identical write sent again while the first is still running (double click)
 *   is not sent twice; both callers receive the first response.
 */

export type ToastKind = 'success' | 'error' | 'info'
export interface Toast { id: number; kind: ToastKind; text: string }
export interface ActivityState { reads: number; writes: number; toasts: Toast[] }

type Listener = (state: ActivityState) => void

let state: ActivityState = { reads: 0, writes: 0, toasts: [] }
const listeners = new Set<Listener>()
let nextToastId = 1

function emit(patch: Partial<ActivityState>) {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener(state))
}

export function subscribeActivity(listener: Listener): () => void {
  listeners.add(listener)
  listener(state)
  return () => { listeners.delete(listener) }
}

export function getActivity(): ActivityState { return state }

export function showToast(kind: ToastKind, text: string, ms = kind === 'error' ? 7000 : 3500) {
  const id = nextToastId++
  // Keep at most 4 toasts on screen.
  emit({ toasts: [...state.toasts.slice(-3), { id, kind, text }] })
  window.setTimeout(() => dismissToast(id), ms)
}

export function dismissToast(id: number) {
  emit({ toasts: state.toasts.filter((toast) => toast.id !== id) })
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * 'quiet'      – the screen gives its own, more specific feedback (login, chatbot),
 *                or the call is an internal rollback (discarding an unused upload).
 * 'errorsOnly' – an intermediate step of a larger action (file upload before the
 *                record is saved); only failures are reported.
 */
function feedbackMode(method: string, path: string): 'all' | 'quiet' | 'errorsOnly' {
  if (/\/auth\/(login|logout)\/?$/.test(path) || /\/ai\//.test(path)) return 'quiet'
  if (method === 'DELETE' && /\/files\/\d+\/?$/.test(path)) return 'quiet'
  if (/\/files\/upload\/?$/.test(path)) return 'errorsOnly'
  return 'all'
}

/** Long-lived streams have their own indicator in the chatbot. */
function isStream(path: string): boolean {
  return /\/ai\/chat\/stream\/?$/.test(path)
}

function successText(method: string, path: string): string {
  if (/\/backups\/?$/.test(path)) return 'Cadangan berhasil dibuat'
  if (/\/(submit)\/?$/.test(path)) return 'Berhasil diajukan'
  if (/\/(verify)\/?$/.test(path)) return 'Berhasil diverifikasi'
  if (/\/(reject)\/?$/.test(path)) return 'Berhasil dikembalikan untuk perbaikan'
  if (/\/restore\/?$/.test(path)) return 'Data berhasil dipulihkan'
  if (method === 'DELETE' || /\/delete\/?$/.test(path)) return 'Data berhasil dihapus'
  if (method === 'POST') return 'Data berhasil disimpan'
  return 'Perubahan berhasil disimpan'
}

async function errorText(response: Response): Promise<string> {
  try {
    const body = await response.clone().json()
    const detail = body?.detail
    if (typeof detail === 'string' && detail) return detail
    // FastAPI validation errors: [{loc, msg}, ...]
    if (Array.isArray(detail) && detail.length) {
      const first = detail[0]
      const field = Array.isArray(first?.loc) ? first.loc[first.loc.length - 1] : ''
      return `Data tidak valid${field ? ` (${field})` : ''}: ${first?.msg ?? 'periksa kembali isian'}`
    }
  } catch { /* not JSON */ }
  if (response.status === 401) return 'Sesi berakhir. Silakan masuk kembali.'
  if (response.status === 403) return 'Anda tidak memiliki izin untuk tindakan ini.'
  if (response.status === 413) return 'Ukuran berkas terlalu besar.'
  if (response.status === 429) return 'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.'
  if (response.status >= 500) return `Server mengalami gangguan (${response.status}). Silakan coba lagi.`
  return `Permintaan gagal (${response.status})`
}

let installed = false

export function installActivityTracking(apiBase: string) {
  if (installed || typeof window === 'undefined') return
  installed = true
  const originalFetch = window.fetch.bind(window)
  const inflightWrites = new Map<string, Promise<Response>>()

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const path = url.startsWith('http') ? new URL(url).pathname : url
    const isApi = path.startsWith(apiBase) || path.startsWith('/api/')
    if (!isApi || isStream(path)) return originalFetch(input, init)

    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const isWrite = WRITE_METHODS.has(method)
    const mode = feedbackMode(method, path)

    // Double-submit guard: reuse the in-flight promise for an identical write.
    const body = init?.body
    const dedupeKey = isWrite && (body === undefined || body === null || typeof body === 'string')
      ? `${method} ${url} ${body ?? ''}` : null
    if (dedupeKey && inflightWrites.has(dedupeKey)) {
      return inflightWrites.get(dedupeKey)!.then((response) => response.clone())
    }

    emit(isWrite ? { writes: state.writes + 1 } : { reads: state.reads + 1 })
    const request = (async () => {
      try {
        const response = await originalFetch(input, init)
        if (isWrite && mode !== 'quiet') {
          if (!response.ok) showToast('error', await errorText(response))
          else if (mode === 'all') showToast('success', successText(method, path))
        } else if (!isWrite && response.status >= 500 && response.status !== 503) {
          showToast('error', await errorText(response))
        }
        return response
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          showToast('error', 'Tidak dapat terhubung ke server. Periksa jaringan lalu coba lagi.')
        }
        throw error
      } finally {
        emit(isWrite ? { writes: state.writes - 1 } : { reads: state.reads - 1 })
        if (dedupeKey) inflightWrites.delete(dedupeKey)
      }
    })()
    if (dedupeKey) inflightWrites.set(dedupeKey, request)
    return request.then((response) => (dedupeKey ? response.clone() : response))
  }
}
