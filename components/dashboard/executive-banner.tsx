"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { AlertTriangle, CheckCircle, Info, Database } from "lucide-react"

interface ExecutiveBannerProps {
  userName?: string
  insight?: {
    text: string
    priority: "info" | "warning" | "critical"
  }
  schoolName?: string
}

export function ExecutiveBanner({ 
  userName = "Director", 
  insight,
  schoolName 
}: ExecutiveBannerProps) {
  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return "Good morning"
    if (hour < 18) return "Good afternoon"
    return "Good evening"
  }

  const priorityStyles = {
    info: {
      bg: "bg-emerald-500/20",
      border: "border-emerald-400/30",
      icon: <CheckCircle className="w-5 h-5 text-emerald-300" />,
    },
    warning: {
      bg: "bg-amber-500/20",
      border: "border-amber-400/30",
      icon: <AlertTriangle className="w-5 h-5 text-amber-300" />,
    },
    critical: {
      bg: "bg-rose-500/20",
      border: "border-rose-400/30",
      icon: <AlertTriangle className="w-5 h-5 text-rose-300" />,
    },
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="rounded-lg bg-neutral-900 text-white p-6 relative overflow-hidden"
    >
      <div className="relative z-10">
        {/* Greeting Section */}
        <div className="flex items-start justify-between">
          <div>
            <motion.p
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="text-white/70 text-sm font-medium mb-1"
            >
              {schoolName && `${schoolName} • `}Strategic Command Center
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="text-3xl sm:text-4xl font-bold text-white"
            >
              {getGreeting()}, {userName}
            </motion.h1>
          </div>
          
          {/* Status badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, type: "spring" }}
            className="hidden sm:flex items-center gap-2 bg-neutral-800 px-4 py-2 rounded-lg border border-neutral-700"
          >
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-white/90 text-sm font-medium">AI Insights Active</span>
          </motion.div>
        </div>

        {/* Strategic Insight */}
        {insight && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className={cn(
              "mt-6 p-4 rounded-lg border",
              priorityStyles[insight.priority].bg,
              priorityStyles[insight.priority].border
            )}
          >
            <div className="flex items-start gap-3">
              {priorityStyles[insight.priority].icon}
              <div className="flex-1">
                <p className="text-white font-medium leading-relaxed">
                  {insight.text}
                </p>
              </div>
            </div>
            
            {/* Source badge */}
            <div className="mt-3 flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/10 border border-white/20">
                <Database className="w-3 h-3 text-emerald-300" />
                <span className="text-xs text-white/80 font-medium">Source: Live Database</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </div>
            </div>
          </motion.div>
        )}

        {/* Quick Stats Row */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-6 flex flex-wrap gap-4"
        >
          <QuickStat label="Today" value={new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} />
          <QuickStat label="Week" value={`Week ${getWeekNumber()}`} />
          <QuickStat label="Term" value="Term 2" />
        </motion.div>
      </div>
    </motion.div>
  )
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-white/90">
      <span className="text-white/50 text-sm">{label}:</span>
      <span className="font-semibold text-sm">{value}</span>
    </div>
  )
}

function getWeekNumber(): number {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  const diff = now.getTime() - start.getTime()
  const oneWeek = 1000 * 60 * 60 * 24 * 7
  return Math.ceil(diff / oneWeek)
}

// Compact banner for mobile
export function ExecutiveBannerCompact({ 
  userName = "Director",
  insight 
}: ExecutiveBannerProps) {
  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return "Good morning"
    if (hour < 18) return "Good afternoon"
    return "Good evening"
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-neutral-200 bg-white p-4 lg:hidden"
    >
      <h2 className="text-xl font-bold text-neutral-900">
        {getGreeting()}, {userName}
      </h2>
      {insight && (
        <p className="text-sm text-neutral-500 mt-1 line-clamp-2">
          {insight.text}
        </p>
      )}
    </motion.div>
  )
}

// Responsive wrapper that shows full banner on desktop, compact on mobile
export function ResponsiveExecutiveBanner(props: ExecutiveBannerProps) {
  return (
    <>
      <div className="hidden lg:block">
        <ExecutiveBanner {...props} />
      </div>
      <ExecutiveBannerCompact {...props} />
    </>
  )
}

