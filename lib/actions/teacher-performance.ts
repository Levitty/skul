"use server"

import { createClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"

// ============================================================================
// Types
// ============================================================================

export interface TeacherPerformance {
  teacherId: string
  teacherName: string
  position: string
  department: string | null

  // Grading metrics
  gradingCompletionRate: number    // % of assigned exam sessions with all results entered
  avgGradingDelayDays: number      // avg days between exam date and grade entry
  totalExamSessionsAssigned: number
  totalExamSessionsGraded: number

  // Homework metrics
  homeworkAssigned: number         // total homework assignments created
  homeworkGraded: number           // assignments where all submissions were graded
  homeworkGradingRate: number      // %

  // Attendance recording
  attendanceRecordingDays: number  // days where teacher recorded attendance
  attendanceExpectedDays: number   // school days in period
  attendanceRecordingRate: number  // %

  // Student outcomes
  avgStudentScore: number | null   // average marks across all students in teacher's classes
  classCount: number               // number of classes taught

  // Composite score (0-100)
  performanceScore: number
}

export interface TeacherRanking {
  teacherId: string
  teacherName: string
  performanceScore: number
  gradingCompletionRate: number
  avgStudentScore: number | null
  classCount: number
}

// ============================================================================
// Get Individual Teacher Performance
// ============================================================================

export async function getTeacherPerformance(teacherId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated", data: null }

  const context = await requireTenantContext(user.id)
  if (!context) return { error: "No school context", data: null }

  const performance = await calculateTeacherPerformance(
    supabase,
    teacherId,
    context.schoolId
  )

  if (!performance) return { error: "Teacher not found", data: null }

  return { data: performance, error: null }
}

// ============================================================================
// Get All Teacher Rankings
// ============================================================================

export async function getTeacherRankings() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated", data: null }

  const context = await requireTenantContext(user.id)
  if (!context) return { error: "No school context", data: null }

  // Get all active teachers
  const { data: teachers } = await supabase
    .from("employees")
    .select("id, first_name, last_name")
    .eq("school_id", context.schoolId)
    .eq("status", "active")
    .in("position", ["teacher", "Teacher", "head_teacher", "Head Teacher"])

  if (!teachers || teachers.length === 0) {
    return { data: [], error: null }
  }

  const rankings: TeacherRanking[] = []

  for (const teacher of teachers) {
    const perf = await calculateTeacherPerformance(
      supabase,
      (teacher as any).id,
      context.schoolId
    )
    if (perf) {
      rankings.push({
        teacherId: perf.teacherId,
        teacherName: perf.teacherName,
        performanceScore: perf.performanceScore,
        gradingCompletionRate: perf.gradingCompletionRate,
        avgStudentScore: perf.avgStudentScore,
        classCount: perf.classCount,
      })
    }
  }

  // Sort by performance score descending
  rankings.sort((a, b) => b.performanceScore - a.performanceScore)

  return { data: rankings, error: null }
}

// ============================================================================
// Get Teacher's Class Results
// ============================================================================

