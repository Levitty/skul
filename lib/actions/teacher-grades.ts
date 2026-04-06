"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

// ============ Get Teacher's Assigned Classes ============

export async function getTeacherAssignedClasses(teacherId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  // Verify teacher belongs to school
  const { data: teacher, error: teacherError } = await supabase
    .from("employees")
    .select("school_id")
    .eq("id", teacherId)
    .single()

  if (teacherError || !teacher || (teacher as any).school_id !== context.schoolId) {
    return { error: "Teacher not found or access denied" }
  }

  // Get unique classes where teacher teaches
  const { data: entries, error } = await supabase
    .from("timetable_entries")
    .select(`
      class_id,
      subject,
      classes(id, name, level),
      subjects(id, name, code)
    `)
    .eq("teacher_id", teacherId)
    .order("classes(name)", { ascending: true })

  if (error) {
    return { error: error.message }
  }

  // Create unique list of classes with their subjects
  const classMap = new Map()
  for (const entry of entries || []) {
    const classKey = entry.class_id
    if (!classMap.has(classKey)) {
      classMap.set(classKey, {
        ...entry.classes,
        subjects: [],
      })
    }
    classMap.get(classKey).subjects.push(entry.subject)
  }

  return { data: Array.from(classMap.values()) }
}

// ============ Get Exams ============

export async function getExamsForGradeEntry(academicYearId?: string) {
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
    .select("id, name, exam_type, weight")
    .eq("school_id", context.schoolId)

  if (academicYearId) {
    query = query.eq("academic_year_id", academicYearId)
  }

  const { data: exams, error } = await query.order("name", { ascending: true })

  if (error) {
    return { error: error.message }
  }

  return { data: exams || [] }
}

// ============ Get or Create Exam Session ============

export async function getOrCreateExamSession(
  examId: string,
  classId: string,
  subject: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  // Verify exam and class belong to school
  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("school_id")
    .eq("id", examId)
    .single()

  if (examError || !exam || (exam as any).school_id !== context.schoolId) {
    return { error: "Exam not found or access denied" }
  }

  const { data: classData, error: classError } = await supabase
    .from("classes")
    .select("school_id")
    .eq("id", classId)
    .single()

  if (classError || !classData || (classData as any).school_id !== context.schoolId) {
    return { error: "Class not found or access denied" }
  }

  // Check if session exists
  const { data: existingSession } = await supabase
    .from("exam_sessions")
    .select("*")
    .eq("exam_id", examId)
    .eq("class_id", classId)
    .eq("subject", subject)
    .maybeSingle()

  if (existingSession) {
    return { data: existingSession }
  }

  // Create new session
  const { data: newSession, error: createError } = await supabase
    .from("exam_sessions")
    .insert({
      exam_id: examId,
      class_id: classId,
      subject: subject,
      max_marks: 100,
    } as any)
    .select()
    .single()

  if (createError) {
    return { error: createError.message }
  }

  return { data: newSession }
}

// ============ Get Students in Class with Existing Grades ============

export async function getStudentsForGradeEntry(
  classId: string,
  examSessionId: string,
  academicYearId: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  // Verify class belongs to school
  const { data: classData, error: classError } = await supabase
    .from("classes")
    .select("school_id")
    .eq("id", classId)
    .single()

  if (classError || !classData || (classData as any).school_id !== context.schoolId) {
    return { error: "Class not found or access denied" }
  }

  // Get enrolled students
  const { data: enrollments, error: enrollError } = await supabase
    .from("enrollments")
    .select(`
      student_id,
      students(id, first_name, last_name, admission_number)
    `)
    .eq("class_id", classId)
    .eq("academic_year_id", academicYearId)
    .order("students(admission_number)", { ascending: true })

  if (enrollError) {
    return { error: enrollError.message }
  }

  // Get existing grades for this exam session
  const { data: existingGrades } = await supabase
    .from("exam_results")
    .select("student_id, marks_obtained, grade, remarks")
    .eq("exam_session_id", examSessionId)

  const gradeMap = new Map(
    (existingGrades || []).map(g => [g.student_id, g])
  )

  const students = (enrollments || []).map((e: any) => ({
    ...e.students,
    existingGrade: gradeMap.get(e.students.id) || null,
  }))

  return { data: students }
}

