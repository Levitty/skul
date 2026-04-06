"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"
import { EXAM_TYPES, ExamType, ClassExamReport, GradesStatistics, TopPerformer, SubjectPerformance } from "@/lib/types/exams"

// Types are available from @/lib/types/exams

export async function getClassExamReport(
  classId: string,
  examType?: ExamType
): Promise<ClassExamReport> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Not authenticated")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    throw new Error("No school context")
  }

  const { data: classInfo, error: classError } = await supabase
    .from("classes")
    .select("id, name, level")
    .eq("id", classId)
    .eq("school_id", context.schoolId)
    .single()

  if (classError || !classInfo) {
    throw new Error("Class not found")
  }

  let sessionsQuery = supabase
    .from("exam_sessions")
    .select(`
      id,
      subject,
      exam_date,
      max_marks,
      exams!inner(id, name, exam_type, school_id),
      exam_results(
        student_id,
        marks_obtained,
        students!inner(id, first_name, last_name, admission_number)
      )
    `)
    .eq("class_id", classId)
    .eq("exams.school_id", context.schoolId)
    .order("exam_date", { ascending: true })

  if (examType) {
    sessionsQuery = sessionsQuery.eq("exams.exam_type", examType)
  }

  const { data: sessions, error: sessionsError } = await sessionsQuery

  if (sessionsError) {
    throw new Error(`Failed to load exam sessions: ${sessionsError.message}`)
  }

  const studentsMap = new Map<
    string,
    {
      id: string
      name: string
      admissionNumber?: string | null
      totalMarks: number
      maxMarks: number
      examsTaken: number
    }
  >()

  for (const session of ((sessions || []) as any[])) {
    const maxMarks = Number(session.max_marks || 0)
    for (const result of session.exam_results || []) {
      const student = (result as any).students
      if (!student) continue

      const existing = studentsMap.get(student.id) || {
        id: student.id,
        name: `${student.first_name} ${student.last_name}`,
        admissionNumber: student.admission_number,
        totalMarks: 0,
        maxMarks: 0,
        examsTaken: 0,
      }

      existing.totalMarks += Number(result.marks_obtained || 0)
      existing.maxMarks += maxMarks
      existing.examsTaken += 1
      studentsMap.set(student.id, existing)
    }
  }

  const students = Array.from(studentsMap.values()).map((student) => ({
    ...student,
    average: student.maxMarks > 0 ? Math.round((student.totalMarks / student.maxMarks) * 100) : 0,
  }))

  return {
    classInfo,
    examType,
    sessions: (sessions || []) as any,
    students,
  }
}

// ============ Exam Management Actions ============

export async function getExams(academicYearId?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  let query = supabase
    .from("exams")
    .select("*, academic_years(id, name)")
    .eq("school_id", context.schoolId)
    .order("created_at", { ascending: false })

  if (academicYearId) {
    query = query.eq("academic_year_id", academicYearId)
  }

  const { data: exams, error } = await query

  if (error) {
    return { error: error.message }
  }

  return { data: exams }
}

export async function createExam(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const name = formData.get("name") as string
  const examType = formData.get("exam_type") as ExamType
  const academicYearId = formData.get("academic_year_id") as string
  const weight = formData.get("weight") ? parseFloat(formData.get("weight") as string) : null

  if (!name || !examType || !academicYearId) {
    return { error: "Name, exam type, and academic year are required" }
  }

  const { data: exam, error } = await supabase
    .from("exams")
    .insert({
      school_id: context.schoolId,
      academic_year_id: academicYearId,
      name,
      exam_type: examType,
      weight,
    } as any)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/teacher/grades")
  return { success: true, data: exam }
}

export async function getExamSessions(examId?: string, classId?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  let query = supabase
    .from("exam_sessions")
    .select(`
      *,
      exams!inner(id, name, exam_type, school_id),
      classes(id, name)
    `)
    .eq("exams.school_id", context.schoolId)
    .order("exam_date", { ascending: false })

  if (examId) {
    query = query.eq("exam_id", examId)
  }

  if (classId) {
    query = query.eq("class_id", classId)
  }

  const { data: sessions, error } = await query

  if (error) {
    return { error: error.message }
  }

  return { data: sessions }
}

