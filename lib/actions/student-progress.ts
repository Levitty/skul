"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"

// ============================================================================
// Types
// ============================================================================

export interface ClassStudentSummary {
  id: string
  firstName: string
  lastName: string
  name: string
  admissionNumber: string
  status: string
  averageGrade: number
  averagePercentage: number
  rankInClass: number
  trend: "up" | "down" | "stable"
  attendanceRate: number
  homeworkCompletionRate: number
}

export interface StudentDetailedProgress {
  student: {
    id: string
    firstName: string
    lastName: string
    name: string
    admissionNumber: string
    status: string
  }
  class: {
    id: string
    name: string
    level: string | number
  }
  overallSummary: {
    averageGrade: string
    averagePercentage: number
    rankInClass: number
    totalStudentsInClass: number
    trend: "up" | "down" | "stable"
    performanceTrend: Array<{
      period: string
      percentage: number
    }>
  }
  subjectBreakdown: Array<{
    subject: string
    averagePercentage: number
    grade: string
    examsCount: number
    exams: Array<{
      examName: string
      examType: string
      examDate: string
      subject: string
      marksObtained: number
      maxMarks: number
      percentage: number
      grade: string
    }>
  }>
  attendance: {
    presentDays: number
    absentDays: number
    totalDays: number
    attendanceRate: number
  }
  homework: {
    completedCount: number
    totalCount: number
    completionRate: number
    recentHomework: Array<{
      id: string
      title: string
      dueDate: string
      submissionDate: string | null
      marks: number | null
    }>
  }
  assignments: {
    completedCount: number
    totalCount: number
    completionRate: number
    recentAssignments: Array<{
      id: string
      title: string
      dueDate: string
      submissionDate: string | null
      marks: number | null
    }>
  }
  strengths: string[]
  areasNeedingSupport: string[]
}

// ============================================================================
// Get Class Student Progress Summary
// ============================================================================

