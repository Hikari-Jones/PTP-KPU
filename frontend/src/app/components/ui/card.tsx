import * as React from "react"

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Card({ className = "", ...props }: CardProps) {
  return (
    <div
      className={`glass-panel transition-all duration-200 ${className}`}
      {...props}
    />
  )
}

export function CardHeader({ className = "", ...props }: CardProps) {
  return <div className={`flex flex-col space-y-1.5 p-5 ${className}`} {...props} />
}

export function CardTitle({ className = "", ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={`text-lg font-semibold leading-none tracking-tight ${className}`}
      {...props}
    />
  )
}

export function CardDescription({ className = "", ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={`text-sm ${className}`} {...props} />
  )
}

export function CardContent({ className = "", ...props }: CardProps) {
  return <div className={`p-5 pt-0 ${className}`} {...props} />
}

export function CardFooter({ className = "", ...props }: CardProps) {
  return <div className={`flex items-center p-5 pt-0 ${className}`} {...props} />
}
