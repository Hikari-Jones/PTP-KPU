import * as React from "react"

export function Avatar({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`relative flex h-9 w-9 shrink-0 overflow-hidden rounded-full ${className}`} {...props}>
      {children}
    </div>
  )
}

export function AvatarImage({ className = "", src, alt = "", ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  return <img className={`aspect-square h-full w-full object-cover ${className}`} src={src} alt={alt} {...props} />
}

export function AvatarFallback({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`flex h-full w-full items-center justify-center rounded-full bg-[#1e293b] text-xs font-semibold text-gray-200 ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
