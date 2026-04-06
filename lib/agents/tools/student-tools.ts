/**
 * Student & Enrollment Tools for the Strategic Advisor
 * Every tool runs a real database query — no AI math, no guessing.
 */

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"

// ============================================================================
// Tool: get_student_count
// ============================================================================
export async function getStudentCount(
  userId: string,
  params: { status?: string; class_id?: string }
) {
  const supabase = await createClient()
  const context = await requireTenantContext(userId)
  if (!context) return { error: "No school context" }

  let query = supabase
    .from("students")
    .select("id, status", { count: "exact" })
    .eq("school_id", context.schoolId)

  if (params.status) {
    query = query.eq("status", params.status)
  }

  const { count, data } = await query

  // Get breakdown by status
  const { data: allStudents } = await supabase
    .from("students")
    .select("status")
    .eq("school_id", context.schoolId)

  const statusBreakdown: Record<string, number> = {}
  for (const s of (allStudents || []) as any[]) {
    statusBreakdown[s.status] = (statusBreakdown[s.status] || 0) + 1
  }

  // Get by class if requested
  let classCounts: any[] = []
  if (!params.class_id) {
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("class_id, classes(name), students!inner(status)")
      .eq("students.school_id", context.schoolId)
      .eq("students.status", params.status || "active")

    const classMap: Record<string, { name: string; count: number }> = {}
    for (const e of (enrollments || []) as any[]) {
      const classId = e.class_id
      if (!classMap[classId]) {
        classMap[classId] = { name: e.classes?.name || "Unknown", count: 0 }
      }
      classMap[classId].count++
    }
    classCounts = Object.entries(classMap).map(([id, data]) => ({
      class_id: id,
      class_name: data.name,
      student_count: data.count,
    }))
  }

  return {
    total: count || 0,
    status_filter: params.status || "all",
    status_breakdown: statusBreakdown,
    by_class: classCounts.length > 0 ? classCounts : undefined,
  }
}

// ============================================================================
// Tool: get_enrollment_trend
// ============================================================================
export async function getEnrollmentTrend(
  userId: string,
  params: { periods?: number }
) {
  const supabase = await createClient()
  const context = await requireTenantContext(userId)
  if (!context) return { error: "No school context" }

  const { data: academicYears } = await supabase
    .from("academic_years")
    .select("id, name, start_date, is_current")
    .eq("school_id", context.schoolId)
    .order("start_date", { ascending: false })
    .limit(params.periods || 4)

  if (!academicYears || academicYears.length === 0) {
    return { error: "No academic years found" }
  }

  const trend = await Promise.all(
    (academicYears as any[]).map(async (ay) => {
      const { count } = await supabase
        .from("enrollments")
        .select("id", { count: "exact", head: true })
        .eq("academic_year_id", ay.id)

      return {
        academic_year: ay.name,
        is_current: ay.is_current,
        enrolled_students: count || 0,
      }
    })
  )

  // Calculate growth
  const sorted = trend.sort(
    (a, b) =>
      (academicYears as any[]).findIndex((ay: any) => ay.name === b.academic_year) -
      (academicYears as any[]).findIndex((ay: any) => ay.name === a.academic_year)
  )

  let growthPercent: number | null = null
  if (sorted.length >= 2 && sorted[0].enrolled_students > 0) {
    growthPercent = Math.round(
      ((sorted[sorted.length - 1].enrolled_students -
        sorted[sorted.length - 2].enrolled_students) /
        (sorted[sorted.length - 2].enrolled_students || 1)) *
        100
    )
  }

  return {
    trend: sorted.reverse(),
    year_over_year_growth_percent: growthPercent,
  }
}

// ============================================================================
// Tool: get_attendance_rate
// ============================================================================
export async function getAttendanceRate(
  userId: string,
  params: { class_id?: string; days?: number }
) {
  const supabase = await createClient()
  const context = await requireTenantContext(userId)
  if (!context) return { error: "No school context" }

  const days = params.days || 30
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  let query = supabase
    .from("attendance_records")
    .select("student_id, date, status")
    .eq("school_id", context.schoolId)
    .gte("date", startDate.toISOString().split("T")[0])

  if (params.class_id) {
    query = query.eq("class_id", params.class_id)
  }

  const { data: records } = await query

  if (!records || records.length === 0) {
    return {
      error: "No attendance records found for this period",
      period_days: days,
    }
  }

  const total = records.length
  const present = (records as any[]).filter(
    (r) => r.status === "present"
  ).length
  const absent = (records as any[]).filter((r) => r.status === "absent").length
  const late = (records as any[]).filter((r) => r.status === "late").length
  const excused = (records as any[]).filter(
    (r) => r.status === "excused"
  ).length

  const attendanceRate =
    total > 0 ? Math.round(((present + late) / total) * 1000) / 10 : 0

  return {
    attendance_rate_percent: attendanceRate,
    total_records: total,
    present: present,
    absent: absent,
    late: late,
    excused: excused,
    period_days: days,
  }
}

// ============================================================================
// Tool: get_capacity_utilization
// ============================================================================
export async function getCapacityUtilization(userId: string) {
  const supabase = await createClient()
  const context = await requireTenantContext(userId)
  if (!context) return { error: "No school context" }

  const { count: enrolledStudents } = await supabase
    .from("students")
    .select("id", { count: "exact", head: true })
    .eq("school_id", context.schoolId)
    .eq("status", "active")

  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, capacity")
    .eq("school_id", context.schoolId)

  if (!classes || classes.length === 0) {
    return { error: "No classes configured" }
  }

  // Get enrollment per class
  const classUtilization = await Promise.all(
    (classes as any[]).map(async (cls) => {
      const { count } = await supabase
        .from("enrollments")
        .select("id", { count: "exact", head: true })
        .eq("class_id", cls.id)
        .eq("status", "active")

      const capacity = Number(cls.capacity || 30)
      const enrolled = count || 0
      const utilization =
        capacity > 0 ? Math.round((enrolled / capacity) * 100) : 0

      return {
        class_name: cls.name,
        capacity: capacity,
        enrolled: enrolled,
        available_seats: Math.max(0, capacity - enrolled),
        utilization_percent: utilization,
      }
    })
  )

  const totalCapacity = classUtilization.reduce(
    (sum, c) => sum + c.capacity,
    0
  )
  const totalEnrolled = enrolledStudents || 0
  const overallUtilization =
    totalCapacity > 0 ? Math.round((totalEnrolled / totalCapacity) * 100) : 0

  let status: "low" | "healthy" | "optimal" | "overcapacity" = "healthy"
  if (overallUtilization >= 100) status = "overcapacity"
  else if (overallUtilization >= 85) status = "optimal"
  else if (overallUtilization < 60) status = "low"

  return {
    total_enrolled: totalEnrolled,
    total_capacity: totalCapacity,
    total_available_seats: Math.max(0, totalCapacity - totalEnrolled),
    overall_utilization_percent: overallUtilization,
    status,
    by_class: classUtilization.sort(
      (a, b) => b.utilization_percent - a.utilization_percent
    ),
  }
}
