import { useEffect, useState } from 'react'
import { CheckCircle2, AlertTriangle, Info, X, Loader2 } from 'lucide-react'
import { subscribeActivity, dismissToast, getActivity, type ActivityState } from '../../../services/activity'

/** Delay before showing indicators so instant responses do not flicker. */
const SHOW_AFTER_MS = 150

export function GlobalActivity() {
  const [activity, setActivity] = useState<ActivityState>(getActivity)
  const [visible, setVisible] = useState(false)

  useEffect(() => subscribeActivity(setActivity), [])

  const busy = activity.reads + activity.writes > 0
  useEffect(() => {
    if (!busy) { setVisible(false); return }
    const timer = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [busy])

  const writing = visible && activity.writes > 0

  return (
    <>
      {/* Top loading bar for any request */}
      <div
        aria-hidden="true"
        className={`fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden pointer-events-none transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
      >
        <div className="global-activity-bar h-full w-1/3 bg-red-600 dark:bg-red-400" />
      </div>

      {/* Write in progress: tells the user to wait and not to repeat the action */}
      <div
        role="status"
        aria-live="polite"
        className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-[100] transition-all duration-200 ${writing ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}
      >
        {writing && (
          <div className="flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold shadow-lg border bg-white text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-white/10">
            <Loader2 className="w-4 h-4 animate-spin text-red-600 dark:text-red-400" />
            Memproses… mohon tunggu
          </div>
        )}
      </div>

      {/* Toasts */}
      <div className="fixed top-4 right-4 z-[110] flex w-[min(92vw,380px)] flex-col gap-2" aria-live="assertive">
        {activity.toasts.map((toast) => {
          const Icon = toast.kind === 'success' ? CheckCircle2 : toast.kind === 'error' ? AlertTriangle : Info
          const tone = toast.kind === 'success'
            ? 'border-red-500/40 text-red-600 dark:text-red-400'
            : toast.kind === 'error'
              ? 'border-red-500/40 text-red-700 dark:text-red-300'
              : 'border-slate-300 text-slate-700 dark:text-slate-200'
          return (
            <div
              key={toast.id}
              role={toast.kind === 'error' ? 'alert' : 'status'}
              className={`animate-in fade-in flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-xs font-medium shadow-lg bg-white dark:bg-slate-900 ${tone}`}
            >
              <Icon className="w-4 h-4 mt-px shrink-0" />
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere] leading-relaxed text-slate-800 dark:text-slate-100">{toast.text}</span>
              <button
                type="button"
                aria-label="Tutup notifikasi"
                onClick={() => dismissToast(toast.id)}
                className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}
