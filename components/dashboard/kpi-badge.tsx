"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { AlertTriangle, CheckCircle, XCircle, Info, Users } from "lucide-react"

interface KPIBadgeProps {
  value: number | string
  label: string
  status?: "success" | "warning" | "danger" | "info"
  icon?: "check" | "warning" | "error" | "info" | "users" | "custom"
  customIcon?: React.ReactNode
  size?: "sm" | "md" | "lg"
  pulse?: boolean
}

export function KPIBadge({
  value,
  label,
  status = "info",
  icon = "info",
  customIcon,
  size = "md",
  pulse = false,
}: KPIBadgeProps) {
  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-5 py-2.5 text-base",
  }

  const colors = {
    success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    danger: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400",
    info: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  }

  const iconComponents = {
    check: <CheckCircle className="w-4 h-4" />,
    warning: <AlertTriangle className="w-4 h-4" />,
    error: <XCircle className="w-4 h-4" />,
    info: <Info className="w-4 h-4" />,
    users: <Users className="w-4 h-4" />,
    custom: customIcon,
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "inline-flex items-center gap-2 rounded-full font-semibold",
        sizes[size],
        colors[status],
        pulse && "animate-pulse"
      )}
    >
      {iconComponents[icon]}
      <span className="tabular-nums">{value}</span>
      <span className="font-medium opacity-80">{label}</span>
    </motion.div>
  )
}

// Status badge with dot indicator
interface StatusBadgeProps {
  status: "online" | "offline" | "warning" | "error"
  label: string
  showPulse?: boolean
}

export function StatusBadge({ status, label, showPulse = true }: StatusBadgeProps) {
  const colors = {
    online: "bg-emerald-500",
    offline: "bg-gray-400",
    warning: "bg-amber-500",
    error: "bg-rose-500",
  }

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 text-sm font-medium">
      <span className="relative flex h-2 w-2">
        {showPulse && (status === "online" || status === "warning") && (
          <span className={cn(
            "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
            colors[status]
          )} />
        )}
        <span className={cn(
          "relative inline-flex rounded-full h-2 w-2",
          colors[status]
        )} />
      </span>
      {label}
    </div>
  )
}

// At-risk count badge (for staff burnout)
interface AtRiskBadgeProps {
  count: number
  total: number
  label?: string
}

export function AtRiskBadge({ count, total, label = "at risk" }: AtRiskBadgeProps) {
  const percentage = total > 0 ? (count / total) * 100 : 0
  const status = count === 0 ? "success" : percentage > 20 ? "danger" : "warning"

  return (
    <div className="text-center space-y-2">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "inline-flex items-center justify-center w-20 h-20 rounded-2xl",
          status === "success" && "bg-emerald-100 dark:bg-emerald-900/30",
          status === "warning" && "bg-amber-100 dark:bg-amber-900/30",
          status === "danger" && "bg-rose-100 dark:bg-rose-900/30"
        )}
      >
        <span className={cn(
          "text-4xl font-bold tabular-nums",
          status === "success" && "text-emerald-600 dark:text-emerald-400",
          status === "warning" && "text-amber-600 dark:text-amber-400",
          status === "danger" && "text-rose-600 dark:text-rose-400"
        )}>
          {count}
        </span>
      </motion.div>
      <div className="space-y-0.5">
        <p className={cn(
          "text-sm font-semibold",
          status === "success" && "text-emerald-600 dark:text-emerald-400",
          status === "warning" && "text-amber-600 dark:text-amber-400",
          status === "danger" && "text-rose-600 dark:text-rose-400"
        )}>
          {count === 0 ? "All Clear" : `${count} ${label}`}
        </p>
        <p className="text-xs text-muted-foreground">
          of {total} total staff
        </p>
      </div>
    </div>
  )
}


