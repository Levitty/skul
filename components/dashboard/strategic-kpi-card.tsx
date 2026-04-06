"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { GlassKPICard } from "@/components/ui/glass-card"
import { KPIGauge } from "./kpi-gauge"
import { KPISparkline } from "./kpi-sparkline"
import { KPIProgress } from "./kpi-progress"
import { AtRiskBadge } from "./kpi-badge"
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Users, 
  Activity, 
  AlertTriangle,
  Target,
  BookOpen
} from "lucide-react"
import type { 
  FinancialRunwayMetric, 
  CollectionVelocityMetric,
  CapacityUtilizationMetric,
  StaffBurnoutMetric,
  StudentRetentionMetric
} from "@/lib/analytics/strategic-metrics"

// Financial Runway Card
interface FinancialRunwayCardProps {
  data: FinancialRunwayMetric | null
  delay?: number
}

export function FinancialRunwayCard({ data, delay = 0 }: FinancialRunwayCardProps) {
  if (!data) {
    return (
      <GlassKPICard
        title="Financial Runway"
        subtitle="Months of operation"
        icon={<DollarSign className="w-5 h-5" />}
        delay={delay}
      >
        <div className="flex items-center justify-center h-full text-muted-foreground">
          No data available
        </div>
      </GlassKPICard>
    )
  }

  return (
    <GlassKPICard
      title="Financial Runway"
      subtitle="Months of operation"
      icon={<DollarSign className="w-5 h-5" />}
      trend={data.trend === "healthy" ? "up" : data.trend === "critical" ? "down" : "neutral"}
      trendValue={data.projectedEndDate ? `Until ${new Date(data.projectedEndDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}` : undefined}
      delay={delay}
    >
      <KPIGauge
        value={data.months}
        max={12}
        label="Months"
        sublabel={`KES ${(data.bankBalance / 1000000).toFixed(1)}M balance`}
        status={data.trend}
      />
    </GlassKPICard>
  )
}

// Collection Velocity Card
interface CollectionVelocityCardProps {
  data: CollectionVelocityMetric | null
  delay?: number
}

export function CollectionVelocityCard({ data, delay = 0 }: CollectionVelocityCardProps) {
  if (!data) {
    return (
      <GlassKPICard
        title="Collection Velocity"
        subtitle="vs same period last year"
        icon={<Activity className="w-5 h-5" />}
        delay={delay}
      >
        <div className="flex items-center justify-center h-full text-muted-foreground">
          No data available
        </div>
      </GlassKPICard>
    )
  }

  const color = data.percentageChange >= 0 ? "emerald" : "rose"

  return (
    <GlassKPICard
      title="Collection Velocity"
      subtitle="vs same period last year"
      icon={<Activity className="w-5 h-5" />}
      trend={data.trend}
      trendValue={`${data.percentageChange >= 0 ? '+' : ''}${data.percentageChange}%`}
      delay={delay}
    >
      <div className="space-y-3">
        <div className="flex items-end gap-2">
          <span className={cn(
            "text-4xl font-bold tabular-nums",
            data.percentageChange >= 0 ? "text-emerald-600" : "text-rose-600"
          )}>
            {data.percentageChange >= 0 ? '+' : ''}{data.percentageChange}%
          </span>
          {data.percentageChange >= 0 
            ? <TrendingUp className="w-6 h-6 text-emerald-500 mb-1" />
            : <TrendingDown className="w-6 h-6 text-rose-500 mb-1" />
          }
        </div>
        <KPISparkline 
          data={data.sparklineData} 
          height={50} 
          color={color}
          showDots={false}
        />
        {data.projectedGap > 0 && (
          <p className="text-xs text-muted-foreground">
            Projected gap: KES {(data.projectedGap / 1000000).toFixed(1)}M
          </p>
        )}
      </div>
    </GlassKPICard>
  )
}

// Capacity Utilization Card
interface CapacityUtilizationCardProps {
  data: CapacityUtilizationMetric | null
  delay?: number
}

