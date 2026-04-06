"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface KPIGaugeProps {
  value: number
  max?: number
  label: string
  sublabel?: string
  size?: "sm" | "md" | "lg"
  status?: "healthy" | "warning" | "critical"
  unit?: string
}

export function KPIGauge({
  value,
  max = 12,
  label,
  sublabel,
  size = "md",
  status = "healthy",
  unit = "",
}: KPIGaugeProps) {
  const percentage = Math.min((value / max) * 100, 100)
  const circumference = 2 * Math.PI * 45 // radius = 45
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  const sizes = {
    sm: { container: "w-24 h-24", text: "text-2xl", sublabel: "text-xs" },
    md: { container: "w-32 h-32", text: "text-3xl", sublabel: "text-xs" },
    lg: { container: "w-40 h-40", text: "text-4xl", sublabel: "text-sm" },
  }

  const colors = {
    healthy: {
      stroke: "stroke-emerald-500",
      text: "text-emerald-600 dark:text-emerald-400",
      glow: "drop-shadow-[0_0_10px_rgba(16,185,129,0.3)]",
    },
    warning: {
      stroke: "stroke-amber-500",
      text: "text-amber-600 dark:text-amber-400",
      glow: "drop-shadow-[0_0_10px_rgba(245,158,11,0.3)]",
    },
    critical: {
      stroke: "stroke-rose-500",
      text: "text-rose-600 dark:text-rose-400",
      glow: "drop-shadow-[0_0_10px_rgba(244,63,94,0.3)]",
    },
  }

  return (
    <div className={cn("relative mx-auto", sizes[size].container)}>
      {/* Background circle */}
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          className="stroke-muted/30"
          strokeWidth="8"
        />
        {/* Animated progress circle */}
        <motion.circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          className={cn(colors[status].stroke, colors[status].glow)}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.5, ease: "easeOut" }}
        />
      </svg>
      
      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span 
          className={cn("font-bold tabular-nums", sizes[size].text, colors[status].text)}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, duration: 0.3 }}
        >
          {value.toFixed(1)}{unit}
        </motion.span>
        <span className={cn("text-muted-foreground font-medium", sizes[size].sublabel)}>
          {label}
        </span>
        {sublabel && (
          <span className="text-xs text-muted-foreground/70 mt-0.5">
            {sublabel}
          </span>
        )}
      </div>
    </div>
  )
}


