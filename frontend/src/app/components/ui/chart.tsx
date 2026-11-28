import { Card, CardHeader, CardTitle, CardContent } from "./card"

export interface MonthlyDocumentStat {
  bulan: number
  nama_bulan: string
  surat: number
  arsip: number
}

/** Monthly letters vs. archive uploads. All values come from /dashboard/overview. */
export function DashboardChart({
  theme = "light",
  data,
  year,
  loading = false,
}: {
  theme?: "light" | "dark"
  data: MonthlyDocumentStat[]
  year: number
  loading?: boolean
}) {
  const isDark = theme === "dark"
  const peak = Math.max(1, ...data.map((item) => Math.max(item.surat, item.arsip)))
  // Round the axis up to a "nice" number so the labels stay readable.
  const step = Math.max(1, Math.ceil(peak / 4))
  const maxVal = step * 4
  const totalSurat = data.reduce((sum, item) => sum + item.surat, 0)
  const totalArsip = data.reduce((sum, item) => sum + item.arsip, 0)
  const empty = !loading && totalSurat === 0 && totalArsip === 0

  return (
    <Card className={`min-w-0 overflow-hidden flex flex-col ${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"} backdrop-blur-md shadow-lg rounded-2xl`}>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="min-w-0">
          <CardTitle className={`text-base font-bold my-0 ${isDark ? "text-white" : "text-slate-900"}`}>
            Statistik Surat & Arsip ({year})
          </CardTitle>
          <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] mt-2 font-semibold ${isDark ? "text-gray-300" : "text-slate-600"}`}>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-gradient-to-t from-red-700 to-red-500" />
              Surat (alur persuratan)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-gradient-to-t from-slate-900 to-slate-600 dark:from-slate-600 dark:to-slate-300" />
              Arsip diunggah
            </span>
          </div>
        </div>
        <span className="shrink-0 rounded-lg border border-red-500/20 bg-red-600/10 px-3 py-1.5 text-xs font-bold text-red-600 dark:text-red-300">
          Jan–Des {year}
        </span>
      </CardHeader>

      <CardContent className="pt-5 flex-1 flex flex-col gap-4 min-h-0">
        <div className={`relative flex-1 min-h-[340px] w-full overflow-hidden rounded-xl border ${isDark ? "bg-[#111827]/60 border-white/10" : "bg-slate-50 border-slate-200"}`}>
          <div className={`absolute left-3 top-7 bottom-11 w-8 flex flex-col justify-between text-[9px] font-semibold ${isDark ? "text-slate-500" : "text-slate-400"}`}>
            {[4, 3, 2, 1, 0].map((n) => (
              <span key={n}>{step * n}</span>
            ))}
          </div>

          <div className="absolute left-12 right-4 top-7 bottom-11">
            {[0, 25, 50, 75, 100].map((position) => (
              <div
                key={position}
                className={`absolute left-0 right-0 border-t ${isDark ? "border-white/[0.07]" : "border-slate-200"}`}
                style={{ top: `${position}%` }}
              />
            ))}

            {loading || empty ? (
              <div className="relative z-10 h-full flex items-center justify-center text-xs text-slate-500">
                {loading ? "Memuat statistik dari server…" : `Belum ada surat atau arsip pada tahun ${year}.`}
              </div>
            ) : (
              <div className="relative z-10 grid h-full grid-cols-12 items-end gap-1 sm:gap-2">
                {data.map((item) => (
                  <div key={item.bulan} className="group flex h-full min-w-0 items-end justify-center gap-0.5 sm:gap-1">
                    {([
                      ["surat", item.surat, "bg-gradient-to-t from-red-800 via-red-700 to-red-500", "surat"],
                      ["arsip", item.arsip, "bg-gradient-to-t from-slate-950 to-slate-600 dark:from-slate-600 dark:to-slate-300", "arsip"],
                    ] as const).map(([key, value, color, unit]) => (
                      <div
                        key={key}
                        style={{ height: value > 0 ? `${Math.max(3, (value / maxVal) * 100)}%` : "2px" }}
                        className={`relative w-full max-w-4 rounded-t-md transition-[filter] duration-200 group-hover:brightness-110 ${value > 0 ? color : isDark ? "bg-slate-700/60" : "bg-slate-300"}`}
                      >
                        {value > 0 && (
                          <span className="pointer-events-none absolute -top-7 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-950 px-2 py-1 text-[9px] font-bold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                            {item.nama_bulan}: {value} {unit}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="absolute bottom-3 left-12 right-4 grid grid-cols-12 gap-1 sm:gap-2">
            {data.map((item) => (
              <span key={item.bulan} className={`truncate text-center text-[9px] sm:text-[10px] font-bold ${isDark ? "text-gray-300" : "text-slate-700"}`}>
                {item.nama_bulan}
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
          <div className={`rounded-lg border px-3 py-2 ${isDark ? "border-white/10 bg-[#111827]/60" : "border-slate-200 bg-slate-50"}`}>
            <span className={isDark ? "text-gray-400" : "text-slate-500"}>Total surat {year}</span>
            <strong className={`ml-1.5 ${isDark ? "text-white" : "text-slate-900"}`}>{totalSurat} surat</strong>
          </div>
          <div className={`rounded-lg border px-3 py-2 sm:text-right ${isDark ? "border-white/10 bg-[#111827]/60" : "border-slate-200 bg-slate-50"}`}>
            <span className={isDark ? "text-gray-400" : "text-slate-500"}>Total arsip diunggah {year}</span>
            <strong className="ml-1.5 text-red-600 dark:text-red-300">{totalArsip} dokumen</strong>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