export async function createExamSession(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const examId = formData.get("exam_id") as string
  const classId = formData.get("class_id") as string
  const subject = formData.get("subject") as string
  const examDate = formData.get("exam_date") as string || null
  const startTime = formData.get("start_time") as string || null
  const endTime = formData.get("end_time") as string || null
  const maxMarks = formData.get("max_marks") ? parseFloat(formData.get("max_marks") as string) : null

  if (!examId || !classId || !subject) {
    return { error: "Exam, class, and subject are required" }
  }

  // Verify exam belongs to school
  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id, school_id")
    .eq("id", examId)
    .eq("school_id", context.schoolId)
    .single()

  if (examError || !exam) {
    return { error: "Exam not found or access denied" }
  }

  // Verify class belongs to school
  const { data: classData, error: classError } = await supabase
    .from("classes")
    .select("id, school_id")
    .eq("id", classId)
    .eq("school_id", context.schoolId)
    .single()

  if (classError || !classData) {
    return { error: "Class not found or access denied" }
  }

  const { data: session, error } = await supabase
    .from("exam_sessions")
    .insert({
      exam_id: examId,
      class_id: classId,
      subject,
      exam_date: examDate,
      start_time: startTime,
      end_time: endTime,
      max_marks: maxMarks,
    } as any)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/teacher/grades")
  return { success: true, data: session }
}

export async function deleteExam(examId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  // Verify exam belongs to school
  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id, school_id")
    .eq("id", examId)
    .eq("school_id", context.schoolId)
    .single()

  if (examError || !exam) {
    return { error: "Exam not found or access denied" }
  }

  const { error } = await supabase
    .from("exams")
    .delete()
    .eq("id", examId)
    .eq("school_id", context.schoolId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/academic/exams")
  return { success: true }
}

export async function getStudentsByClass(classId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  // Get students enrolled in this class
  const { data: enrollments, error: enrollError } = await supabase
    .from("enrollments")
    .select(`
      student_id,
      students!inner(id, first_name, last_name, admission_number, status)
    `)
    .eq("class_id", classId)
    .eq("students.school_id", context.schoolId)
    .eq("students.status", "active")

  if (enrollError) {
    return { error: enrollError.message }
  }

  const students = (enrollments || []).map((e: any) => ({
    id: e.students.id,
    first_name: e.students.first_name,
    last_name: e.students.last_name,
    admission_number: e.students.admission_number,
  }))

  return { data: students }
}

export async function getExamResults(sessionId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  // Verify session belongs to school
  const { data: session, error: sessionError } = await supabase
    .from("exam_sessions")
    .select(`
      id,
      exams!inner(id, school_id)
    `)
    .eq("id", sessionId)
    .eq("exams.school_id", context.schoolId)
    .single()

  if (sessionError || !session) {
    return { error: "Exam session not found or access denied" }
  }

  const { data: results, error } = await supabase
    .from("exam_results")
    .select(`
      student_id,
      marks_obtained,
      grade,
      remarks
    `)
    .eq("exam_session_id", sessionId)

  if (error) {
    return { error: error.message }
  }

  return { data: results || [] }
}

export async function saveExamResults(sessionId: string, results: Array<{ student_id: string; marks_obtained: number | null; grade?: string | null; remarks?: string | null }>) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  // Get employee ID for entered_by
  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("user_id", user.id)
    .eq("school_id", context.schoolId)
    .single()

  // Verify session belongs to school
  const { data: session, error: sessionError } = await supabase
    .from("exam_sessions")
    .select(`
      id,
      exams!inner(id, school_id)
    `)
    .eq("id", sessionId)
    .eq("exams.school_id", context.schoolId)
    .single()

  if (sessionError || !session) {
    return { error: "Exam session not found or access denied" }
  }

  // Upsert results (insert or update)
  const resultsToInsert = results.map((r) => ({
    exam_session_id: sessionId,
    student_id: r.student_id,
    marks_obtained: r.marks_obtained,
    grade: r.grade || null,
    remarks: r.remarks || null,
    entered_by: (employee as any)?.id || null,
  }))

  const { error: insertError } = await (supabase as any)
    .from("exam_results")
    .upsert(resultsToInsert, {
      onConflict: "exam_session_id,student_id",
    })

  if (insertError) {
    return { error: insertError.message }
  }

  revalidatePath("/dashboard/teacher/grades")
  return { success: true }
}

