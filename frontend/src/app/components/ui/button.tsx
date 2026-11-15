import * as React from "react"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" | "danger"
  size?: "default" | "sm" | "lg" | "icon"
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", size = "default", ...props }, ref) => {
    let variantStyles = "btn-kpu-red"
    if (variant === "outline") variantStyles = "border border-slate-300 dark:border-white/20 bg-transparent hover:bg-slate-100 dark:hover:bg-white/10 text-slate-800 dark:text-gray-200"
    if (variant === "secondary") variantStyles = "bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-gray-200 hover:bg-slate-300 dark:hover:bg-slate-700"
    if (variant === "ghost") variantStyles = "hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-gray-300 hover:text-black dark:hover:text-white"
    if (variant === "danger") variantStyles = "btn-kpu-red"

    let sizeStyles = "min-h-11 px-4 py-2 text-sm gap-2"
    if (size === "sm") sizeStyles = "min-h-9 rounded-lg px-3 py-1.5 text-sm gap-2"
    if (size === "lg") sizeStyles = "min-h-12 rounded-xl px-8 py-2 text-base gap-2"
    if (size === "icon") sizeStyles = "h-11 w-11 p-0 flex items-center justify-center rounded-xl"

    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:pointer-events-none disabled:opacity-50 cursor-pointer rounded-lg ${variantStyles} ${sizeStyles} ${className}`}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"
