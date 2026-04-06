"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"

// ============================================================================
// Types
// ============================================================================

export interface TeacherDashboardData {
  teacher: {
    id: string
    name: string
    position: string
    department: string | null
  }
  stats: {
    classCount: number
    studentCount: number
    pendingGrading: number
    schemeStatus: {
      submitted: number
      draft: number
    }
  }
  todaySchedule: Array<{
    id: string
    subject: string
    className: string
    period: string
    startTime: string
    endTime: string
  }>
  upcomingDeadlines: Array<{
    id: string
    title: string
    type: "homework" | "assignment"
    dueDate: string
    classCount: number
  }>
  recentActivity: Array<{
    id: string
    type: "grade" | "assignment" | "homework"
    title: string
    description: string
    timestamp: string
  }>
}

export interface ClassDetail {
  id: string
  name: string
  level: string
  subject: string
  studentCount: number
  section: string | null
  performanceSummary: {
    averageScore: number
    topScore: number
    bottomScore: number
  }
  attendanceRate: number
}

export interface ClassStudent {
  id: string
  name: string
  admissionNumber: string
  status: string
}

// ============================================================================
// Get Teacher Dashboard
// ============================================================================

export async function getTeacherDashboard(): Promise<{ data: TeacherDashboardData | null; error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Not authenticated", data: null }
    }

    const context = await requireTenantContext(user.id)
    if (!context) {
      return { error: "No school context", data: null }
    }

    // Get teacher info
    const { data: teacher, error: teacherError } = await supabase
      .from("employees")
      .select("id, first_name, last_name, position, department")
      .eq("user_id", user.id)
      .eq("school_id", context.schoolId)
      .single()

    if (teacherError || !teacher) {
      return { error: "Teacher not found", data: null }
    }

    const teacherId = (teacher as any).id
    const teacherName = `${(teacher as any).first_name} ${(teacher as any).last_name}`

    // Get classes taught (via timetable)
    const { data: timetableEntries } = await supabase
      .from("timetable_entries")
      .select("class_id, subject, classes(id, name, level), sections(name)")
      .eq("teacher_id", teacherId)

    const uniqueClasses = new Map<string, any>()
    const classIds = new Set<string>()

    for (const entry of timetableEntries || []) {
      const classId = (entry as any).class_id
      classIds.add(classId)
      if (!uniqueClasses.has(classId)) {
        uniqueClasses.set(classId, {
          id: classId,
          name: (entry as any).classes?.name,
          level: (entry as any).classes?.level,
        })
      }
    }

    // Get student count for each class
    let totalStudentCount = 0
    for (const classId of Array.from(classIds)) {
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("id")
        .eq("class_id", classId)
      totalStudentCount += enrollments?.length || 0
    }

    // Get pending grading count (homework + assignments not graded)
    let pendingGrading = 0

    // Homework not graded
    const { data: homeworkList } = await supabase
      .from("homework")
      .select("id, homework_submissions(id, status)")
      .eq("teacher_id", teacherId)
      .eq("school_id", context.schoolId)

    for (const hw of homeworkList || []) {
      const submissions = (hw as any).homework_submissions || []
      const ungraded = submissions.filter((s: any) => s.status === "submitted").length
      pendingGrading += ungraded
    }

    // Assignments not graded
    const { data: assignmentsList } = await supabase
      .from("assignments")
      .select("id, assignment_submissions(id, status)")
      .eq("teacher_id", teacherId)
      .eq("school_id", context.schoolId)

    for (const assignment of assignmentsList || []) {
      const submissions = (assignment as any).assignment_submissions || []
      const ungraded = submissions.filter((s: any) => s.status === "submitted").length
      pendingGrading += ungraded
    }

    // Get scheme status
    const { data: schemes } = await supabase
      .from("schemes_of_work")
      .select("id, status")
      .eq("teacher_id", teacherId)
      .eq("school_id", context.schoolId)

    const schemeStatus = {
      submitted: schemes?.filter((s: any) => s.status === "submitted").length || 0,
      draft: schemes?.filter((s: any) => s.status === "draft").length || 0,
    }

    // Get today's schedule
    const now = new Date()
    const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay() // Convert JS 0-6 to 1-7

    const { data: todayEntries } = await supabase
      .from("timetable_entries")
      .select(`
        id, subject, day_of_week,
        classes(name),
        periods(name, start_time, end_time)
      `)
      .eq("teacher_id", teacherId)
      .eq("day_of_week", dayOfWeek)

    const todaySchedule = (todayEntries || []).map((entry: any) => ({
      id: entry.id,
      subject: entry.subject,
      className: entry.classes?.name || "Unknown",
      period: entry.periods?.name || "Unknown",
      startTime: entry.periods?.start_time || "",
      endTime: entry.periods?.end_time || "",
    }))

    // Get upcoming deadlines (homework + assignments due soon)
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split("T")[0]
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]

    const { data: upcomingHomework } = await supabase
      .from("homework")
      .select("id, title, due_date")
      .eq("teacher_id", teacherId)
      .eq("school_id", context.schoolId)
      .gte("due_date", tomorrow)
      .lte("due_date", nextWeek)
      .order("due_date", { ascending: true })

    const { data: upcomingAssignments } = await supabase
      .from("assignments")
      .select("id, title, due_date")
      .eq("teacher_id", teacherId)
      .eq("school_id", context.schoolId)
      .gte("due_date", tomorrow)
      .lte("due_date", nextWeek)
      .order("due_date", { ascending: true })

    const upcomingDeadlines = [
      ...(upcomingHomework || []).map((h: any) => ({
        id: h.id,
        title: h.title,
        type: "homework" as const,
        dueDate: h.due_date,
        classCount: 1,
      })),
      ...(upcomingAssignments || []).map((a: any) => ({
        id: a.id,
        title: a.title,
        type: "assignment" as const,
        dueDate: a.due_date,
        classCount: 1,
      })),
    ].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()).slice(0, 5)

    // Get recent activity (latest grades, assignments, homework)
    const recentActivity: TeacherDashboardData["recentActivity"] = []

    // Recent grades entered
    const { data: recentGrades } = await supabase
      .from("exam_results")
      .select("id, marks_obtained, exam_sessions(subject)")
      .eq("teacher_id", teacherId)
      .order("created_at", { ascending: false })
      .limit(3)

    for (const grade of recentGrades || []) {
      recentActivity.push({
        id: grade.id,
        type: "grade",
        title: "Grade Entered",
        description: `${grade.marks_obtained} marks in ${(grade as any).exam_sessions?.subject || "exam"}`,
        timestamp: new Date().toISOString(),
      })
    }

    // Recent assignments created
    const { data: recentAssignments } = await supabase
      .from("assignments")
      .select("id, title, created_at")
      .eq("teacher_id", teacherId)
      .eq("school_id", context.schoolId)
      .order("created_at", { ascending: false })
      .limit(2)

    for (const assignment of recentAssignments || []) {
      recentActivity.push({
        id: assignment.id,
        type: "assignment",
        title: "Assignment Created",
        description: assignment.title,
        timestamp: assignment.created_at,
      })
    }

    return {
      data: {
        teacher: {
          id: teacherId,
          name: teacherName,
          position: (teacher as any).position || "",
          department: (teacher as any).department,
        },
        stats: {
          classCount: classIds.size,
          studentCount: totalStudentCount,
          pendingGrading,
          schemeStatus,
        },
        todaySchedule,
        upcomingDeadlines,
        recentActivity: recentActivity.slice(0, 5),
      },
      error: null,
    }
  } catch (error: any) {
    console.error("Error loading teacher dashboard:", error)
    return { error: error.message || "Failed to load dashboard", data: null }
  }
}

