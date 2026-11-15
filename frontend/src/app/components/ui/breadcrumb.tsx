import * as React from "react"
import { ChevronRight, Home } from "lucide-react"

export interface BreadcrumbItem {
  label: string
  href?: string
  active?: boolean
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[]
  className?: string
}

export function Breadcrumb({ items, className = "" }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={`flex items-center space-x-2 text-xs text-gray-400 ${className}`}>
      <span className="flex items-center gap-1 text-gray-400 hover:text-gray-200 cursor-pointer">
        <Home className="w-3.5 h-3.5" />
      </span>
      {items.map((item, index) => (
        <React.Fragment key={index}>
          <ChevronRight className="w-3.5 h-3.5 text-gray-600 shrink-0" />
          <span
            className={
              item.active
                ? "font-medium text-gray-200"
                : "hover:text-gray-200 cursor-pointer"
            }
          >
            {item.label}
          </span>
        </React.Fragment>
      ))}
    </nav>
  )
}
