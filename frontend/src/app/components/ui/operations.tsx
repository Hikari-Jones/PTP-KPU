import { useState } from 'react'
import type { ReactNode } from 'react'
import { message } from '../../../services/operations'
import { Loader2 } from 'lucide-react'

export const field =
  'w-full rounded-xl border p-2.5 text-sm transition-all outline-hidden ' +
  'bg-white border-slate-300 text-slate-800 placeholder:text-slate-400 focus:border-red-600 focus:ring-1 focus:ring-red-600 shadow-xs ' +
  'dark:bg-[#111827]/80 dark:border-white/10 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-red-500 dark:focus:ring-1 dark:focus:ring-red-500'

export const button =
  'btn-kpu-red px-4 py-2.5 text-white font-bold text-xs rounded-xl inline-flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none'

export const buttonSecondary =
  'px-4 py-2.5 font-bold text-xs rounded-xl inline-flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 border ' +
  'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 shadow-xs ' +
  'dark:bg-[#1e293b] dark:hover:bg-[#283548] dark:text-gray-200 dark:border-white/10'

export function Workspace({
  theme,
  title,
  category,
  description,
  actions,
  children
}: {
  theme: 'light' | 'dark'
  title: string
  category?: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}) {
  const isDark = theme === 'dark'
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Standard Unified Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          {category && (
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
              {category}
            </p>
          )}
          <h1 className={`text-xl font-bold tracking-tight my-0 ${isDark ? 'text-white' : 'text-black'}`}>
            {title}
          </h1>
          {description && (
            <p className={`text-xs mt-1 font-medium ${isDark ? 'text-gray-300' : 'text-slate-700'}`}>
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="shrink-0 flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>

      <section
        className={`p-6 sm:p-7 rounded-2xl border transition-all backdrop-blur-md shadow-lg ${
          isDark
            ? 'bg-[#1e293b]/90 border-white/10 text-gray-100 shadow-black/40'
            : 'bg-white/85 border-slate-200 text-slate-900 shadow-slate-200/50'
        }`}
      >
        <div className="space-y-6">
          {children}
        </div>
      </section>
    </div>
  )
}

export function LoadingSpinner({ text = 'Memuat data...', className = '' }: { text?: string; className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center p-8 gap-3 text-slate-500 dark:text-slate-400 ${className}`}>
      <Loader2 className="w-6 h-6 animate-spin text-red-600 dark:text-red-500" />
      <span className="text-xs font-medium animate-pulse">{text}</span>
    </div>
  )
}

export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-100/70 dark:bg-slate-800/40 min-h-[96px] flex flex-col justify-between"
        >
          <div className="h-3 w-24 bg-slate-300 dark:bg-slate-700 rounded-md"></div>
          <div className="h-7 w-20 bg-slate-300 dark:bg-slate-700 rounded-lg mt-2"></div>
        </div>
      ))}
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full rounded-2xl border border-slate-200 dark:border-white/10 bg-white/50 dark:bg-[#111827]/40 overflow-hidden animate-pulse">
      <div className="h-10 bg-slate-200/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-white/10"></div>
      <div className="p-4 space-y-3">
        {Array.from({ length: rows }).map((_, rIdx) => (
          <div key={rIdx} className="flex gap-4 items-center">
            {Array.from({ length: cols }).map((_, cIdx) => (
              <div
                key={cIdx}
                className="h-4 bg-slate-200 dark:bg-slate-800 rounded-md flex-1"
                style={{ opacity: 1 - rIdx * 0.15 }}
              ></div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
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