// ============================================================================
// Get Teacher's Classes
// ============================================================================

export async function getTeacherClasses(): Promise<{ data: ClassDetail[] | null; error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Not authenticated", data: null }
    }

    const context = await requireTenantContext(user.id)
    if (!context) {
      return { error: "No school context", data: null }
    }

    // Get teacher
    const { data: teacher } = await supabase
      .from("employees")
      .select("id")
      .eq("user_id", user.id)
      .eq("school_id", context.schoolId)
      .single()

    if (!teacher) {
      return { error: "Teacher not found", data: null }
    }

    const teacherId = (teacher as any).id

    // Get classes taught
    const { data: timetableEntries } = await supabase
      .from("timetable_entries")
      .select(`
        class_id, subject,
        classes(id, name, level),
        sections(name)
      `)
      .eq("teacher_id", teacherId)

    const classesMap = new Map<string, any>()

    for (const entry of timetableEntries || []) {
      const classId = (entry as any).class_id
      const key = `${classId}-${entry.subject}`

      if (!classesMap.has(key)) {
        classesMap.set(key, {
          id: classId,
          name: (entry as any).classes?.name,
          level: (entry as any).classes?.level,
          subject: entry.subject,
          section: (entry as any).sections?.name,
        })
      }
    }

    // Enrich with student count and performance data
    const classDetails: ClassDetail[] = []

    for (const [, classData] of classesMap) {
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("id")
        .eq("class_id", classData.id)

      let performanceSummary = {
        averageScore: 0,
        topScore: 0,
        bottomScore: 0,
      }

      // Get performance data from exam results
      const { data: results } = await supabase
        .from("exam_results")
        .select("marks_obtained, max_marks, exam_sessions(class_id)")
        .eq("exam_sessions.class_id", classData.id)

      if (results && results.length > 0) {
        const scores = (results as any[]).map((r) => (r.marks_obtained / r.max_marks) * 100)
        performanceSummary.averageScore = Math.round(
          scores.reduce((a, b) => a + b, 0) / scores.length
        )
        performanceSummary.topScore = Math.round(Math.max(...scores))
        performanceSummary.bottomScore = Math.round(Math.min(...scores))
      }

      // Get attendance rate
      const { data: attendanceRecords } = await supabase
        .from("attendance_records")
        .select("status")
        .eq("class_id", classData.id)

      const presentCount = attendanceRecords?.filter((a: any) => a.status === "present").length || 0
      const totalCount = attendanceRecords?.length || 0
      const attendanceRate = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0

      classDetails.push({
        id: classData.id,
        name: classData.name,
        level: classData.level?.toString() || "",
        subject: classData.subject,
        studentCount: enrollments?.length || 0,
        section: classData.section,
        performanceSummary,
        attendanceRate,
      })
    }

    return { data: classDetails, error: null }
  } catch (error: any) {
    console.error("Error loading teacher classes:", error)
    return { error: error.message || "Failed to load classes", data: null }
  }
}

