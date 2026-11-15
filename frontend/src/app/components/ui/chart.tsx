import { Card, CardHeader, CardTitle, CardContent } from "./card"

export function DashboardChart({ theme = "light" }: { theme?: "light" | "dark" }) {
  const chartData = [
    { month: "Jan", surat: 45, arsip: 120 },
    { month: "Feb", surat: 62, arsip: 140 },
    { month: "Mar", surat: 78, arsip: 180 },
    { month: "Apr", surat: 95, arsip: 210 },
    { month: "Mei", surat: 110, arsip: 230 },
    { month: "Jun", surat: 128, arsip: 248 },
  ]

  const maxVal = 260
  const isDark = theme === "dark"

  return (
    <Card className={`min-w-0 overflow-hidden flex flex-col ${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"} backdrop-blur-md shadow-lg rounded-2xl`}>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="min-w-0">
          <CardTitle className={`text-base font-bold my-0 ${isDark ? "text-white" : "text-slate-900"}`}>
            Statistik Dokumen & Surat (2026)
          </CardTitle>
          <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] mt-2 font-semibold ${isDark ? "text-gray-300" : "text-slate-600"}`}>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-gradient-to-t from-red-700 to-red-500" />
              Surat masuk
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-gradient-to-t from-slate-900 to-slate-600 dark:from-slate-600 dark:to-slate-300" />
              Arsip dokumen
            </span>
          </div>
        </div>
        <span className="shrink-0 rounded-lg border border-red-500/20 bg-red-600/10 px-3 py-1.5 text-xs font-bold text-red-600 dark:text-red-300">
          Jan–Jun
        </span>
      </CardHeader>

      <CardContent className="pt-5 flex-1 flex flex-col gap-4 min-h-0">
        <div className={`relative flex-1 min-h-[340px] w-full overflow-hidden rounded-xl border ${isDark ? "bg-[#111827]/60 border-white/10" : "bg-slate-50 border-slate-200"}`}>
          <div className={`absolute left-3 top-7 bottom-11 w-8 flex flex-col justify-between text-[9px] font-semibold ${isDark ? "text-slate-500" : "text-slate-400"}`}>
            {["260", "195", "130", "65", "0"].map((label) => (
              <span key={label}>{label}</span>
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

            <div className="relative z-10 grid h-full grid-cols-6 items-end gap-3 sm:gap-5">
              {chartData.map((item) => {
                const suratHeight = (item.surat / maxVal) * 100
                const arsipHeight = (item.arsip / maxVal) * 100

                return (
                  <div key={item.month} className="group flex h-full min-w-0 items-end justify-center gap-1 sm:gap-2">
                    <div
                      style={{ height: `${suratHeight}%` }}
                      className="relative w-full max-w-6 rounded-t-md bg-gradient-to-t from-red-800 via-red-700 to-red-500 shadow-[0_0_18px_rgba(220,38,38,0.12)] transition-[filter] duration-200 group-hover:brightness-110"
                    >
                      <span className="pointer-events-none absolute -top-7 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-950 px-2 py-1 text-[9px] font-bold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                        {item.surat} surat
                      </span>
                    </div>
                    <div
                      style={{ height: `${arsipHeight}%` }}
                      className="relative w-full max-w-6 rounded-t-md bg-gradient-to-t from-slate-950 to-slate-600 dark:from-slate-600 dark:to-slate-300 transition-[filter] duration-200 group-hover:brightness-110"
                    >
                      <span className="pointer-events-none absolute -top-7 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-950 px-2 py-1 text-[9px] font-bold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                        {item.arsip} arsip
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="absolute bottom-3 left-12 right-4 grid grid-cols-6 gap-3 sm:gap-5">
            {chartData.map((item) => (
              <span key={item.month} className={`text-center text-[9px] sm:text-[10px] font-bold ${isDark ? "text-gray-300" : "text-slate-700"}`}>
                {item.month}
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
          <div className={`rounded-lg border px-3 py-2 ${isDark ? "border-white/10 bg-[#111827]/60" : "border-slate-200 bg-slate-50"}`}>
            <span className={isDark ? "text-gray-400" : "text-slate-500"}>Total surat masuk</span>
            <strong className={`ml-1.5 ${isDark ? "text-white" : "text-slate-900"}`}>518 berkas</strong>
          </div>
          <div className={`rounded-lg border px-3 py-2 sm:text-right ${isDark ? "border-white/10 bg-[#111827]/60" : "border-slate-200 bg-slate-50"}`}>
            <span className={isDark ? "text-gray-400" : "text-slate-500"}>Arsip terbaru</span>
            <strong className="ml-1.5 text-red-600 dark:text-red-300">248 dokumen</strong>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
