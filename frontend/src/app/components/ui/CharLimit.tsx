interface CharLimitProps {
  value: string | number | null | undefined
  max: number
  className?: string
  exact?: boolean
}

export function CharLimit({ value, max, className = '', exact = false }: CharLimitProps) {
  const len = value == null ? 0 : String(value).length
  const atLimit = len >= max
  const nearLimit = !atLimit && len >= Math.floor(max * 0.9)

  const tone = exact
    ? len === max
      ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
      : 'text-slate-500 dark:text-slate-400'
    : atLimit
      ? 'text-red-600 dark:text-red-400 font-bold'
      : nearLimit
        ? 'text-amber-600 dark:text-amber-400 font-semibold'
        : 'text-slate-400 dark:text-slate-500'

  return (
    <span className={`inline-block text-[10px] leading-none tabular-nums select-none ${tone} ${className}`}>
      {len}/{max} karakter{atLimit && !exact ? ' (maks.)' : ''}
    </span>
  )
}