// ============================================================================
// Get Today's Schedule
// ============================================================================

export async function getTeacherScheduleToday(): Promise<{ data: TeacherDashboardData["todaySchedule"] | null; error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Not authenticated", data: null }
    }

    const context = await requireTenantContext(user.id)
    if (!context) {
      return { error: "No school context", data: null }
    }

    // Get teacher
    const { data: teacher } = await supabase
      .from("employees")
      .select("id")
      .eq("user_id", user.id)
      .eq("school_id", context.schoolId)
      .single()

    if (!teacher) {
      return { error: "Teacher not found", data: null }
    }

    const teacherId = (teacher as any).id

    // Get today's day of week
    const now = new Date()
    const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay()

    const { data: entries } = await supabase
      .from("timetable_entries")
      .select(`
        id, subject, day_of_week,
        classes(name),
        periods(name, start_time, end_time)
      `)
      .eq("teacher_id", teacherId)
      .eq("day_of_week", dayOfWeek)
      .order("periods(start_time)", { ascending: true })

    const schedule = (entries || []).map((entry: any) => ({
      id: entry.id,
      subject: entry.subject,
      className: entry.classes?.name || "Unknown",
      period: entry.periods?.name || "Unknown",
      startTime: entry.periods?.start_time || "",
      endTime: entry.periods?.end_time || "",
    }))

    return { data: schedule, error: null }
  } catch (error: any) {
    console.error("Error loading teacher schedule:", error)
    return { error: error.message || "Failed to load schedule", data: null }
  }
}

