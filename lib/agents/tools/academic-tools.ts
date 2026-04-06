/**
 * Academic Tools for the Strategic Advisor
 * Report card summaries and teacher performance metrics.
 */

import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"

// ============================================================================
// Report Card Summary — class-level academic performance overview
// ============================================================================

export async function getReportCardSummary(
  params: { class_name?: string; term_name?: string },
  userId: string
) {
  const supabase = createServiceRoleClient()
  const context = await requireTenantContext(userId)
  if (!context) return { error: "No school context" }

  // Build query
  let query = (supabase as any)
    .from("report_cards")
    .select(`
      overall_percentage, overall_grade, class_rank, class_size,
      attendance_percentage, status,
      students(first_name, last_name),
      classes(name),
      terms(name),
      report_card_subjects(subject_name, percentage, grade)
    `)
    .eq("school_id", context.schoolId)

  // Filter by class name if provided
  if (params.class_name) {
    const { data: matchingClass } = await supabase
      .from("classes")
      .select("id")
      .eq("school_id", context.schoolId)
      .ilike("name", `%${params.class_name}%`)
      .limit(1)
      .single()

    if (matchingClass) {
      query = query.eq("class_id", (matchingClass as any).id)
    }
  }

  // Filter by term name if provided
  if (params.term_name) {
    const { data: matchingTerm } = await (supabase as any)
      .from("terms")
      .select("id")
      .eq("school_id", context.schoolId)
      .ilike("name", `%${params.term_name}%`)
      .limit(1)
      .single()

    if (matchingTerm) {
      query = query.eq("term_id", (matchingTerm as any).id)
    }
  }

  const { data: reportCards, error } = await query.order("class_rank", { ascending: true })

  if (error || !reportCards || reportCards.length === 0) {
    return { error: "No report cards found for the specified class/term", data: null }
  }

  // Aggregate stats
  const percentages = reportCards.map((rc: any) => Number(rc.overall_percentage || 0))
  const avgPercentage = Math.round(percentages.reduce((a: number, b: number) => a + b, 0) / percentages.length)
  const highestPercentage = Math.max(...percentages)
  const lowestPercentage = Math.min(...percentages)

  // Grade distribution
  const gradeDist: Record<string, number> = {}
  for (const rc of reportCards) {
    const grade = (rc as any).overall_grade || "?"
    gradeDist[grade] = (gradeDist[grade] || 0) + 1
  }

  // Subject averages
  const subjectTotals: Record<string, { sum: number; count: number }> = {}
  for (const rc of reportCards) {
    for (const subj of (rc as any).report_card_subjects || []) {
      const name = subj.subject_name
      if (!subjectTotals[name]) subjectTotals[name] = { sum: 0, count: 0 }
      subjectTotals[name].sum += Number(subj.percentage || 0)
      subjectTotals[name].count += 1
    }
  }

  const subjectAverages = Object.entries(subjectTotals)
    .map(([name, data]) => ({
      subject: name,
      avgPercentage: Math.round(data.sum / data.count),
    }))
    .sort((a, b) => b.avgPercentage - a.avgPercentage)

  // Top 3 and bottom 3 students
  const top3 = reportCards.slice(0, 3).map((rc: any) => ({
    name: `${rc.students?.first_name} ${rc.students?.last_name}`,
    percentage: rc.overall_percentage,
    grade: rc.overall_grade,
  }))

  const bottom3 = reportCards.slice(-3).reverse().map((rc: any) => ({
    name: `${rc.students?.first_name} ${rc.students?.last_name}`,
    percentage: rc.overall_percentage,
    grade: rc.overall_grade,
  }))

  const className = (reportCards[0] as any).classes?.name || params.class_name || "Unknown"
  const termName = (reportCards[0] as any).terms?.name || params.term_name || "Unknown"

  return {
    className,
    termName,
    totalStudents: reportCards.length,
    classAverage: avgPercentage,
    highestScore: highestPercentage,
    lowestScore: lowestPercentage,
    gradeDistribution: gradeDist,
    subjectAverages,
    top3Students: top3,
    bottom3Students: bottom3,
  }
}

// ============================================================================
// Teacher Performance Metrics — for advisor queries
// ============================================================================

export async function getTeacherPerformanceMetrics(
  params: { teacher_name?: string },
  userId: string
) {
  const supabase = createServiceRoleClient()
  const context = await requireTenantContext(userId)
  if (!context) return { error: "No school context" }

  // Get teachers — optionally filter by name
  let teacherQuery: any = (supabase as any)
    .from("employees")
    .select("id, first_name, last_name, position, department")
    .eq("school_id", context.schoolId)
    .eq("status", "active")

  if (params.teacher_name) {
    teacherQuery = teacherQuery.or(
      `first_name.ilike.%${params.teacher_name}%,last_name.ilike.%${params.teacher_name}%`
    )
  } else {
    // Only get teachers if no name filter
    teacherQuery = teacherQuery.in("position", ["teacher", "Teacher", "head_teacher", "Head Teacher"])
  }

  const { data: teachers } = await teacherQuery

  if (!teachers || teachers.length === 0) {
    return { error: "No teachers found", data: null }
  }

  const results = []

  for (const teacher of teachers) {
    const tid = (teacher as any).id
    const name = `${(teacher as any).first_name} ${(teacher as any).last_name}`

    // Get classes taught
    const { data: assignments } = await (supabase as any)
      .from("timetable_entries")
      .select("class_id, subject")
      .eq("teacher_id", tid)

    const classCount = new Set((assignments || []).map((a: any) => a.class_id)).size

    // Get grading activity
    const { count: totalGradesEntered } = await (supabase as any)
      .from("exam_results")
      .select("id", { count: "exact", head: true })
      .eq("entered_by", tid)

    // Get last grade entry
    const { data: lastGrade } = await (supabase as any)
      .from("exam_results")
      .select("created_at")
      .eq("entered_by", tid)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    const daysSinceLastGrade = lastGrade
      ? Math.floor((Date.now() - new Date((lastGrade as any).created_at).getTime()) / (1000 * 60 * 60 * 24))
      : null

    // Get burnout score from staff_metrics
    const { data: metrics } = await (supabase as any)
      .from("staff_metrics")
      .select("burnout_risk_score")
      .eq("employee_id", tid)
      .order("metric_date", { ascending: false })
      .limit(1)
      .single()

    results.push({
      name,
      position: (teacher as any).position,
      department: (teacher as any).department,
      classCount,
      totalGradesEntered: totalGradesEntered || 0,
      daysSinceLastGrade,
      burnoutRiskScore: (metrics as any)?.burnout_risk_score || null,
    })
  }

  // Sort by grades entered (most active first)
  results.sort((a, b) => b.totalGradesEntered - a.totalGradesEntered)

  return {
    teacherCount: results.length,
    teachers: results,
  }
}