export function CapacityUtilizationCard({ data, delay = 0 }: CapacityUtilizationCardProps) {
  if (!data) {
    return (
      <GlassKPICard
        title="Capacity Utilization"
        subtitle="School enrollment"
        icon={<Users className="w-5 h-5" />}
        delay={delay}
      >
        <div className="flex items-center justify-center h-full text-muted-foreground">
          No data available
        </div>
      </GlassKPICard>
    )
  }

  const status = data.status === "overcapacity" ? "danger" 
    : data.status === "optimal" ? "warning" 
    : "healthy"

  return (
    <GlassKPICard
      title="Capacity Utilization"
      subtitle="School enrollment"
      icon={<Users className="w-5 h-5" />}
      trend={data.status === "overcapacity" ? "down" : "up"}
      trendValue={`${data.enrolledStudents}/${data.totalCapacity} students`}
      delay={delay}
    >
      <div className="space-y-4">
        <div className="text-center">
          <span className={cn(
            "text-5xl font-bold tabular-nums",
            status === "healthy" && "text-emerald-600",
            status === "warning" && "text-amber-600",
            status === "danger" && "text-rose-600"
          )}>
            {data.utilizationPercent}%
          </span>
        </div>
        <KPIProgress 
          value={data.utilizationPercent} 
          max={100}
          status={status}
          showValue={false}
          size="lg"
        />
      </div>
    </GlassKPICard>
  )
}

// Staff Burnout Sentinel Card
interface StaffBurnoutCardProps {
  data: StaffBurnoutMetric | null
  delay?: number
}

export function StaffBurnoutCard({ data, delay = 0 }: StaffBurnoutCardProps) {
  if (!data) {
    return (
      <GlassKPICard
        title="Staff Health Sentinel"
        subtitle="Burnout risk monitoring"
        icon={<AlertTriangle className="w-5 h-5" />}
        delay={delay}
      >
        <div className="flex items-center justify-center h-full text-muted-foreground">
          No data available
        </div>
      </GlassKPICard>
    )
  }

  return (
    <GlassKPICard
      title="Staff Health Sentinel"
      subtitle="Burnout risk monitoring"
      icon={<AlertTriangle className="w-5 h-5" />}
      trend={data.atRiskCount === 0 ? "up" : "down"}
      trendValue={data.atRiskCount === 0 ? "All healthy" : `${data.atRiskCount} need attention`}
      delay={delay}
    >
      <AtRiskBadge 
        count={data.atRiskCount} 
        total={data.totalStaff}
        label="teachers at risk"
      />
    </GlassKPICard>
  )
}

// Student Retention Card
interface StudentRetentionCardProps {
  data: StudentRetentionMetric | null
  delay?: number
}

export function StudentRetentionCard({ data, delay = 0 }: StudentRetentionCardProps) {
  if (!data) {
    return (
      <GlassKPICard
        title="Student Retention"
        subtitle="Continuing students"
        icon={<Target className="w-5 h-5" />}
        delay={delay}
      >
        <div className="flex items-center justify-center h-full text-muted-foreground">
          No data available
        </div>
      </GlassKPICard>
    )
  }

  const status = data.retentionRate >= 95 ? "healthy" 
    : data.retentionRate >= 90 ? "warning" 
    : "critical"

  return (
    <GlassKPICard
      title="Student Retention"
      subtitle="Continuing students"
      icon={<Target className="w-5 h-5" />}
      trend={data.trend}
      trendValue={`${data.currentTermStudents} of ${data.previousTermStudents} students`}
      delay={delay}
    >
      <div className="flex items-center justify-center">
        <div className="text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.3 }}
            className={cn(
              "text-5xl font-bold tabular-nums",
              status === "healthy" && "text-emerald-600",
              status === "warning" && "text-amber-600",
              status === "critical" && "text-rose-600"
            )}
          >
            {data.retentionRate}%
          </motion.div>
          <p className="text-sm text-muted-foreground mt-1">
            retention rate
          </p>
        </div>
      </div>
    </GlassKPICard>
  )
}

// Mock Data Card (for Subject Variance and Grade Profitability)
interface MockDataCardProps {
  title: string
  subtitle?: string
  icon: React.ReactNode
  children: React.ReactNode
  delay?: number
}

export function MockDataCard({ title, subtitle, icon, children, delay = 0 }: MockDataCardProps) {
  return (
    <GlassKPICard
      title={title}
      subtitle={subtitle}
      icon={icon}
      sourceLabel="Sample Data"
      delay={delay}
    >
      <div className="relative">
        {children}
        <div className="absolute top-0 right-0">
          <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            Coming Soon
          </span>
        </div>
      </div>
    </GlassKPICard>
  )
}


