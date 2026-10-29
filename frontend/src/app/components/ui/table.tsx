import * as React from "react"

export function Table({ className = "", ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="relative w-full overflow-auto">
      <table className={`w-full caption-bottom border-separate border-spacing-x-0 border-spacing-y-3 text-sm text-left ${className}`} {...props} />
    </div>
  )
}

export function TableHeader({ className = "", ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={`border-b border-slate-200 dark:border-white/30 text-xs font-semibold uppercase tracking-wider ${className}`} {...props} />
}

export function TableBody({ className = "", ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...props} />
}

export function TableRow({ className = "", ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={className} {...props} />
}

export function TableHead({ className = "", ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={`h-10 px-4 text-left align-middle font-medium ${className}`} {...props} />
}

export function TableCell({ className = "", ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={`p-4 align-middle bg-white/80 dark:bg-[#111827]/75 border-y border-slate-200 dark:border-white/10 first:border-l last:border-r first:rounded-l-xl last:rounded-r-xl ${className}`}
      {...props}
    />
  )
}