// ============================================================================
// Get Class Students
// ============================================================================

export async function getClassStudents(classId: string): Promise<{ data: ClassStudent[] | null; error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Not authenticated", data: null }
    }

    const context = await requireTenantContext(user.id)
    if (!context) {
      return { error: "No school context", data: null }
    }

    // Verify teacher is assigned to this class
    const { data: teacher } = await supabase
      .from("employees")
      .select("id")
      .eq("user_id", user.id)
      .eq("school_id", context.schoolId)
      .single()

    if (!teacher) {
      return { error: "Teacher not found", data: null }
    }

    const teacherId = (teacher as any).id

    // Check if teacher teaches this class
    const { data: classAssignment } = await supabase
      .from("timetable_entries")
      .select("id")
      .eq("teacher_id", teacherId)
      .eq("class_id", classId)
      .single()

    if (!classAssignment) {
      return { error: "Not authorized to view this class", data: null }
    }

    // Get students enrolled in the class
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select(`
        student_id,
        students(id, first_name, last_name, admission_number, status)
      `)
      .eq("class_id", classId)

    const students: ClassStudent[] = (enrollments || []).map((enrollment: any) => ({
      id: enrollment.student_id,
      name: `${enrollment.students?.first_name} ${enrollment.students?.last_name}`,
      admissionNumber: enrollment.students?.admission_number || "",
      status: enrollment.students?.status || "active",
    }))

    return { data: students, error: null }
  } catch (error: any) {
    console.error("Error loading class students:", error)
    return { error: error.message || "Failed to load students", data: null }
  }
}

// ============================================================================
// Get Pending Tasks
// ============================================================================

export async function getPendingTasks(): Promise<{ data: { count: number }; error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Not authenticated", data: { count: 0 } }
    }

    const context = await requireTenantContext(user.id)
    if (!context) {
      return { error: "No school context", data: { count: 0 } }
    }

    // Get teacher
    const { data: teacher } = await supabase
      .from("employees")
      .select("id")
      .eq("user_id", user.id)
      .eq("school_id", context.schoolId)
      .single()

    if (!teacher) {
      return { error: "Teacher not found", data: { count: 0 } }
    }

    const teacherId = (teacher as any).id
    let pendingCount = 0

    // Count pending homework submissions
    const { data: homeworkList } = await supabase
      .from("homework")
      .select("id, homework_submissions(id, status)")
      .eq("teacher_id", teacherId)
      .eq("school_id", context.schoolId)

    for (const hw of homeworkList || []) {
      const submissions = (hw as any).homework_submissions || []
      pendingCount += submissions.filter((s: any) => s.status === "submitted").length
    }

    // Count pending assignment submissions
    const { data: assignmentsList } = await supabase
      .from("assignments")
      .select("id, assignment_submissions(id, status)")
      .eq("teacher_id", teacherId)
      .eq("school_id", context.schoolId)

    for (const assignment of assignmentsList || []) {
      const submissions = (assignment as any).assignment_submissions || []
      pendingCount += submissions.filter((s: any) => s.status === "submitted").length
    }

    return { data: { count: pendingCount }, error: null }
  } catch (error: any) {
    console.error("Error getting pending tasks:", error)
    return { error: error.message || "Failed to get pending tasks", data: { count: 0 } }
  }
}
