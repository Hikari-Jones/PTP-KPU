import type { ReactNode } from "react"
import { Eye } from "lucide-react"

/** Banner penanda bahwa pengguna hanya memiliki akses baca pada modul ini. */
export function ReadOnlyBanner({ theme, modul, pengelola }: { theme: "light" | "dark"; modul: string; pengelola: string }) {
  const isDark = theme === "dark"
  return (
    <div
      role="status"
      className={`flex items-start gap-3 p-3.5 rounded-xl border text-xs ${
        isDark ? "bg-amber-950/30 border-amber-500/30 text-amber-200" : "bg-amber-50 border-amber-200 text-amber-900"
      }`}
    >
      <Eye className="w-4 h-4 mt-0.5 shrink-0" />
      <span className="leading-relaxed">
        <strong>Mode baca saja.</strong> Anda dapat melihat data {modul}, tetapi penambahan, perubahan, dan penghapusan
        data hanya dapat dilakukan oleh {pengelola} atau Administrator.
      </span>
    </div>
  )
}

/**
 * Membungkus area aksi (form/tombol). Saat readOnly aktif, seluruh input dan tombol di dalamnya dinonaktifkan
 * oleh browser melalui atribut `disabled` pada fieldset.
 */
export function ReadOnlyFieldset({ readOnly, children, className = "" }: { readOnly: boolean; children: ReactNode; className?: string }) {
  return (
    <fieldset
      disabled={readOnly}
      aria-disabled={readOnly}
      className={`min-w-0 border-0 p-0 m-0 ${
        readOnly
          ? "[&_button:disabled]:opacity-50 [&_button:disabled]:cursor-not-allowed [&_button:disabled]:active:scale-100 [&_input:disabled]:cursor-not-allowed [&_select:disabled]:cursor-not-allowed [&_textarea:disabled]:cursor-not-allowed"
          : ""
      } ${className}`}
    >
      {children}
    </fieldset>
  )
}
