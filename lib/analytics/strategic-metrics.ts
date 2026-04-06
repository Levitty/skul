/**
 * Strategic Metrics Analytics Library
 *
 * OPTIMIZED: All calculations share a single tenant context lookup
 * and use batched queries where possible.
 */

import { createClient } from "@/lib/supabase/server"
import { getTenantContext, type TenantContext } from "@/lib/supabase/tenant-context"

// Types for strategic metrics
export interface FinancialRunwayMetric {
  months: number
  bankBalance: number
  avgMonthlyExpenses: number
  trend: "healthy" | "warning" | "critical"
  projectedEndDate: string | null
}

export interface CollectionVelocityMetric {
  currentMonthCollected: number
  previousYearSameMonth: number
  percentageChange: number
  trend: "up" | "down" | "neutral"
  sparklineData: { date: string; amount: number }[]
  projectedGap: number
}

export interface CapacityUtilizationMetric {
  enrolledStudents: number
  totalCapacity: number
  utilizationPercent: number
  status: "healthy" | "optimal" | "overcapacity"
}

export interface StaffBurnoutMetric {
  atRiskCount: number
  totalStaff: number
  highRiskEmployees: { id: string; name: string; score: number }[]
  trend: "improving" | "stable" | "declining"
}

export interface StudentRetentionMetric {
  currentTermStudents: number
  previousTermStudents: number
  retentionRate: number
  trend: "up" | "down" | "neutral"
  gradeBreakdown: { grade: string; rate: number; exitCount: number }[]
}

export interface SubjectVarianceMetric {
  highestVarianceSubject: string
  varianceScore: number
  subjectData: { subject: string; variance: number; avgScore: number }[]
  requiresIntervention: boolean
}

export interface GradeProfitabilityMetric {
  grades: {
    name: string
    revenue: number
    cost: number
    profit: number
    isAboveBreakeven: boolean
  }[]
  totalRevenue: number
  totalCost: number
}

export interface AllStrategicMetrics {
  financialRunway: FinancialRunwayMetric | null
  collectionVelocity: CollectionVelocityMetric | null
  capacityUtilization: CapacityUtilizationMetric | null
  staffBurnout: StaffBurnoutMetric | null
  studentRetention: StudentRetentionMetric | null
  subjectVariance: SubjectVarianceMetric | null
  gradeProfitability: GradeProfitabilityMetric | null
}

/**
 * Calculate Financial Runway
 * Formula: Current Bank Balance / Average Monthly Expenses
 * OPTIMIZED: accepts shared supabase client and context
 */
async function calcFinancialRunway(supabase: any, schoolId: string): Promise<FinancialRunwayMetric | null> {
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  // Run both queries in parallel
  const [{ data: bankAccounts }, { data: expenses }] = await Promise.all([
    supabase
      .from("bank_accounts")
      .select("current_balance")
      .eq("school_id", schoolId)
      .eq("is_active", true),
    supabase
      .from("expenses")
      .select("amount")
      .eq("school_id", schoolId)
      .gte("expense_date", sixMonthsAgo.toISOString().split("T")[0]),
  ])

  const totalBalance = (bankAccounts || []).reduce(
    (sum: number, acc: any) => sum + Number(acc.current_balance || 0), 0
  )
  const totalExpenses = (expenses || []).reduce(
    (sum: number, exp: any) => sum + Number(exp.amount || 0), 0
  )

  const avgMonthlyExpenses = totalExpenses / 6
  const months = avgMonthlyExpenses > 0
    ? Math.round((totalBalance / avgMonthlyExpenses) * 10) / 10
    : 0

  let trend: "healthy" | "warning" | "critical" = "healthy"
  if (months < 2) trend = "critical"
  else if (months < 4) trend = "warning"

  let projectedEndDate: string | null = null
  if (avgMonthlyExpenses > 0 && months > 0) {
    const endDate = new Date()
    endDate.setMonth(endDate.getMonth() + Math.floor(months))
    projectedEndDate = endDate.toISOString().split("T")[0]
  }

  return { months, bankBalance: totalBalance, avgMonthlyExpenses, trend, projectedEndDate }
}

/**
 * Calculate Collection Velocity
 * OPTIMIZED: single parallel batch for all 3 payment queries
 */