export async function getClassStudentProgress(
  classId: string
): Promise<{ data: ClassStudentSummary[] | null; error: string | null }> {
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
      .order("students(last_name)", { ascending: true })

    if (!enrollments || enrollments.length === 0) {
      return { data: [], error: null }
    }

    // Get exam sessions for this class
    const { data: examSessions } = await supabase
      .from("exam_sessions")
      .select("id, max_marks")
      .eq("class_id", classId)

    const sessionIds = (examSessions || []).map((s: any) => s.id)

    // Get exam results for all students
    const { data: allResults } = await supabase
      .from("exam_results")
      .select("student_id, marks_obtained, exam_session_id")
      .in("exam_session_id", sessionIds)

    // Get attendance data
    const { data: attendanceRecords } = await supabase
      .from("attendance_records")
      .select("student_id, status")
      .eq("class_id", classId)

    // Get homework/assignment completion
    const { data: homeworkData } = await supabase
      .from("homework")
      .select("id, homework_submissions(student_id, status)")
      .eq("class_id", classId)

    const { data: assignmentData } = await supabase
      .from("assignments")
      .select("id, assignment_submissions(student_id, status)")
      .eq("class_id", classId)

    // Calculate statistics for each student
    const resultsMap = new Map<string, any[]>()
    for (const result of allResults || []) {
      const studentId = (result as any).student_id
      if (!resultsMap.has(studentId)) {
        resultsMap.set(studentId, [])
      }
      resultsMap.get(studentId)!.push(result)
    }

    const attendanceMap = new Map<string, { present: number; total: number }>()
    for (const record of attendanceRecords || []) {
      const studentId = (record as any).student_id
      if (!attendanceMap.has(studentId)) {
        attendanceMap.set(studentId, { present: 0, total: 0 })
      }
      const stats = attendanceMap.get(studentId)!
      stats.total++
      if ((record as any).status === "present") {
        stats.present++
      }
    }

    const homeworkMap = new Map<string, { completed: number; total: number }>()
    for (const hw of homeworkData || []) {
      const submissions = (hw as any).homework_submissions || []
      for (const submission of submissions) {
        const studentId = submission.student_id
        if (!homeworkMap.has(studentId)) {
          homeworkMap.set(studentId, { completed: 0, total: 0 })
        }
        const stats = homeworkMap.get(studentId)!
        stats.total++
        if (submission.status === "submitted" || submission.status === "graded") {
          stats.completed++
        }
      }
    }

    // Build summary for each student
    const summaries: ClassStudentSummary[] = (enrollments as any[]).map((enrollment) => {
      const student = enrollment.students
      const results = resultsMap.get(enrollment.student_id) || []
      const attendance = attendanceMap.get(enrollment.student_id) || { present: 0, total: 1 }
      const homework = homeworkMap.get(enrollment.student_id) || { completed: 0, total: 1 }

      // Calculate average
      let totalMarks = 0
      let totalMaxMarks = 0
      for (const result of results) {
        totalMarks += (result as any).marks_obtained || 0
        const session = examSessions?.find((s: any) => s.id === (result as any).exam_session_id)
        if (session) {
          totalMaxMarks += (session as any).max_marks || 0
        }
      }

      const averagePercentage = totalMaxMarks > 0 ? (totalMarks / totalMaxMarks) * 100 : 0
      const attendanceRate = attendance.total > 0 ? (attendance.present / attendance.total) * 100 : 0
      const homeworkCompletionRate = homework.total > 0 ? (homework.completed / homework.total) * 100 : 0

      return {
        id: student.id,
        firstName: student.first_name,
        lastName: student.last_name,
        name: `${student.first_name} ${student.last_name}`,
        admissionNumber: student.admission_number,
        status: student.status,
        averageGrade: Math.round(averagePercentage),
        averagePercentage: Math.round(averagePercentage * 10) / 10,
        rankInClass: 0, // Will be calculated below
        trend: "stable" as const,
        attendanceRate: Math.round(attendanceRate),
        homeworkCompletionRate: Math.round(homeworkCompletionRate),
      }
    })

    // Calculate ranks
    const sorted = [...summaries].sort((a, b) => b.averagePercentage - a.averagePercentage)
    for (let i = 0; i < sorted.length; i++) {
      const originalIndex = summaries.findIndex((s) => s.id === sorted[i].id)
      summaries[originalIndex].rankInClass = i + 1
    }

    return { data: summaries, error: null }
  } catch (error: any) {
    console.error("Error loading class student progress:", error)
    return { error: error.message || "Failed to load student progress", data: null }
  }
}

// ============================================================================
// Get Student Detailed Progress
// ============================================================================

