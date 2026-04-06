"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface KPIProgressProps {
  value: number
  max?: number
  label?: string
  showValue?: boolean
  size?: "sm" | "md" | "lg"
  status?: "healthy" | "warning" | "danger" | "auto"
  warningThreshold?: number
  dangerThreshold?: number
}

export function KPIProgress({
  value,
  max = 100,
  label,
  showValue = true,
  size = "md",
  status = "auto",
  warningThreshold = 80,
  dangerThreshold = 95,
}: KPIProgressProps) {
  const percentage = Math.min((value / max) * 100, 100)

  // Determine status automatically if set to auto
  const computedStatus = status === "auto" 
    ? percentage >= dangerThreshold 
      ? "danger" 
      : percentage >= warningThreshold 
        ? "warning" 
        : "healthy"
    : status

  const sizes = {
    sm: "h-2",
    md: "h-3",
    lg: "h-4",
  }

  const colors = {
    healthy: "from-emerald-500 to-emerald-400",
    warning: "from-amber-500 to-orange-400",
    danger: "from-rose-500 to-red-400",
  }

  return (
    <div className="w-full space-y-2">
      {(label || showValue) && (
        <div className="flex items-center justify-between text-sm">
          {label && (
            <span className="font-medium text-muted-foreground">{label}</span>
          )}
          {showValue && (
            <span className={cn(
              "font-bold tabular-nums",
              computedStatus === "healthy" && "text-emerald-600 dark:text-emerald-400",
              computedStatus === "warning" && "text-amber-600 dark:text-amber-400",
              computedStatus === "danger" && "text-rose-600 dark:text-rose-400"
            )}>
              {percentage.toFixed(0)}%
            </span>
          )}
        </div>
      )}
      
      <div className={cn(
        "w-full rounded-full overflow-hidden",
        sizes[size],
        "bg-muted/50"
      )}>
        <motion.div
          className={cn(
            "h-full rounded-full bg-gradient-to-r",
            colors[computedStatus]
          )}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </div>
    </div>
  )
}

// Compact version for lists
interface KPIProgressCompactProps {
  value: number
  max?: number
  label: string
  sublabel?: string
  status?: "healthy" | "warning" | "danger" | "auto"
}

export function KPIProgressCompact({
  value,
  max = 100,
  label,
  sublabel,
  status = "auto",
}: KPIProgressCompactProps) {
  const percentage = Math.min((value / max) * 100, 100)
  const computedStatus = status === "auto" 
    ? percentage >= 95 ? "danger" : percentage >= 80 ? "warning" : "healthy"
    : status

  const colors = {
    healthy: "bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-rose-500",
  }

  return (
    <div className="flex items-center gap-4 py-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-medium truncate">{label}</span>
          <span className={cn(
            "text-sm font-bold tabular-nums",
            computedStatus === "healthy" && "text-emerald-600",
            computedStatus === "warning" && "text-amber-600",
            computedStatus === "danger" && "text-rose-600"
          )}>
            {percentage.toFixed(0)}%
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
          <motion.div
            className={cn("h-full rounded-full", colors[computedStatus])}
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
        {sublabel && (
          <p className="text-xs text-muted-foreground mt-1">{sublabel}</p>
        )}
      </div>
    </div>
  )
}


