"use server"

import { createClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

// ============================================================================
// Types
// ============================================================================

interface ReportCard {
  id: string
  studentId: string
  studentName: string
  admissionNumber: string
  className: string
  termName: string
  academicYear: string
  overallPercentage: number
  overallGrade: string
  classRank: number
  classSize: number
  attendancePresent: number
  attendanceTotal: number
  attendancePercentage: number
  teacherRemarks: string | null
  principalRemarks: string | null
  pdfUrl: string | null
  status: "draft" | "published" | "sent"
  subjects: ReportCardSubject[]
}

interface ReportCardSubject {
  subjectName: string
  marksObtained: number
  maxMarks: number
  percentage: number
  grade: string
  teacherName?: string
}

// ============================================================================
// Grade calculation helper
// ============================================================================

function calculateGrade(percentage: number): string {
  if (percentage >= 80) return "A"
  if (percentage >= 70) return "B"
  if (percentage >= 60) return "C"
  if (percentage >= 50) return "D"
  if (percentage >= 40) return "E"
  return "F"
}

// ============================================================================
// Generate Report Cards for a Class
// ============================================================================

/**
 * Aggregates exam results for every student in a class for the given term,
 * calculates ranks, attendance, and inserts draft report cards.
 */
export async function generateReportCards(classId: string, termId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated", data: null }

  const context = await requireTenantContext(user.id)
  if (!context) return { error: "No school context", data: null }

  // Verify class belongs to school
  const { data: classInfo } = await supabase
    .from("classes")
    .select("id, name")
    .eq("id", classId)
    .eq("school_id", context.schoolId)
    .single()

  if (!classInfo) return { error: "Class not found", data: null }

  // Get term + academic year info
  const { data: termInfo } = await supabase
    .from("terms")
    .select("id, name, academic_year_id, academic_years(id, name)")
    .eq("id", termId)
    .eq("school_id", context.schoolId)
    .single()

  if (!termInfo) return { error: "Term not found", data: null }

  const academicYearId = (termInfo as any).academic_year_id

  // Get all enrolled students in this class for this academic year
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("student_id, students(id, first_name, last_name, admission_number)")
    .eq("class_id", classId)
    .eq("academic_year_id", academicYearId)

  if (!enrollments || enrollments.length === 0) {
    return { error: "No students enrolled in this class", data: null }
  }

  // Get all exam sessions for this class in exams that belong to this academic year
  const { data: sessions } = await supabase
    .from("exam_sessions")
    .select(`
      id, subject, max_marks,
      exams!inner(id, name, exam_type, academic_year_id, school_id),
      exam_results(student_id, marks_obtained, grade)
    `)
    .eq("class_id", classId)
    .eq("exams.academic_year_id", academicYearId)
    .eq("exams.school_id", context.schoolId)

  if (!sessions || sessions.length === 0) {
    return { error: "No exam results found for this class and term", data: null }
  }

  // Build per-student subject aggregations
  // Map: studentId → { subjectName → { totalMarks, totalMax } }
  const studentSubjects: Record<string, Record<string, { marks: number; max: number }>> = {}

  for (const session of sessions) {
    const subjectName = (session as any).subject
    const maxMarks = Number((session as any).max_marks || 0)

    for (const result of (session as any).exam_results || []) {
      const studentId = result.student_id
      const marks = Number(result.marks_obtained || 0)

      if (!studentSubjects[studentId]) studentSubjects[studentId] = {}
      if (!studentSubjects[studentId][subjectName]) {
        studentSubjects[studentId][subjectName] = { marks: 0, max: 0 }
      }

      studentSubjects[studentId][subjectName].marks += marks
      studentSubjects[studentId][subjectName].max += maxMarks
    }
  }

  // Calculate overall percentage per student and rank them
  const studentTotals: { studentId: string; percentage: number }[] = []

  for (const enrollment of enrollments) {
    const student = (enrollment as any).students
    const studentId = student.id
    const subjects = studentSubjects[studentId] || {}

    let totalMarks = 0
    let totalMax = 0
    for (const subj of Object.values(subjects)) {
      totalMarks += subj.marks
      totalMax += subj.max
    }

    const percentage = totalMax > 0 ? Math.round((totalMarks / totalMax) * 10000) / 100 : 0
    studentTotals.push({ studentId, percentage })
  }

  // Sort by percentage descending for ranking
  studentTotals.sort((a, b) => b.percentage - a.percentage)

  // Get attendance for all students in this term
  const { data: attendanceData } = await supabase
    .from("attendance_records")
    .select("student_id, status")
    .eq("school_id", context.schoolId)
    .in("student_id", enrollments.map(e => (e as any).student_id))
    .gte("date", (termInfo as any).start_date || "2000-01-01")
    .lte("date", (termInfo as any).end_date || "2099-12-31")

  // Build attendance map: studentId → { present, total }
  const attendanceMap: Record<string, { present: number; total: number }> = {}
  for (const record of attendanceData || []) {
    const sid = (record as any).student_id
    if (!attendanceMap[sid]) attendanceMap[sid] = { present: 0, total: 0 }
    attendanceMap[sid].total += 1
    if ((record as any).status === "present" || (record as any).status === "late") {
      attendanceMap[sid].present += 1
    }
  }

  // Find subject teachers from timetable_entries
  const { data: timetableEntries } = await supabase
    .from("timetable_entries")
    .select("subject, teacher_id, employees(id, first_name, last_name)")
    .eq("class_id", classId)

  const subjectTeachers: Record<string, { id: string; name: string }> = {}
  for (const entry of timetableEntries || []) {
    const subj = (entry as any).subject
    const teacher = (entry as any).employees
    if (subj && teacher) {
      subjectTeachers[subj] = {
        id: teacher.id,
        name: `${teacher.first_name} ${teacher.last_name}`,
      }
    }
  }

  const classSize = enrollments.length

  // Delete existing draft report cards for this class+term (regeneration)
  await supabase
    .from("report_cards")
    .delete()
    .eq("class_id", classId)
    .eq("term_id", termId)
    .eq("status", "draft")

  // Insert report cards
  let generatedCount = 0

  for (let rank = 0; rank < studentTotals.length; rank++) {
    const { studentId, percentage } = studentTotals[rank]
    const subjects = studentSubjects[studentId] || {}
    const attendance = attendanceMap[studentId] || { present: 0, total: 0 }
    const attendancePct = attendance.total > 0
      ? Math.round((attendance.present / attendance.total) * 100)
      : 0

    // Insert the report card
    const { data: reportCard, error: rcError } = await (supabase as any)
      .from("report_cards")
      .upsert({
        school_id: context.schoolId,
        student_id: studentId,
        class_id: classId,
        academic_year_id: academicYearId,
        term_id: termId,
        overall_percentage: percentage,
        overall_grade: calculateGrade(percentage),
        class_rank: rank + 1,
        class_size: classSize,
        attendance_present: attendance.present,
        attendance_total: attendance.total,
        attendance_percentage: attendancePct,
        status: "draft",
      }, { onConflict: "student_id,academic_year_id,term_id" })
      .select("id")
      .single()

    if (rcError || !reportCard) {
      console.error(`[ReportCards] Failed for student ${studentId}:`, rcError)
      continue
    }

    // Delete old subject rows and insert fresh ones
    await supabase
      .from("report_card_subjects")
      .delete()
      .eq("report_card_id", (reportCard as any).id)

    const subjectRows = Object.entries(subjects).map(([subjectName, data]) => ({
      report_card_id: (reportCard as any).id,
      subject_name: subjectName,
      marks_obtained: data.marks,
      max_marks: data.max,
      percentage: data.max > 0 ? Math.round((data.marks / data.max) * 10000) / 100 : 0,
      grade: calculateGrade(data.max > 0 ? (data.marks / data.max) * 100 : 0),
      teacher_id: subjectTeachers[subjectName]?.id || null,
    }))

    if (subjectRows.length > 0) {
      await (supabase as any).from("report_card_subjects").insert(subjectRows)
    }

    generatedCount++
  }

  revalidatePath("/dashboard/teacher/grades")

  return {
    data: { generatedCount, classSize, className: (classInfo as any).name },
    error: null,
  }
}

// ============================================================================
// Get Report Cards
// ============================================================================

export async function getClassReportCards(classId: string, termId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated", data: null }

  const context = await requireTenantContext(user.id)
  if (!context) return { error: "No school context", data: null }

  const { data, error } = await supabase
    .from("report_cards")
    .select(`
      *,
      students(id, first_name, last_name, admission_number),
      classes(id, name),
      terms(id, name),
      academic_years(id, name),
      report_card_subjects(*)
    `)
    .eq("class_id", classId)
    .eq("term_id", termId)
    .eq("school_id", context.schoolId)
    .order("class_rank", { ascending: true })

  if (error) return { error: error.message, data: null }

  return { data, error: null }
}

export async function getReportCard(studentId: string, termId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated", data: null }

  const context = await requireTenantContext(user.id)
  if (!context) return { error: "No school context", data: null }

  const { data, error } = await supabase
    .from("report_cards")
    .select(`
      *,
      students(id, first_name, last_name, admission_number),
      classes(id, name),
      terms(id, name),
      academic_years(id, name),
      report_card_subjects(
        *,
        employees(id, first_name, last_name)
      )
    `)
    .eq("student_id", studentId)
    .eq("term_id", termId)
    .eq("school_id", context.schoolId)
    .single()

  if (error) return { error: error.message, data: null }

  return { data, error: null }
}

// ============================================================================
// Remarks
// ============================================================================

export async function addTeacherRemarks(reportCardId: string, remarks: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated" }

  const { error } = await (supabase as any)
    .from("report_cards")
    .update({ teacher_remarks: remarks })
    .eq("id", reportCardId)

  if (error) return { error: error.message }
  return { error: null }
}

export async function addPrincipalRemarks(reportCardId: string, remarks: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated" }

  const { error } = await (supabase as any)
    .from("report_cards")
    .update({ principal_remarks: remarks })
    .eq("id", reportCardId)

  if (error) return { error: error.message }
  return { error: null }
}

// ============================================================================
// Publish Report Cards
// ============================================================================

export async function publishReportCards(classId: string, termId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated", data: null }

  const context = await requireTenantContext(user.id)
  if (!context) return { error: "No school context", data: null }

  const { data, error } = await (supabase as any)
    .from("report_cards")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
    })
    .eq("class_id", classId)
    .eq("term_id", termId)
    .eq("school_id", context.schoolId)
    .eq("status", "draft")
    .select("id")

  if (error) return { error: error.message, data: null }

  revalidatePath("/dashboard/teacher/grades")

  return { data: { publishedCount: data?.length || 0 }, error: null }
}

