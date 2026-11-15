import * as React from "react"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "success" | "warning" | "info" | "outline" | "draft" | "terkirim" | "diterima" | "diproses"
}

export function Badge({ className = "", variant = "default", ...props }: BadgeProps) {
  let variantStyles = "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800"

  if (variant === "terkirim" || variant === "diterima") {
    variantStyles = "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800"
  } else if (variant === "success") {
    variantStyles = "bg-black text-white border-black dark:bg-black dark:text-white dark:border-slate-700"
  } else if (variant === "diproses" || variant === "info") {
    variantStyles = "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800"
  } else if (variant === "warning") {
    variantStyles = "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800"
  } else if (variant === "draft" || variant === "secondary") {
    variantStyles = "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600"
  } else if (variant === "outline") {
    variantStyles = "bg-white text-slate-700 border-slate-300 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-600"
  }

  return (
    <div
      className={`status-badge inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-5 transition-colors font-sans ${variantStyles} ${className}`}
      {...props}
    />
  )
}
