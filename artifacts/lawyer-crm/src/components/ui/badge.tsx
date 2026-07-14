import * as React from "react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "new" | "in_progress" | "closed"
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        {
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80": variant === "default",
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80": variant === "secondary",
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80": variant === "destructive",
          "text-foreground": variant === "outline",
          "border-transparent bg-[#e0f2fe] text-[#0369a1]": variant === "new",
          "border-transparent bg-[#fef3c7] text-[#b45309]": variant === "in_progress",
          "border-transparent bg-[#dcfce7] text-[#15803d]": variant === "closed",
        },
        className
      )}
      {...props}
    />
  )
}

export { Badge }