// ============================================================================
// Send Report Card to Parent via WhatsApp
// ============================================================================

export async function sendReportCardToParent(reportCardId: string) {
  const supabase = createServiceRoleClient() as any

  const { data: reportCard, error } = await supabase
    .from("report_cards")
    .select(`
      *,
      students(id, first_name, last_name, admission_number),
      classes(id, name),
      terms(id, name),
      academic_years(id, name)
    `)
    .eq("id", reportCardId)
    .single()

  if (error || !reportCard) {
    return { error: "Report card not found" }
  }

  const student = (reportCard as any).students
  const term = (reportCard as any).terms
  const className = (reportCard as any).classes?.name

  // Get primary guardian phone
  const { data: guardian } = await supabase
    .from("guardians")
    .select("id, name, phone")
    .eq("student_id", student.id)
    .eq("is_primary", true)
    .single()

  if (!guardian || !(guardian as any).phone) {
    return { error: "No guardian phone number found" }
  }

  // If there's a PDF URL, send as media; otherwise send summary text
  const pdfUrl = (reportCard as any).pdf_url

  if (pdfUrl) {
    // Import dynamically to avoid circular deps
    const { WhatsAppClient } = await import("@/lib/integrations/whatsapp")
    const whatsapp = new WhatsAppClient({
      accountSid: process.env.TWILIO_ACCOUNT_SID!,
      authToken: process.env.TWILIO_AUTH_TOKEN!,
      whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER!,
    })

    await whatsapp.sendMedia(
      (guardian as any).phone,
      pdfUrl,
      `Report Card: ${student.first_name} ${student.last_name} — ${className} ${term?.name}`
    )
  } else {
    // Send text summary
    const { WhatsAppClient } = await import("@/lib/integrations/whatsapp")
    const whatsapp = new WhatsAppClient({
      accountSid: process.env.TWILIO_ACCOUNT_SID!,
      authToken: process.env.TWILIO_AUTH_TOKEN!,
      whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER!,
    })

    const message = [
      `📋 Report Card — ${student.first_name} ${student.last_name}`,
      `Class: ${className} | ${term?.name}`,
      `Overall: ${(reportCard as any).overall_percentage}% (Grade ${(reportCard as any).overall_grade})`,
      `Rank: ${(reportCard as any).class_rank} of ${(reportCard as any).class_size}`,
      `Attendance: ${(reportCard as any).attendance_percentage}%`,
      (reportCard as any).teacher_remarks ? `\nRemarks: ${(reportCard as any).teacher_remarks}` : "",
    ].filter(Boolean).join("\n")

    await whatsapp.sendMessage({
      to: (guardian as any).phone,
      body: message,
    })
  }

  // Mark as sent
  await supabase
    .from("report_cards")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", reportCardId)

  return { error: null }
}