// ============ Statistics Actions ============

export async function getGradesStatistics(): Promise<GradesStatistics> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Not authenticated")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    throw new Error("No school context")
  }

  // Get all exam sessions for the school first
  const { data: sessions, error: sessionsError } = await supabase
    .from("exam_sessions")
    .select(`
      id,
      max_marks,
      exams!inner(id, school_id)
    `)
    .eq("exams.school_id", context.schoolId)

  if (sessionsError) {
    throw new Error(`Failed to load sessions: ${sessionsError.message}`)
  }

  const sessionIds = ((sessions || []) as any[]).map(s => s.id)
  const totalExams = sessionIds.length

  const { data: results, error: resultsError } = await supabase
    .from("exam_results")
    .select(`
      marks_obtained,
      exam_session_id,
      exam_sessions!inner(max_marks)
    `)
    .in("exam_session_id", sessionIds)
    .not("marks_obtained", "is", null)

  if (resultsError) {
    throw new Error(`Failed to load results: ${resultsError.message}`)
  }

  // Get unique graded sessions
  const gradedSessionIds = new Set(((results || []) as any[]).map(r => r.exam_session_id))
  const gradedExams = gradedSessionIds.size

  // Calculate statistics
  let totalMarks = 0
  let totalMaxMarks = 0
  let topPerformers = 0
  let needSupport = 0
  const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 }

  for (const result of ((results || []) as any[])) {
    const marks = Number(result.marks_obtained || 0)
    const maxMarks = Number((result.exam_sessions as any)?.max_marks || 0)
    
    if (maxMarks > 0) {
      totalMarks += marks
      totalMaxMarks += maxMarks
      const percentage = (marks / maxMarks) * 100

      if (percentage >= 85) topPerformers++
      if (percentage < 50) needSupport++

      if (percentage >= 90) gradeDistribution.A++
      else if (percentage >= 80) gradeDistribution.B++
      else if (percentage >= 70) gradeDistribution.C++
      else if (percentage >= 60) gradeDistribution.D++
      else gradeDistribution.F++
    }
  }

  const averagePercentage = totalMaxMarks > 0 ? (totalMarks / totalMaxMarks) * 100 : 0
  const averageGrade = getGradeFromPercentage(averagePercentage)

  return {
    averageGrade: averageGrade,
    averagePercentage: Math.round(averagePercentage * 10) / 10,
    topPerformersCount: topPerformers,
    needSupportCount: needSupport,
    gradedExamsCount: gradedExams,
    totalExamsCount: totalExams,
    gradeDistribution,
  }
}

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

export async function getTopPerformers(limit: number = 5): Promise<TopPerformer[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Not authenticated")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    throw new Error("No school context")
  }

  // Get exam sessions for the school
  const { data: sessions } = await supabase
    .from("exam_sessions")
    .select(`
      id,
      max_marks,
      class_id,
      classes(id, name),
      exams!inner(school_id)
    `)
    .eq("exams.school_id", context.schoolId)

  const sessionsList = (sessions || []) as any[]
  const sessionIds = sessionsList.map(s => s.id)
  const sessionMap = new Map(sessionsList.map(s => [s.id, s]))

  const { data: results, error } = await supabase
    .from("exam_results")
    .select(`
      student_id,
      marks_obtained,
      exam_session_id,
      students!inner(id, first_name, last_name, admission_number)
    `)
    .in("exam_session_id", sessionIds)
    .not("marks_obtained", "is", null)

  if (error) {
    throw new Error(`Failed to load results: ${error.message}`)
  }

  // Group by student and calculate averages
  const studentMap = new Map<string, {
    id: string
    name: string
    admissionNumber: string | null
    totalMarks: number
    totalMaxMarks: number
    class: string
  }>()

  for (const result of ((results || []) as any[])) {
    const student = result.students
    const session = sessionMap.get(result.exam_session_id) as any
    const marks = Number(result.marks_obtained || 0)
    const maxMarks = Number(session?.max_marks || 0)

    if (!student || !session || maxMarks === 0) continue

    const existing = studentMap.get(student.id) || {
      id: student.id,
      name: `${student.first_name} ${student.last_name}`,
      admissionNumber: student.admission_number,
      totalMarks: 0,
      totalMaxMarks: 0,
      class: (session as any).classes?.name || "Unknown",
    }

    existing.totalMarks += marks
    existing.totalMaxMarks += maxMarks
    studentMap.set(student.id, existing)
  }

  // Calculate averages and sort
  const performers = Array.from(studentMap.values())
    .map((student) => {
      const average = student.totalMaxMarks > 0 
        ? (student.totalMarks / student.totalMaxMarks) * 100 
        : 0
      return {
        ...student,
        average: Math.round(average * 10) / 10,
        grade: getGradeFromPercentage(average),
      }
    })
    .sort((a, b) => b.average - a.average)
    .slice(0, limit)

  return performers
}

