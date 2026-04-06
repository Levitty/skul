"use server"

import { createClient } from "@/lib/supabase/server"
import { unstable_cache } from "next/cache"
import {
  calculateFinancialRunway,
  calculateCollectionVelocity,
  calculateCapacityUtilization,
  calculateStaffBurnout,
  calculateStudentRetention,
  calculateSubjectVariance,
  calculateGradeProfitability,
  getAllStrategicMetrics,
  type AllStrategicMetrics,
} from "@/lib/analytics/strategic-metrics"

/**
 * Generate insight text from metrics (pure function, no DB calls)
 */
function generateInsight(metrics: AllStrategicMetrics) {
  let insight = ""
  let priority: "info" | "warning" | "critical" = "info"

  if (metrics.financialRunway && metrics.financialRunway.trend === "critical") {
    insight = `Critical: Your financial runway is ${metrics.financialRunway.months} months. Consider accelerating fee collection or reviewing expenses.`
    priority = "critical"
  } else if (metrics.collectionVelocity && metrics.collectionVelocity.percentageChange < -10) {
    insight = `Your collection velocity is ${Math.abs(metrics.collectionVelocity.percentageChange)}% lower than the same period last year. Consider a targeted follow-up campaign.`
    priority = "warning"
  } else if (metrics.staffBurnout && metrics.staffBurnout.atRiskCount > 0) {
    insight = `${metrics.staffBurnout.atRiskCount} staff members are showing signs of burnout. Consider wellness initiatives or workload redistribution.`
    priority = "warning"
  } else if (metrics.capacityUtilization && metrics.capacityUtilization.status === "overcapacity") {
    insight = `Your school is operating at ${metrics.capacityUtilization.utilizationPercent}% capacity. Consider expanding facilities or managing enrollment.`
    priority = "warning"
  } else if (metrics.studentRetention && metrics.studentRetention.retentionRate < 90) {
    insight = `Student retention is at ${metrics.studentRetention.retentionRate}%. Investigate reasons for student exits and implement retention strategies.`
    priority = "warning"
  } else if (metrics.collectionVelocity && metrics.collectionVelocity.percentageChange > 10) {
    insight = `Excellent! Collection velocity is up ${metrics.collectionVelocity.percentageChange}% compared to last year. Maintain current strategies.`
    priority = "info"
  } else {
    insight = `School operations are running smoothly. All key metrics are within healthy ranges.`
    priority = "info"
  }

  return { insight, priority, generatedAt: new Date().toISOString() }
}

/**
 * Get All KPIs + Strategic Insight in ONE call
 * OPTIMIZED: Replaces the old getAllKPIs() + getStrategicInsight() which
 * ran getAllStrategicMetrics() TWICE. Now runs it once.
 */
export async function getDashboardData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated", kpis: null, insight: null, quickStats: null }
  }

  try {
    // Single call for all strategic metrics
    const metrics = await getAllStrategicMetrics(user.id)

    // Generate insight from already-loaded metrics (no extra DB calls)
    const insight = generateInsight(metrics)

    // Quick stats — fetch school context once
    const { data: schoolContext } = await supabase
      .from("user_schools")
      .select("school_id")
      .eq("user_id", user.id)
      .single()

    let quickStats = {
      totalStudents: 0,
      totalTeachers: 0,
      totalClasses: 0,
      pendingAdmissions: 0,
    }

    if (schoolContext) {
      const schoolId = (schoolContext as any).school_id
      const [
        { count: totalStudents },
        { count: totalTeachers },
        { count: totalClasses },
        { count: pendingAdmissions },
      ] = await Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("status", "active"),
        supabase.from("employees").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("role", "teacher").eq("status", "active"),
        supabase.from("classes").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
        supabase.from("applications").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ])

      quickStats = {
        totalStudents: totalStudents || 0,
        totalTeachers: totalTeachers || 0,
        totalClasses: totalClasses || 0,
        pendingAdmissions: pendingAdmissions || 0,
      }
    }

    return {
      error: null,
      kpis: metrics,
      insight: { data: { ...insight, basedOnMetrics: Object.keys(metrics).filter(k => metrics[k as keyof typeof metrics] !== null) } },
      quickStats: { data: quickStats },
    }
  } catch (error) {
    console.error("Error fetching dashboard data:", error)
    return { error: "Failed to fetch dashboard data", kpis: null, insight: null, quickStats: null }
  }
}

// ── Keep legacy exports for any pages that still use them individually ──

export async function getFinancialRunway() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated", data: null }
  try {
    const data = await calculateFinancialRunway(user.id)
    return { data, error: null }
  } catch (error) {
    return { error: "Failed to calculate financial runway", data: null }
  }
}

export async function getAllKPIs() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated", data: null }
  try {
    const data = await getAllStrategicMetrics(user.id)
    return { data, error: null, notAvailableFields: ["subjectVariance", "gradeProfitability"] }
  } catch (error) {
    return { error: "Failed to fetch KPIs", data: null }
  }
}

export async function getStrategicInsight() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated", data: null }
  try {
    const metrics = await getAllStrategicMetrics(user.id)
    const insight = generateInsight(metrics)
    return {
      data: { ...insight, basedOnMetrics: Object.keys(metrics).filter(k => metrics[k as keyof typeof metrics] !== null) },
      error: null,
    }
  } catch (error) {
    return { error: "Failed to generate insight", data: null }
  }
}

export async function getQuickStats() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated", data: null }
  try {
    const { data: schoolContext } = await supabase.from("user_schools").select("school_id").eq("user_id", user.id).single()
    if (!schoolContext) return { error: "No school context", data: null }
    const schoolId = (schoolContext as any).school_id
    const [
      { count: totalStudents },
      { count: totalTeachers },
      { count: totalClasses },
      { count: pendingAdmissions },
    ] = await Promise.all([
      supabase.from("students").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("status", "active"),
      supabase.from("employees").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("role", "teacher").eq("status", "active"),
      supabase.from("classes").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
      supabase.from("applications").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ])
    return {
      data: {
        totalStudents: totalStudents || 0,
        totalTeachers: totalTeachers || 0,
        totalClasses: totalClasses || 0,
        pendingAdmissions: pendingAdmissions || 0,
      },
      error: null,
    }
  } catch (error) {
    return { error: "Failed to fetch stats", data: null }
  }
}
