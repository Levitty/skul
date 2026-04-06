/**
 * Staff Burnout Sentinel
 * Monitors teacher engagement metrics to flag at-risk teachers
 */

export interface StaffMetrics {
  employeeId: string
  metricDate: Date
  lastGradeEntry: Date | null
  daysSinceLastGrade: number
  leaveRequestsCount: number
  loginFrequency: number
  attendanceDelayHours: number
  burnoutRiskScore: number // 0-100
}

export interface BurnoutRiskFactors {
  daysSinceLastGrade: number
  leaveRequestsCount: number
  loginFrequency: number
  attendanceDelayHours: number
}

/**
 * Calculate burnout risk score based on various factors
 */
export function calculateBurnoutRiskScore(
  factors: BurnoutRiskFactors
): number {
  let score = 0

  // Grading delays (0-30 points)
  if (factors.daysSinceLastGrade > 7) {
    score += Math.min(30, (factors.daysSinceLastGrade - 7) * 3)
  }

  // Leave requests (0-25 points)
  if (factors.leaveRequestsCount > 2) {
    score += Math.min(25, (factors.leaveRequestsCount - 2) * 5)
  }

  // Login frequency (0-25 points)
  if (factors.loginFrequency < 3) {
    score += Math.min(25, (3 - factors.loginFrequency) * 5)
  }

  // Attendance delays (0-20 points)
  if (factors.attendanceDelayHours > 24) {
    score += Math.min(20, (factors.attendanceDelayHours - 24) / 12)
  }

  return Math.min(100, Math.round(score))
}

/**
 * Get staff metrics for an employee
 */
export async function getStaffMetrics(
  supabase: any,
  employeeId: string,
  schoolId: string
): Promise<StaffMetrics | null> {
  // Get latest metrics record
  const { data: metrics } = await supabase
    .from("staff_metrics")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("school_id", schoolId)
    .order("metric_date", { ascending: false })
    .limit(1)
    .single()

  if (!metrics) {
    return null
  }

  return {
    employeeId: metrics.employee_id,
    metricDate: new Date(metrics.metric_date),
    lastGradeEntry: metrics.last_grade_entry
      ? new Date(metrics.last_grade_entry)
      : null,
    daysSinceLastGrade: metrics.days_since_last_grade || 0,
    leaveRequestsCount: metrics.leave_requests_count || 0,
    loginFrequency: metrics.login_frequency || 0,
    attendanceDelayHours: metrics.attendance_delay_hours || 0,
    burnoutRiskScore: metrics.burnout_risk_score || 0,
  }
}

/**
 * Update staff metrics (should be called periodically)
 */
export async function updateStaffMetrics(
  supabase: any,
  employeeId: string,
  schoolId: string
): Promise<void> {
  // Get last grade entry
  const { data: lastGrade } = await supabase
    .from("exam_results")
    .select("created_at")
    .eq("entered_by", employeeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  const daysSinceLastGrade = lastGrade
    ? Math.floor(
        (Date.now() - new Date(lastGrade.created_at).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : 999

  // Get leave requests count (last 30 days) from student_leaves reviewed by this teacher
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { count: leaveRequestsCount } = await supabase
    .from("student_leaves")
    .select("id", { count: "exact", head: true })
    .eq("reviewed_by", employeeId)
    .gte("created_at", thirtyDaysAgo.toISOString())

  // Get attendance recording frequency (last 7 days)
  // Count distinct days where this teacher recorded attendance
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const { data: recentAttendance } = await supabase
    .from("attendance_records")
    .select("date")
    .eq("recorded_by", employeeId)
    .eq("school_id", schoolId)
    .gte("date", sevenDaysAgo.toISOString().split("T")[0])

  const uniqueAttendanceDays = new Set(
    (recentAttendance || []).map((r: any) => r.date)
  )
  const loginFrequency = uniqueAttendanceDays.size // proxy: active days = recording days

  // Get homework grading delay (avg hours between due_date and graded_at)
  const { data: gradedHomework } = await supabase
    .from("homework")
    .select("due_date, homework_submissions(graded_at)")
    .eq("teacher_id", employeeId)
    .eq("school_id", schoolId)
    .eq("is_graded", true)
    .gte("due_date", thirtyDaysAgo.toISOString().split("T")[0])

  let totalDelayHours = 0
  let delayCount = 0
  for (const hw of gradedHomework || []) {
    const dueDate = new Date((hw as any).due_date)
    for (const sub of (hw as any).homework_submissions || []) {
      if (sub.graded_at) {
        const delay = (new Date(sub.graded_at).getTime() - dueDate.getTime()) / (1000 * 60 * 60)
        if (delay > 0) {
          totalDelayHours += delay
          delayCount++
        }
      }
    }
  }
  const attendanceDelayHours = delayCount > 0 ? totalDelayHours / delayCount : 0

  const factors: BurnoutRiskFactors = {
    daysSinceLastGrade,
    leaveRequestsCount: leaveRequestsCount || 0,
    loginFrequency,
    attendanceDelayHours: Math.round(attendanceDelayHours),
  }

  const burnoutRiskScore = calculateBurnoutRiskScore(factors)

  // Upsert metrics
  await supabase.from("staff_metrics").upsert({
    employee_id: employeeId,
    school_id: schoolId,
    metric_date: new Date().toISOString().split("T")[0],
    last_grade_entry: lastGrade?.created_at || null,
    days_since_last_grade: daysSinceLastGrade,
    leave_requests_count: leaveRequestsCount || 0,
    login_frequency: loginFrequency,
    attendance_delay_hours: Math.round(attendanceDelayHours),
    burnout_risk_score: burnoutRiskScore,
  })
}