export async function getTeacherClassResults(teacherId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated", data: null }

  const context = await requireTenantContext(user.id)
  if (!context) return { error: "No school context", data: null }

  // Find classes this teacher teaches via timetable
  const { data: assignments } = await supabase
    .from("timetable_entries")
    .select("class_id, subject, classes(id, name)")
    .eq("teacher_id", teacherId)

  if (!assignments || assignments.length === 0) {
    return { data: [], error: null }
  }

  // Deduplicate class-subject pairs
  const seen = new Set<string>()
  const uniqueAssignments = assignments.filter((a: any) => {
    const key = `${a.class_id}-${a.subject}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // For each class-subject, get average exam results
  const results = []

  for (const assignment of uniqueAssignments) {
    const classId = (assignment as any).class_id
    const subject = (assignment as any).subject
    const className = (assignment as any).classes?.name || "Unknown"

    const { data: sessions } = await supabase
      .from("exam_sessions")
      .select(`
        id, subject, max_marks,
        exam_results(marks_obtained)
      `)
      .eq("class_id", classId)
      .eq("subject", subject)

    let totalMarks = 0
    let totalMax = 0
    let studentCount = 0

    for (const session of sessions || []) {
      const maxMarks = Number((session as any).max_marks || 0)
      for (const result of (session as any).exam_results || []) {
        totalMarks += Number(result.marks_obtained || 0)
        totalMax += maxMarks
        studentCount++
      }
    }

    const avgPercentage = totalMax > 0 ? Math.round((totalMarks / totalMax) * 100) : 0

    results.push({
      className,
      subject,
      avgPercentage,
      studentCount,
      examSessions: sessions?.length || 0,
    })
  }

  return { data: results, error: null }
}

// ============================================================================
// Internal: Calculate Performance for One Teacher
// ============================================================================

async function calculateTeacherPerformance(
  supabase: any,
  teacherId: string,
  schoolId: string
): Promise<TeacherPerformance | null> {
  // Get teacher info
  const { data: teacher } = await supabase
    .from("employees")
    .select("id, first_name, last_name, position, department")
    .eq("id", teacherId)
    .eq("school_id", schoolId)
    .single()

  if (!teacher) return null

  const teacherName = `${(teacher as any).first_name} ${(teacher as any).last_name}`

  // Find classes this teacher is assigned to via timetable
  const { data: timetableAssignments } = await supabase
    .from("timetable_entries")
    .select("class_id, subject")
    .eq("teacher_id", teacherId)

  const classSubjects = new Set<string>()
  const classIds = new Set<string>()
  for (const a of timetableAssignments || []) {
    classSubjects.add(`${(a as any).class_id}|${(a as any).subject}`)
    classIds.add((a as any).class_id)
  }

  // ── Grading metrics ──
  // Find exam sessions for this teacher's class-subject combos
  let totalSessionsAssigned = 0
  let totalSessionsGraded = 0
  let totalGradingDelay = 0
  let gradingDelayCount = 0
  let totalStudentMarks = 0
  let totalStudentMax = 0
  let studentResultCount = 0

  for (const cs of classSubjects) {
    const [classId, subject] = cs.split("|")

    const { data: sessions } = await supabase
      .from("exam_sessions")
      .select(`
        id, exam_date, max_marks,
        exam_results(marks_obtained, created_at)
      `)
      .eq("class_id", classId)
      .eq("subject", subject)

    for (const session of sessions || []) {
      totalSessionsAssigned++
      const results = (session as any).exam_results || []

      if (results.length > 0) {
        totalSessionsGraded++

        // Calculate grading delay
        const examDate = (session as any).exam_date
        if (examDate) {
          for (const r of results) {
            const entryDate = r.created_at
            if (entryDate) {
              const delay = Math.max(
                0,
                (new Date(entryDate).getTime() - new Date(examDate).getTime()) / (1000 * 60 * 60 * 24)
              )
              totalGradingDelay += delay
              gradingDelayCount++
            }

            // Track student scores
            const marks = Number(r.marks_obtained || 0)
            const maxMarks = Number((session as any).max_marks || 0)
            totalStudentMarks += marks
            totalStudentMax += maxMarks
            studentResultCount++
          }
        }
      }
    }
  }

  const gradingCompletionRate = totalSessionsAssigned > 0
    ? Math.round((totalSessionsGraded / totalSessionsAssigned) * 100)
    : 0

  const avgGradingDelayDays = gradingDelayCount > 0
    ? Math.round((totalGradingDelay / gradingDelayCount) * 10) / 10
    : 0

  const avgStudentScore = totalStudentMax > 0
    ? Math.round((totalStudentMarks / totalStudentMax) * 100)
    : null

  // ── Homework metrics ──
  const { data: homework } = await supabase
    .from("homework")
    .select("id, is_graded, homework_submissions(id, status)")
    .eq("teacher_id", teacherId)
    .eq("school_id", schoolId)

  let homeworkAssigned = homework?.length || 0
  let homeworkGraded = 0

  for (const hw of homework || []) {
    const submissions = (hw as any).homework_submissions || []
    const allGraded = submissions.length > 0 && submissions.every(
      (s: any) => s.status === "graded" || s.status === "returned"
    )
    if (allGraded && submissions.length > 0) homeworkGraded++
  }

  const homeworkGradingRate = homeworkAssigned > 0
    ? Math.round((homeworkGraded / homeworkAssigned) * 100)
    : 0

  // ── Attendance recording ──
  // Count distinct dates where this teacher recorded attendance
  const { data: attendanceRecords } = await supabase
    .from("attendance_records")
    .select("date")
    .eq("recorded_by", teacherId)
    .eq("school_id", schoolId)

  const uniqueDates = new Set((attendanceRecords || []).map((r: any) => r.date))
  const attendanceRecordingDays = uniqueDates.size

  // Rough estimate: ~20 school days per month, check last 3 months
  const attendanceExpectedDays = 60

  const attendanceRecordingRate = attendanceExpectedDays > 0
    ? Math.min(100, Math.round((attendanceRecordingDays / attendanceExpectedDays) * 100))
    : 0

  // ── Composite score ──
  // Weighted: grading completion (35%), grading timeliness (20%),
  //           homework follow-through (20%), attendance recording (15%),
  //           student outcomes (10%)
  let score = 0

  // Grading completion: 100% = 35 points
  score += (gradingCompletionRate / 100) * 35

  // Grading timeliness: 0 days delay = 20 points, 14+ days = 0
  const timelinessScore = Math.max(0, 1 - avgGradingDelayDays / 14)
  score += timelinessScore * 20

  // Homework follow-through: 100% = 20 points
  score += (homeworkGradingRate / 100) * 20

  // Attendance recording: 100% = 15 points
  score += (attendanceRecordingRate / 100) * 15

  // Student outcomes: avg score maps to 0-10 points
  if (avgStudentScore !== null) {
    score += (avgStudentScore / 100) * 10
  }

  const performanceScore = Math.round(score)

  return {
    teacherId,
    teacherName,
    position: (teacher as any).position || "",
    department: (teacher as any).department || null,
    gradingCompletionRate,
    avgGradingDelayDays,
    totalExamSessionsAssigned: totalSessionsAssigned,
    totalExamSessionsGraded: totalSessionsGraded,
    homeworkAssigned,
    homeworkGraded,
    homeworkGradingRate,
    attendanceRecordingDays,
    attendanceExpectedDays,
    attendanceRecordingRate,
    avgStudentScore,
    classCount: classIds.size,
    performanceScore,
  }
}