async function calcCollectionVelocity(supabase: any, schoolId: string): Promise<CollectionVelocityMetric | null> {
  const now = new Date()
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const lastYearStart = new Date(now.getFullYear() - 1, now.getMonth(), 1)
  const lastYearEnd = new Date(now.getFullYear() - 1, now.getMonth() + 1, 0)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  // All 3 queries in one parallel batch
  const [{ data: currentPayments }, { data: lastYearPayments }, { data: recentPayments }] = await Promise.all([
    supabase
      .from("payments")
      .select("amount")
      .eq("school_id", schoolId)
      .eq("status", "completed")
      .gte("created_at", currentMonthStart.toISOString())
      .lte("created_at", currentMonthEnd.toISOString()),
    supabase
      .from("payments")
      .select("amount")
      .eq("school_id", schoolId)
      .eq("status", "completed")
      .gte("created_at", lastYearStart.toISOString())
      .lte("created_at", lastYearEnd.toISOString()),
    supabase
      .from("payments")
      .select("amount, created_at")
      .eq("school_id", schoolId)
      .eq("status", "completed")
      .gte("created_at", thirtyDaysAgo.toISOString())
      .order("created_at", { ascending: true }),
  ])

  const currentMonthCollected = (currentPayments || []).reduce(
    (sum: number, p: any) => sum + Number(p.amount || 0), 0
  )
  const previousYearSameMonth = (lastYearPayments || []).reduce(
    (sum: number, p: any) => sum + Number(p.amount || 0), 0
  )

  let percentageChange = 0
  if (previousYearSameMonth > 0) {
    percentageChange = Math.round(
      ((currentMonthCollected - previousYearSameMonth) / previousYearSameMonth) * 100
    )
  }

  const groupedByDate: Record<string, number> = {}
  for (const payment of recentPayments || []) {
    const date = new Date(payment.created_at).toISOString().split("T")[0]
    groupedByDate[date] = (groupedByDate[date] || 0) + Number(payment.amount || 0)
  }
  const sparklineData = Object.entries(groupedByDate).map(([date, amount]) => ({ date, amount }))
  const projectedGap = previousYearSameMonth - currentMonthCollected

  return {
    currentMonthCollected,
    previousYearSameMonth,
    percentageChange,
    trend: percentageChange > 0 ? "up" : percentageChange < 0 ? "down" : "neutral",
    sparklineData,
    projectedGap: projectedGap > 0 ? projectedGap : 0,
  }
}

/**
 * Calculate Capacity Utilization
 * OPTIMIZED: both queries in parallel
 */
async function calcCapacityUtilization(supabase: any, schoolId: string): Promise<CapacityUtilizationMetric | null> {
  const [{ count: enrolledStudents }, { data: classes }] = await Promise.all([
    supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolId)
      .eq("status", "active"),
    supabase
      .from("classes")
      .select("capacity")
      .eq("school_id", schoolId),
  ])

  const totalCapacity = (classes || []).reduce(
    (sum: number, c: any) => sum + Number(c.capacity || 30), 0
  )
  const utilizationPercent = totalCapacity > 0
    ? Math.round(((enrolledStudents || 0) / totalCapacity) * 100)
    : 0

  let status: "healthy" | "optimal" | "overcapacity" = "healthy"
  if (utilizationPercent >= 100) status = "overcapacity"
  else if (utilizationPercent >= 85) status = "optimal"

  return { enrolledStudents: enrolledStudents || 0, totalCapacity, utilizationPercent, status }
}

/**
 * Calculate Staff Burnout Sentinel
 */
async function calcStaffBurnout(supabase: any, schoolId: string): Promise<StaffBurnoutMetric | null> {
  const { data: employees } = await supabase
    .from("employees")
    .select("id, first_name, last_name, burnout_risk_score")
    .eq("school_id", schoolId)
    .eq("status", "active")

  const allEmployees = employees || []
  const atRiskEmployees = allEmployees.filter(
    (e: any) => Number(e.burnout_risk_score || 0) > 70
  )
  const highRiskEmployees = atRiskEmployees
    .sort((a: any, b: any) => Number(b.burnout_risk_score) - Number(a.burnout_risk_score))
    .slice(0, 5)
    .map((e: any) => ({
      id: e.id,
      name: `${e.first_name} ${e.last_name}`,
      score: Number(e.burnout_risk_score || 0),
    }))

  return { atRiskCount: atRiskEmployees.length, totalStaff: allEmployees.length, highRiskEmployees, trend: "stable" as const }
}

