import { useState } from 'react'
import type { ReactNode } from 'react'
import { message } from '../../../services/operations'
export const field = 'w-full rounded-lg border border-slate-400/40 bg-transparent p-2 my-1'
export const button = 'rounded-lg bg-red-700 px-3 py-2 text-white disabled:opacity-40'
export function Workspace({ theme, title, children }: { theme: 'light' | 'dark'; title: string; children: ReactNode }) {
  return <section className={`space-y-4 p-5 rounded-2xl ${theme === 'dark' ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'}`}><h1 className="text-2xl font-bold">{title}</h1>{children}</section>
}
export function useOperation() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async (task: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setError('')
    try { await task() } catch (e) { setError(message(e)) } finally { setBusy(false) }
  }
  return { busy, error, run, setError }
}