export async function getSubjectPerformance(): Promise<SubjectPerformance[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Not authenticated")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    throw new Error("No school context")
  }

  // Get exam sessions for the school
  const { data: sessions } = await supabase
    .from("exam_sessions")
    .select(`
      id,
      subject,
      max_marks,
      exams!inner(school_id)
    `)
    .eq("exams.school_id", context.schoolId)

  const sessionsList2 = (sessions || []) as any[]
  const sessionIds2 = sessionsList2.map(s => s.id)
  const sessionMap2 = new Map(sessionsList2.map(s => [s.id, s]))

  const { data: results2, error } = await supabase
    .from("exam_results")
    .select(`
      student_id,
      marks_obtained,
      exam_session_id
    `)
    .in("exam_session_id", sessionIds2)
    .not("marks_obtained", "is", null)

  if (error) {
    throw new Error(`Failed to load results: ${error.message}`)
  }

  const subjectMap = new Map<string, { totalMarks: number; totalMaxMarks: number; students: Set<string> }>()

  for (const result of ((results2 || []) as any[])) {
    const session = sessionMap2.get(result.exam_session_id) as any
    const subject = session?.subject
    const marks = Number(result.marks_obtained || 0)
    const maxMarks = Number(session?.max_marks || 0)

    if (!subject || maxMarks === 0) continue

    const existing = subjectMap.get(subject) || {
      totalMarks: 0,
      totalMaxMarks: 0,
      students: new Set<string>(),
    }

    existing.totalMarks += marks
    existing.totalMaxMarks += maxMarks
    existing.students.add(result.student_id)
    subjectMap.set(subject, existing)
  }

  // Calculate averages
  const performances = Array.from(subjectMap.entries())
    .map(([subject, data]) => ({
      subject,
      average: data.totalMaxMarks > 0
        ? Math.round((data.totalMarks / data.totalMaxMarks) * 100)
        : 0,
      totalStudents: data.students.size,
    }))
    .sort((a, b) => b.average - a.average)

  return performances
}

// ============ Report Card Generation ============

