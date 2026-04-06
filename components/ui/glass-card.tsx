"use client"

import { forwardRef } from "react"
import { cn } from "@/lib/utils"

interface GlassCardProps {
  children: React.ReactNode
  variant?: "default" | "kpi" | "interactive" | "sidebar"
  className?: string
  delay?: number
  [key: string]: any
}

const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ children, variant = "default", className, delay, ...props }, ref) => {
    const variants = {
      default: "rounded-xl border border-neutral-200/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
      kpi: "rounded-xl border border-neutral-200/60 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
      interactive: "rounded-xl border border-neutral-200/60 bg-white hover:border-emerald-200 hover:shadow-md transition-all duration-200 cursor-pointer shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
      sidebar: "bg-white border-r border-neutral-200/60",
    }

    return (
      <div
        ref={ref}
        className={cn(variants[variant], className)}
        {...props}
      >
        {children}
      </div>
    )
  }
)

GlassCard.displayName = "GlassCard"

interface GlassKPICardProps extends GlassCardProps {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  trend?: "up" | "down" | "neutral"
  trendValue?: string
  sourceLabel?: string
}

const GlassKPICard = forwardRef<HTMLDivElement, GlassKPICardProps>(
  ({
    children,
    title,
    subtitle,
    icon,
    trend,
    trendValue,
    sourceLabel,
    className,
    delay,
    ...props
  }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("rounded-xl border border-neutral-200/60 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]", className)}
        {...props}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs text-neutral-400 mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="min-h-[60px]">
          {children}
        </div>

        {trend && trendValue && (
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-neutral-100">
            <span className={cn(
              "text-xs font-medium",
              trend === "up" ? "text-emerald-600" : trend === "down" ? "text-red-500" : "text-neutral-400"
            )}>
              {trendValue}
            </span>
          </div>
        )}
      </div>
    )
  }
)

GlassKPICard.displayName = "GlassKPICard"

export { GlassCard, GlassKPICard }
