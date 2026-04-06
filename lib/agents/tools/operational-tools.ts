/**
 * Operational Tools for the Strategic Advisor
 * Transport, staff, admissions — real queries only.
 */

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"

// ============================================================================
// Tool: get_transport_metrics
// ============================================================================
export async function getTransportMetrics(userId: string) {
  const supabase = await createClient()
  const context = await requireTenantContext(userId)
  if (!context) return { error: "No school context" }

  const { data: vehicles } = await supabase
    .from("transport_vehicles")
    .select("id, vehicle_name, capacity, status")
    .eq("school_id", context.schoolId)

  const { data: drivers } = await supabase
    .from("transport_drivers")
    .select("id, status")
    .eq("school_id", context.schoolId)

  const { data: routes } = await supabase
    .from("transport_routes")
    .select("id, route_name")
    .eq("school_id", context.schoolId)

  const { count: assignedStudents } = await supabase
    .from("transport_assignments")
    .select("id", { count: "exact", head: true })
    .eq("school_id", context.schoolId)

  const vehicleList = (vehicles || []) as any[]
  const totalCapacity = vehicleList.reduce(
    (sum, v) => sum + Number(v.capacity || 0),
    0
  )
  const activeVehicles = vehicleList.filter((v) => v.status === "active").length

  return {
    vehicles: {
      total: vehicleList.length,
      active: activeVehicles,
      total_capacity: totalCapacity,
    },
    drivers: {
      total: (drivers || []).length,
      active: ((drivers || []) as any[]).filter((d) => d.status === "active").length,
    },
    routes: {
      total: (routes || []).length,
    },
    students_assigned: assignedStudents || 0,
    available_seats: Math.max(0, totalCapacity - (assignedStudents || 0)),
  }
}

// ============================================================================
// Tool: get_admissions_pipeline
// ============================================================================
export async function getAdmissionsPipeline(userId: string) {
  const supabase = await createClient()
  const context = await requireTenantContext(userId)
  if (!context) return { error: "No school context" }

  const { data: applications } = await supabase
    .from("applications")
    .select("id, status, created_at, updated_at")
    .eq("school_id", context.schoolId)

  if (!applications || applications.length === 0) {
    return {
      total: 0,
      by_status: {},
      conversion_rate_percent: 0,
      stuck_count: 0,
    }
  }

  const byStatus: Record<string, number> = {}
  let stuckCount = 0
  const fortyEightHoursAgo = new Date()
  fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48)

  for (const app of applications as any[]) {
    byStatus[app.status] = (byStatus[app.status] || 0) + 1

    if (
      ["pending", "reviewed"].includes(app.status) &&
      new Date(app.updated_at) < fortyEightHoursAgo
    ) {
      stuckCount++
    }
  }

  const accepted = byStatus["accepted"] || 0
  const total = applications.length
  const conversionRate =
    total > 0 ? Math.round((accepted / total) * 1000) / 10 : 0

  // Recent activity (last 7 days)
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const recentApplications = (applications as any[]).filter(
    (a) => new Date(a.created_at) > sevenDaysAgo
  ).length

  return {
    total: total,
    by_status: byStatus,
    conversion_rate_percent: conversionRate,
    stuck_applications: stuckCount,
    new_last_7_days: recentApplications,
  }
}

// ============================================================================
// Tool: get_staff_overview
// ============================================================================
export async function getStaffOverview(userId: string) {
  const supabase = await createClient()
  const context = await requireTenantContext(userId)
  if (!context) return { error: "No school context" }

  const { data: employees } = await supabase
    .from("employees")
    .select("id, role, department, status, salary")
    .eq("school_id", context.schoolId)

  if (!employees || employees.length === 0) {
    return { error: "No employee records found" }
  }

  const allEmployees = employees as any[]
  const active = allEmployees.filter((e) => e.status === "active")

  // By role
  const byRole: Record<string, number> = {}
  for (const e of active) {
    byRole[e.role] = (byRole[e.role] || 0) + 1
  }

  // Total payroll
  const monthlyPayroll = active.reduce(
    (sum, e) => sum + Number(e.salary || 0),
    0
  )

  // Teacher-student ratio
  const teacherCount = active.filter((e) => e.role === "teacher").length
  const { count: studentCount } = await supabase
    .from("students")
    .select("id", { count: "exact", head: true })
    .eq("school_id", context.schoolId)
    .eq("status", "active")

  const teacherStudentRatio =
    teacherCount > 0
      ? `1:${Math.round((studentCount || 0) / teacherCount)}`
      : "N/A"

  return {
    total_staff: allEmployees.length,
    active_staff: active.length,
    by_role: byRole,
    monthly_payroll_kes: monthlyPayroll,
    annual_payroll_kes: monthlyPayroll * 12,
    teacher_count: teacherCount,
    teacher_student_ratio: teacherStudentRatio,
    total_students: studentCount || 0,
  }
}