export async function generateReportCard(studentId: string, termId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  // Get student info
  const { data: student } = await supabase
    .from("students")
    .select("id, first_name, last_name, admission_number, email, status")
    .eq("id", studentId)
    .eq("school_id", context.schoolId)
    .single()

  if (!student) {
    return { error: "Student not found" }
  }

  // Get term info with academic year
  const { data: term } = await supabase
    .from("terms")
    .select("*, academic_years(id, name)")
    .eq("id", termId)
    .eq("school_id", context.schoolId)
    .single()

  if (!term) {
    return { error: "Term not found" }
  }

  const academicYearId = (term as any).academic_year_id

  // Get all exam sessions in this term/academic year
  const { data: examSessions } = await supabase
    .from("exam_sessions")
    .select(`
      id,
      subject,
      max_marks,
      exam_date,
      exams!inner(id, name, exam_type, academic_year_id)
    `)
    .eq("exams.academic_year_id", academicYearId)

  const sessionIds = (examSessions || []).map((s: any) => s.id)

  // Get exam results for this student
  const { data: examResults } = await supabase
    .from("exam_results")
    .select("id, marks_obtained, grade, remarks, exam_session_id")
    .eq("student_id", studentId)
    .in("exam_session_id", sessionIds)

  // Combine results with session info
  const resultsBySubject: { [key: string]: any[] } = {}
  let totalMarks = 0
  let totalMaxMarks = 0

  if (examResults && examSessions) {
    examResults.forEach(result => {
      const session = (examSessions as any[]).find(s => s.id === (result as any).exam_session_id)
      if (session) {
        const subject = (session as any).subject
        if (!resultsBySubject[subject]) {
          resultsBySubject[subject] = []
        }
        resultsBySubject[subject].push({
          ...(result as any),
          sessionInfo: session,
        })
        totalMarks += (result as any).marks_obtained || 0
        totalMaxMarks += (session as any).max_marks || 0
      }
    })
  }

  // Calculate subject averages
  const subjectAverages: { [key: string]: { average: number; maxMarks: number } } = {}
  Object.keys(resultsBySubject).forEach(subject => {
    const results = resultsBySubject[subject]
    const marks = results.map((r: any) => r.marks_obtained).filter((m: any) => m !== null) as number[]
    const maxMarks = results[0]?.sessionInfo?.max_marks || 0
    if (marks.length > 0) {
      subjectAverages[subject] = {
        average: marks.reduce((a: number, b: number) => a + b, 0) / marks.length,
        maxMarks,
      }
    }
  })

  // Calculate overall average
  const overallAverage = totalMaxMarks > 0 ? (totalMarks / totalMaxMarks) * 100 : 0
  const overallGrade = getGradeFromPercentage(overallAverage)

  return {
    success: true,
    data: {
      student,
      term,
      resultsBySubject,
      subjectAverages,
      overallAverage: Math.round(overallAverage * 10) / 10,
      overallGrade,
      totalMarks,
      totalMaxMarks,
    },
  }
}

export async function getClassReportCards(classId: string, termId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  // Verify class belongs to user's school
  const { data: classData } = await supabase
    .from("classes")
    .select("id, name, school_id")
    .eq("id", classId)
    .eq("school_id", context.schoolId)
    .single()

  if (!classData) {
    return { error: "Class not found" }
  }

  // Get term info
  const { data: term } = await supabase
    .from("terms")
    .select("*")
    .eq("id", termId)
    .eq("school_id", context.schoolId)
    .single()

  if (!term) {
    return { error: "Term not found" }
  }

  const academicYearId = (term as any).academic_year_id

  // Get all students enrolled in this class
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("student_id, students(id, first_name, last_name, admission_number)")
    .eq("class_id", classId)

  if (!enrollments || enrollments.length === 0) {
    return { success: true, data: { students: [], term, classInfo: classData } }
  }

  // Get exam sessions for this academic year
  const { data: examSessions } = await supabase
    .from("exam_sessions")
    .select(`
      id,
      subject,
      max_marks,
      exams!inner(academic_year_id)
    `)
    .eq("exams.academic_year_id", academicYearId)

  const sessionIds = (examSessions || []).map((s: any) => s.id)

  // Get all exam results
  const { data: allResults } = await supabase
    .from("exam_results")
    .select("student_id, marks_obtained, exam_session_id")
    .in("exam_session_id", sessionIds)

  // Group data by student
  const studentReports = (enrollments as any[])
    .map(enrollment => {
      const studentResults = (allResults || []).filter((r: any) => r.student_id === enrollment.student_id)
      const marks = studentResults.map((r: any) => r.marks_obtained).filter((m: any) => m !== null) as number[]
      let average = 0
      if (marks.length > 0) {
        average = (marks.reduce((a: number, b: number) => a + b, 0) / marks.length)
      }

      return {
        student: enrollment.students,
        average: Math.round(average * 10) / 10,
        resultsCount: studentResults.length,
        grade: getGradeFromPercentage(average),
      }
    })
    .sort((a, b) => b.average - a.average)

  return {
    success: true,
    data: {
      students: studentReports,
      term,
      classInfo: classData,
    },
  }
}