export async function getStudentDetailedProgress(
  studentId: string,
  classId: string
): Promise<{ data: StudentDetailedProgress | null; error: string | null }> {
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

    // Get student info
    const { data: student } = await supabase
      .from("students")
      .select("id, first_name, last_name, admission_number, status")
      .eq("id", studentId)
      .eq("school_id", context.schoolId)
      .single()

    if (!student) {
      return { error: "Student not found", data: null }
    }

    // Get class info
    const { data: classData } = await supabase
      .from("classes")
      .select("id, name, level")
      .eq("id", classId)
      .single()

    if (!classData) {
      return { error: "Class not found", data: null }
    }

    // Get all enrollments in class for rank calculation
    const { data: allEnrollments } = await supabase
      .from("enrollments")
      .select("student_id")
      .eq("class_id", classId)

    // Get exam sessions for this class
    const { data: examSessions } = await supabase
      .from("exam_sessions")
      .select(`
        id, subject, max_marks, exam_date,
        exams(id, name, exam_type)
      `)
      .eq("class_id", classId)
      .order("exam_date", { ascending: true })

    const sessionIds = (examSessions || []).map((s: any) => s.id)

    // Get exam results for this student
    const { data: studentResults } = await supabase
      .from("exam_results")
      .select("id, marks_obtained, exam_session_id")
      .eq("student_id", studentId)
      .in("exam_session_id", sessionIds)

    // Get all results for class to calculate ranks
    const { data: allClassResults } = await supabase
      .from("exam_results")
      .select("student_id, marks_obtained, exam_session_id")
      .in("exam_session_id", sessionIds)

    // Get attendance
    const { data: attendanceRecords } = await supabase
      .from("attendance_records")
      .select("status")
      .eq("student_id", studentId)
      .eq("class_id", classId)

    // Get homework
    const { data: homeworkSubmissions } = await supabase
      .from("homework_submissions")
      .select(`
        id, status, marks_obtained,
        homework(id, title, due_date, class_id)
      `)
      .eq("student_id", studentId)
      .eq("homework.class_id", classId)
      .order("homework(due_date)", { ascending: false })
      .limit(10)

    // Get assignments
    const { data: assignmentSubmissions } = await supabase
      .from("assignment_submissions")
      .select(`
        id, status, marks_obtained, submitted_at,
        assignments(id, title, due_date, class_id)
      `)
      .eq("student_id", studentId)
      .eq("assignments.class_id", classId)
      .order("assignments(due_date)", { ascending: false })
      .limit(10)

    // Calculate subject breakdown
    const subjectMap = new Map<string, {
      subject: string
      exams: any[]
      totalMarks: number
      totalMaxMarks: number
    }>()

    for (const result of studentResults || []) {
      const session = (examSessions as any[]).find((s) => s.id === (result as any).exam_session_id)
      if (!session) continue

      const subject = session.subject
      if (!subjectMap.has(subject)) {
        subjectMap.set(subject, {
          subject,
          exams: [],
          totalMarks: 0,
          totalMaxMarks: 0,
        })
      }

      const entry = subjectMap.get(subject)!
      entry.exams.push({
        examName: (session.exams as any)?.name || "",
        examType: (session.exams as any)?.exam_type || "",
        examDate: session.exam_date,
        subject,
        marksObtained: (result as any).marks_obtained || 0,
        maxMarks: session.max_marks || 0,
      })
      entry.totalMarks += (result as any).marks_obtained || 0
      entry.totalMaxMarks += session.max_marks || 0
    }

    const subjectBreakdown = Array.from(subjectMap.values()).map((entry) => {
      const averagePercentage = entry.totalMaxMarks > 0
        ? (entry.totalMarks / entry.totalMaxMarks) * 100
        : 0
      const grade = getGradeFromPercentage(averagePercentage)

      return {
        subject: entry.subject,
        averagePercentage: Math.round(averagePercentage * 10) / 10,
        grade,
        examsCount: entry.exams.length,
        exams: entry.exams.map((exam) => ({
          ...exam,
          percentage: exam.maxMarks > 0 ? (exam.marksObtained / exam.maxMarks) * 100 : 0,
          grade: getGradeFromPercentage(
            exam.maxMarks > 0 ? (exam.marksObtained / exam.maxMarks) * 100 : 0
          ),
        })),
      }
    })

    // Calculate overall
    let totalMarks = 0
    let totalMaxMarks = 0
    for (const subject of subjectBreakdown) {
      totalMarks += subject.exams.reduce((sum, e) => sum + e.marksObtained, 0)
      totalMaxMarks += subject.exams.reduce((sum, e) => sum + e.maxMarks, 0)
    }

    const overallPercentage = totalMaxMarks > 0 ? (totalMarks / totalMaxMarks) * 100 : 0

    // Calculate rank
    let rank = 1
    const resultsMap = new Map<string, number>()
    for (const result of allClassResults || []) {
      const sid = (result as any).student_id
      const sessionId = (result as any).exam_session_id
      const session = (examSessions as any[]).find((s) => s.id === sessionId)
      if (!session) continue

      if (!resultsMap.has(sid)) {
        resultsMap.set(sid, 0)
      }
      resultsMap.set(sid, resultsMap.get(sid)! + (result as any).marks_obtained)
    }

    const sortedByMarks = Array.from(resultsMap.entries())
      .sort((a, b) => b[1] - a[1])
    rank = sortedByMarks.findIndex((entry) => entry[0] === studentId) + 1

    // Calculate attendance
    const presentCount = (attendanceRecords || []).filter((a: any) => a.status === "present").length
    const totalAttendanceDays = attendanceRecords?.length || 1

    // Calculate homework completion
    const completedHomework = (homeworkSubmissions || []).filter(
      (s: any) => s.status === "submitted" || s.status === "graded"
    ).length
    const totalHomework = homeworkSubmissions?.length || 1

    // Calculate assignments completion
    const completedAssignments = (assignmentSubmissions || []).filter(
      (s: any) => s.status === "submitted" || s.status === "graded"
    ).length
    const totalAssignments = assignmentSubmissions?.length || 1

    // Identify strengths and areas needing support
    const strengths: string[] = []
    const areasNeedingSupport: string[] = []

    // Analyze subjects
    for (const subject of subjectBreakdown) {
      if (subject.averagePercentage >= 80) {
        strengths.push(`Excellent performance in ${subject.subject}`)
      } else if (subject.averagePercentage < 50) {
        areasNeedingSupport.push(`Needs support in ${subject.subject}`)
      }
    }

    // Check attendance
    if (presentCount / totalAttendanceDays > 0.95) {
      strengths.push("Excellent attendance record")
    } else if (presentCount / totalAttendanceDays < 0.75) {
      areasNeedingSupport.push("Low attendance rate")
    }

    // Check homework completion
    if (completedHomework / totalHomework > 0.9) {
      strengths.push("Consistent homework completion")
    } else if (completedHomework / totalHomework < 0.7) {
      areasNeedingSupport.push("Incomplete homework submissions")
    }

    // Ensure at least some analysis
    if (strengths.length === 0) {
      strengths.push("Shows engagement in coursework")
    }
    if (areasNeedingSupport.length === 0) {
      areasNeedingSupport.push("Monitor progress regularly")
    }

    return {
      data: {
        student: {
          id: student.id,
          firstName: student.first_name,
          lastName: student.last_name,
          name: `${student.first_name} ${student.last_name}`,
          admissionNumber: student.admission_number,
          status: student.status,
        },
        class: {
          id: classData.id,
          name: classData.name,
          level: classData.level,
        },
        overallSummary: {
          averageGrade: getGradeFromPercentage(overallPercentage),
          averagePercentage: Math.round(overallPercentage * 10) / 10,
          rankInClass: rank,
          totalStudentsInClass: allEnrollments?.length || 1,
          trend: "stable",
          performanceTrend: [],
        },
        subjectBreakdown,
        attendance: {
          presentDays: presentCount,
          absentDays: totalAttendanceDays - presentCount,
          totalDays: totalAttendanceDays,
          attendanceRate: Math.round((presentCount / totalAttendanceDays) * 100),
        },
        homework: {
          completedCount: completedHomework,
          totalCount: totalHomework,
          completionRate: Math.round((completedHomework / totalHomework) * 100),
          recentHomework: (homeworkSubmissions || []).slice(0, 5).map((sub: any) => ({
            id: sub.id,
            title: (sub.homework as any)?.title || "",
            dueDate: (sub.homework as any)?.due_date || "",
            submissionDate: (sub as any).submitted_at || null,
            marks: (sub as any).marks_obtained || null,
          })),
        },
        assignments: {
          completedCount: completedAssignments,
          totalCount: totalAssignments,
          completionRate: Math.round((completedAssignments / totalAssignments) * 100),
          recentAssignments: (assignmentSubmissions || []).slice(0, 5).map((sub: any) => ({
            id: sub.id,
            title: (sub.assignments as any)?.title || "",
            dueDate: (sub.assignments as any)?.due_date || "",
            submissionDate: (sub as any).submitted_at || null,
            marks: (sub as any).marks_obtained || null,
          })),
        },
        strengths,
        areasNeedingSupport,
      },
      error: null,
    }
  } catch (error: any) {
    console.error("Error loading student detailed progress:", error)
    return { error: error.message || "Failed to load student progress", data: null }
  }
}

// ============================================================================
// Helpers
// ============================================================================

function getGradeFromPercentage(percentage: number): string {
  if (percentage >= 90) return "A+"
  if (percentage >= 85) return "A"
  if (percentage >= 80) return "B+"
  if (percentage >= 75) return "B"
  if (percentage >= 70) return "C+"
  if (percentage >= 65) return "C"
  if (percentage >= 60) return "D+"
  if (percentage >= 50) return "D"
  return "F"
}