// ============ Save Grade Entries ============

export async function saveGradeEntries(
  examSessionId: string,
  grades: Array<{
    student_id: string
    marks_obtained: number | null
    grade: string
    remarks?: string | null
  }>
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  // Verify exam session belongs to school
  const { data: session, error: sessionError } = await supabase
    .from("exam_sessions")
    .select(`
      id,
      exam_id,
      class_id,
      exams!inner(school_id)
    `)
    .eq("id", examSessionId)
    .single()

  if (sessionError || !session) {
    return { error: "Exam session not found" }
  }

  const sessionData = session as any
  if (sessionData.exams?.school_id !== context.schoolId) {
    return { error: "Access denied" }
  }

  // Filter grades with marks
  const gradesToSave = grades.filter(g => g.marks_obtained !== null)

  if (gradesToSave.length === 0) {
    return { error: "No grades to save" }
  }

  // Check for existing grades and prepare insert/update data
  const { data: existingGrades } = await supabase
    .from("exam_results")
    .select("id, student_id")
    .eq("exam_session_id", examSessionId)

  const existingMap = new Map(
    (existingGrades || []).map(g => [g.student_id, g.id])
  )

  const toInsert = []
  const toUpdate = []

  for (const grade of gradesToSave) {
    const gradeData = {
      exam_session_id: examSessionId,
      student_id: grade.student_id,
      marks_obtained: grade.marks_obtained,
      grade: grade.grade,
      remarks: grade.remarks || null,
      entered_by: user.id,
      updated_at: new Date().toISOString(),
    }

    if (existingMap.has(grade.student_id)) {
      toUpdate.push({
        id: existingMap.get(grade.student_id),
        ...gradeData,
      })
    } else {
      toInsert.push(gradeData)
    }
  }

  // Insert new grades
  if (toInsert.length > 0) {
    const { error: insertError } = await supabase
      .from("exam_results")
      .insert(toInsert as any)

    if (insertError) {
      return { error: insertError.message }
    }
  }

  // Update existing grades
  for (const grade of toUpdate) {
    const { id, ...updateData } = grade
    const { error: updateError } = await supabase
      .from("exam_results")
      .update(updateData as any)
      .eq("id", id)

    if (updateError) {
      return { error: updateError.message }
    }
  }

  // Calculate statistics
  const marks = gradesToSave
    .map(g => g.marks_obtained)
    .filter(m => m !== null) as number[]

  const stats = {
    count: marks.length,
    average: marks.length > 0 ? (marks.reduce((a, b) => a + b, 0) / marks.length).toFixed(1) : 0,
    highest: marks.length > 0 ? Math.max(...marks) : 0,
    lowest: marks.length > 0 ? Math.min(...marks) : 0,
    passRate: marks.length > 0 ? ((marks.filter(m => m >= 50).length / marks.length) * 100).toFixed(1) : 0,
  }

  revalidatePath("/dashboard/teacher/grades/enter")
  return { success: true, stats }
}

// ============ Get Exam Session Details ============

export async function getExamSessionDetails(examSessionId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const { data: session, error } = await supabase
    .from("exam_sessions")
    .select(`
      *,
      exams(id, name, exam_type),
      classes(id, name)
    `)
    .eq("id", examSessionId)
    .single()

  if (error || !session) {
    return { error: "Exam session not found" }
  }

  const sessionData = session as any

  // Verify school access
  const { data: exam } = await supabase
    .from("exams")
    .select("school_id")
    .eq("id", sessionData.exam_id)
    .single()

  if (!exam || (exam as any).school_id !== context.schoolId) {
    return { error: "Access denied" }
  }

  return { data: sessionData }
}

// ============ Get Current Academic Year ============

export async function getCurrentAcademicYear() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const { data: year, error } = await supabase
    .from("academic_years")
    .select("id, name")
    .eq("school_id", context.schoolId)
    .eq("is_current", true)
    .single()

  if (error) {
    return { error: error.message }
  }

  return { data: year }
}
