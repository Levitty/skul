"use client"

import { ArrowRight, ArrowUpRight, AlertCircle, TrendingUp, TrendingDown } from "lucide-react"
import Link from "next/link"

interface DashboardStats {
  totalStudents: number
  totalTeachers: number
  totalClasses: number
  pendingAdmissions: number
  attendanceRate: number | null
  totalMarkedToday: number
  collectionRate: number
  runwayMonths: number
  totalRevenue: number
  totalExpenses: number
  outstandingFees: number
  overdueInvoices: number
}

interface Alert {
  text: string
  severity: "critical" | "warning" | "info"
  href?: string
}

interface SubDashboard {
  label: string
  href: string
  stat: string
}

interface StrategicDashboardClientProps {
  userName: string
  schoolName: string
  branchName?: string | null
  insight?: {
    text: string
    priority: "info" | "warning" | "critical"
  }
  stats: DashboardStats
  alerts: Alert[]
  recentActivity: Array<{
    id: string
    type: "payment" | "enrollment"
    title: string
    description: string
    time: string
  }>
  subDashboards: SubDashboard[]
}

export function StrategicDashboardClient({
  userName,
  schoolName,
  branchName,
  insight,
  stats,
  alerts,
  recentActivity,
  subDashboards,
}: StrategicDashboardClientProps) {
  const today = new Date()
  const dateStr = today.toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[22px] font-bold text-neutral-900 tracking-tight">
          Good {getGreeting()}, {userName}
        </h1>
        <p className="text-sm text-neutral-400 mt-1">
          {schoolName}
          {branchName && <span className="text-emerald-600 font-medium"> &middot; {branchName}</span>}
          {" "}&middot; {dateStr}
        </p>
      </div>

      {/* Insight Banner */}
      {insight && (
        <div
          className={`rounded-xl px-4 py-3 text-sm mb-6 flex items-center gap-3 ${
            insight.priority === "critical"
              ? "bg-rose-50 text-rose-700 border border-rose-100"
              : insight.priority === "warning"
              ? "bg-amber-50 text-amber-700 border border-amber-100"
              : "bg-emerald-50 text-emerald-700 border border-emerald-100"
          }`}
        >
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
            insight.priority === "critical" ? "bg-rose-500" :
            insight.priority === "warning" ? "bg-amber-500" : "bg-emerald-500"
          }`} />
          {insight.text}
        </div>
      )}

      {/* Top Metrics: 4 headline numbers — Finflow inspired */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard
          label="STUDENTS"
          value={stats.totalStudents.toLocaleString()}
          sub={`${stats.totalTeachers} teachers, ${stats.totalClasses} classes`}
          dotColor="bg-blue-500"
        />
        <StatCard
          label="FEE COLLECTION"
          value={`KES ${stats.totalRevenue.toLocaleString()}`}
          sub={stats.outstandingFees > 0
            ? `KES ${stats.outstandingFees.toLocaleString()} outstanding`
            : "No outstanding fees"
          }
          subColor={stats.outstandingFees > 0 ? "text-amber-600" : "text-emerald-600"}
          dotColor="bg-emerald-500"
          chipValue={stats.outstandingFees > 0 ? undefined : undefined}
        />
        <StatCard
          label="ATTENDANCE TODAY"
          value={stats.attendanceRate !== null ? `${stats.attendanceRate}%` : "--"}
          sub={stats.totalMarkedToday > 0
            ? `${stats.totalMarkedToday} students marked`
            : "Not yet recorded"
          }
          dotColor="bg-indigo-500"
        />
        <StatCard
          label="FINANCIAL RUNWAY"
          value={`${stats.runwayMonths.toFixed(1)} mo`}
          sub={stats.runwayMonths >= 3 ? "Healthy" : stats.runwayMonths >= 1 ? "Low" : "Critical"}
          subColor={stats.runwayMonths >= 3 ? "text-emerald-600" : stats.runwayMonths >= 1 ? "text-amber-600" : "text-rose-600"}
          dotColor={stats.runwayMonths >= 3 ? "bg-emerald-500" : stats.runwayMonths >= 1 ? "bg-amber-500" : "bg-rose-500"}
        />
      </div>

      {/* Needs Attention */}
      {alerts.length > 0 && (
        <div className="rounded-xl border border-neutral-200/60 bg-white mb-6 overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div className="px-5 py-3 border-b border-neutral-100">
            <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider">Needs Attention</h3>
          </div>
          <div className="divide-y divide-neutral-100">
            {alerts.map((alert, i) => (
              <AlertRow key={i} alert={alert} />
            ))}
          </div>
        </div>
      )}

      {/* Middle row: Revenue vs Expenses + Quick Nav */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3 mb-6">
        {/* Revenue vs Expenses — Finflow-style with colored chips */}
        <div className="rounded-xl border border-neutral-200/60 bg-white p-5 lg:col-span-1" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-5">Money In vs Out</h3>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="text-sm text-neutral-500">Income</span>
                </div>
                <span className="stat-chip-positive text-xs">+KES {stats.totalRevenue.toLocaleString()}</span>
              </div>
              <div className="h-2.5 rounded-full bg-emerald-50 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-700 ease-out"
                  style={{ width: `${Math.min(100, stats.totalRevenue > 0 ? 100 : 0)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                  <span className="text-sm text-neutral-500">Expenses</span>
                </div>
                <span className="stat-chip-negative text-xs">-KES {stats.totalExpenses.toLocaleString()}</span>
              </div>
              <div className="h-2.5 rounded-full bg-rose-50 overflow-hidden">
                <div
                  className="h-full rounded-full bg-rose-400 transition-all duration-700 ease-out"
                  style={{ width: `${stats.totalRevenue > 0 ? Math.min(100, (stats.totalExpenses / stats.totalRevenue) * 100) : 0}%` }}
                />
              </div>
            </div>
            {stats.totalRevenue > 0 && (
              <div className="pt-3 border-t border-neutral-100">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-neutral-600">Net</span>
                  <span className={`text-base font-bold tabular-nums ${stats.totalRevenue - stats.totalExpenses >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    KES {(stats.totalRevenue - stats.totalExpenses).toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick navigation to sub-dashboards */}
        <div className="rounded-xl border border-neutral-200/60 bg-white p-5 lg:col-span-2" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-4">Go To</h3>
          <div className="grid grid-cols-2 gap-3">
            {subDashboards.map((dash) => (
              <Link
                key={dash.href}
                href={dash.href}
                className="group flex items-center justify-between p-3.5 rounded-xl border border-neutral-100 hover:border-emerald-200 hover:bg-emerald-50/30 transition-all duration-200"
              >
                <div>
                  <p className="text-sm font-medium text-neutral-900">{dash.label}</p>
                  <p className="text-xs text-neutral-400 mt-0.5">{dash.stat}</p>
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-neutral-300 group-hover:text-emerald-500 transition-colors" />
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Row: Recent Activity */}
      <div className="rounded-xl border border-neutral-200/60 bg-white p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-4">Recent Activity</h3>
        {recentActivity.length > 0 ? (
          <div className="space-y-3">
            {recentActivity.map((activity) => (
              <div key={activity.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-neutral-50/50 transition-colors">
                <div className={`mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                  activity.type === "payment" ? "bg-emerald-500" : "bg-blue-500"
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-neutral-700">{activity.title}</p>
                  <p className="text-xs text-neutral-400">{activity.description}</p>
                </div>
                <span className="text-xs text-neutral-400 whitespace-nowrap">{activity.time}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-400 text-center py-6">No recent activity</p>
        )}
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  subColor,
  dotColor,
  chipValue,
}: {
  label: string
  value: string
  sub?: string
  subColor?: string
  dotColor?: string
  chipValue?: string
}) {
  return (
    <div className="rounded-xl border border-neutral-200/60 bg-white p-5 hover:border-neutral-300/80 transition-all duration-200" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div className="flex items-center gap-2 mb-3">
        {dotColor && <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />}
        <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-[28px] font-bold text-neutral-900 tabular-nums tracking-tight leading-none">{value}</p>
      {sub && (
        <p className={`text-xs mt-2 ${subColor ?? "text-neutral-400"}`}>{sub}</p>
      )}
    </div>
  )
}

function AlertRow({ alert }: { alert: Alert }) {
  const content = (
    <div className="flex items-center gap-3 px-5 py-3 hover:bg-neutral-50 transition-colors">
      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
        alert.severity === "critical" ? "bg-red-500" :
        alert.severity === "warning" ? "bg-amber-500" : "bg-blue-400"
      }`} />
      <span className="text-sm text-neutral-700 flex-1">{alert.text}</span>
      {alert.href && (
        <ArrowRight className="w-3.5 h-3.5 text-neutral-300" />
      )}
    </div>
  )

  if (alert.href) {
    return <Link href={alert.href}>{content}</Link>
  }
  return content
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return "morning"
  if (hour < 17) return "afternoon"
  return "evening"
}