/**
 * Calculate Student Retention Rate
 * OPTIMIZED: all 4 queries in parallel
 */
async function calcStudentRetention(supabase: any, schoolId: string): Promise<StudentRetentionMetric | null> {
  const [
    { data: currentYear },
    { count: currentTermStudents },
    { count: withdrawnThisTerm },
  ] = await Promise.all([
    supabase
      .from("academic_years")
      .select("id, name")
      .eq("school_id", schoolId)
      .eq("is_current", true)
      .single(),
    supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolId)
      .eq("status", "active"),
    supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolId)
      .eq("status", "withdrawn"),
  ])

  const previousTermStudents = (currentTermStudents || 0) + (withdrawnThisTerm || 0)
  const retentionRate = previousTermStudents > 0
    ? Math.round(((currentTermStudents || 0) / previousTermStudents) * 100)
    : 100

  return {
    currentTermStudents: currentTermStudents || 0,
    previousTermStudents,
    retentionRate,
    trend: retentionRate >= 95 ? "up" : retentionRate >= 90 ? "neutral" : "down",
    gradeBreakdown: [{ grade: "All Grades", rate: retentionRate, exitCount: withdrawnThisTerm || 0 }],
  }
}

// Stubs - not yet implemented
export async function calculateSubjectVariance(userId: string): Promise<SubjectVarianceMetric | null> {
  return null
}
export async function calculateGradeProfitability(userId: string): Promise<GradeProfitabilityMetric | null> {
  return null
}

// Keep individual exports for pages that call them directly
export const calculateFinancialRunway = async (userId: string) => {
  const supabase = await createClient()
  const context = await getTenantContext(userId)
  if (!context) return null
  return calcFinancialRunway(supabase, context.schoolId)
}
export const calculateCollectionVelocity = async (userId: string) => {
  const supabase = await createClient()
  const context = await getTenantContext(userId)
  if (!context) return null
  return calcCollectionVelocity(supabase, context.schoolId)
}
export const calculateCapacityUtilization = async (userId: string) => {
  const supabase = await createClient()
  const context = await getTenantContext(userId)
  if (!context) return null
  return calcCapacityUtilization(supabase, context.schoolId)
}
export const calculateStaffBurnout = async (userId: string) => {
  const supabase = await createClient()
  const context = await getTenantContext(userId)
  if (!context) return null
  return calcStaffBurnout(supabase, context.schoolId)
}
export const calculateStudentRetention = async (userId: string) => {
  const supabase = await createClient()
  const context = await getTenantContext(userId)
  if (!context) return null
  return calcStudentRetention(supabase, context.schoolId)
}

/**
 * Get all strategic metrics at once
 * OPTIMIZED: Single tenant context lookup, single supabase client,
 * all metrics calculated in parallel
 */
export async function getAllStrategicMetrics(userId: string): Promise<AllStrategicMetrics> {
  const supabase = await createClient()
  const context = await getTenantContext(userId)

  if (!context) {
    return {
      financialRunway: null,
      collectionVelocity: null,
      capacityUtilization: null,
      staffBurnout: null,
      studentRetention: null,
      subjectVariance: null,
      gradeProfitability: null,
    }
  }

  const schoolId = context.schoolId

  // All metrics in ONE parallel batch - sharing the same client & schoolId
  const [
    financialRunway,
    collectionVelocity,
    capacityUtilization,
    staffBurnout,
    studentRetention,
  ] = await Promise.all([
    calcFinancialRunway(supabase, schoolId),
    calcCollectionVelocity(supabase, schoolId),
    calcCapacityUtilization(supabase, schoolId),
    calcStaffBurnout(supabase, schoolId),
    calcStudentRetention(supabase, schoolId),
  ])

  return {
    financialRunway,
    collectionVelocity,
    capacityUtilization,
    staffBurnout,
    studentRetention,
    subjectVariance: null,
    gradeProfitability: null,
  }
}
