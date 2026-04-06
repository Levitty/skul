"use server"

import { createClient } from "@/lib/supabase/server"

export async function getParentChildren(guardianId: string) {
  const supabase = await createClient()

  const { data: children, error } = await (supabase as any)
    .from("students")
    .select(
      `
      id,
      first_name,
      last_name,
      admission_number,
      photo_url,
      gender,
      dob,
      enrollments (
        id,
        sections (name),
        classes (name)
      )
    `
    )
    .eq("guardians.id", guardianId)
    .order("enrollments.created_at", { ascending: false })

  if (error) {
    console.error("Error fetching children:", error)
    return []
  }

  return (children as any[]) || []
}

export async function getChildFees(studentId: string) {
  const supabase = await createClient()

  const { data: invoices, error } = await (supabase as any)
    .from("invoices")
    .select("*, invoice_items(*), payments(*)")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching child fees:", error)
    return { invoices: [], summary: { totalInvoiced: 0, totalPaid: 0, balance: 0 } }
  }

  const invoiceList = (invoices as any[]) || []

  const summary = {
    totalInvoiced: 0,
    totalPaid: 0,
    balance: 0,
  }

  for (const inv of invoiceList) {
    const amt = Number(inv.amount) || 0
    summary.totalInvoiced += amt
    if (inv.status === "paid") {
      summary.totalPaid += amt
    } else if (inv.status === "partial") {
      summary.totalPaid += amt * 0.5
    }
  }

  summary.balance = summary.totalInvoiced - summary.totalPaid

  return { invoices: invoiceList, summary }
}

export async function getChildGrades(studentId: string) {
  const supabase = await createClient()

  const { data: results, error } = await (supabase as any)
    .from("exam_results")
    .select("*, exam_sessions(subject, exam_date, max_marks, exams(name))")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching child grades:", error)
    return []
  }

  return (results as any[]) || []
}

export async function getChildAttendance(studentId: string) {
  const supabase = await createClient()

  const { data: records, error } = await (supabase as any)
    .from("attendance_records")
    .select("*, students(first_name, last_name)")
    .eq("student_id", studentId)
    .order("attendance_date", { ascending: false })

  if (error) {
    console.error("Error fetching child attendance:", error)
    return []
  }

  return (records as any[]) || []
}

export async function getParentGuardianInfo(userId: string) {
  const supabase = await createClient()

  // First get the guardian record linked to this user
  // Since guardians may not have user_id yet, we'll need to find them through their related students
  const { data: students, error: studentsError } = await (supabase as any)
    .from("students")
    .select(
      `
      id,
      guardians (
        id,
        name,
        email,
        phone,
        relation,
        is_primary
      )
    `
    )
    .eq("user_id", userId)

  if (studentsError) {
    console.error("Error fetching guardian info:", studentsError)
    return null
  }

  const studentList = (students as any[]) || []

  if (studentList.length === 0) {
    return null
  }

  // Get the primary guardian from the first student
  const guardians = studentList[0].guardians || []
  const primaryGuardian = guardians.find((g: any) => g.is_primary) || guardians[0]

  if (!primaryGuardian) {
    return null
  }

  return {
    id: primaryGuardian.id,
    name: primaryGuardian.name,
    email: primaryGuardian.email,
    phone: primaryGuardian.phone,
    relation: primaryGuardian.relation,
  }
}

export async function getAllChildrenForGuardian(userId: string) {
  const supabase = await createClient()

  // Get all students where the current user is a guardian
  const { data: students, error } = await (supabase as any)
    .from("students")
    .select(
      `
      id,
      first_name,
      last_name,
      admission_number,
      photo_url,
      gender,
      dob,
      enrollments (
        id,
        sections (name),
        classes (name)
      ),
      guardians (
        id,
        name,
        is_primary
      )
    `
    )
    .eq("user_id", userId)
    .order("first_name", { ascending: true })

  if (error) {
    console.error("Error fetching all children:", error)
    return []
  }

  return (students as any[]) || []
}

export async function getChildFeesById(studentId: string) {
  const supabase = await createClient()

  const { data: student, error: studentError } = await (supabase as any)
    .from("students")
    .select("first_name, last_name, admission_number")
    .eq("id", studentId)
    .single()

  if (studentError) {
    console.error("Error fetching student:", studentError)
    return null
  }

  const { data: invoices, error: invoicesError } = await (supabase as any)
    .from("invoices")
    .select("*, invoice_items(*), payments(*)")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })

  if (invoicesError) {
    console.error("Error fetching invoices:", invoicesError)
    return null
  }

  const invoiceList = (invoices as any[]) || []

  const summary = {
    totalInvoiced: 0,
    totalPaid: 0,
    balance: 0,
  }

  for (const inv of invoiceList) {
    const amt = Number(inv.amount) || 0
    summary.totalInvoiced += amt
    if (inv.status === "paid") {
      summary.totalPaid += amt
    } else if (inv.status === "partial") {
      summary.totalPaid += amt * 0.5
    }
  }

  summary.balance = summary.totalInvoiced - summary.totalPaid

  return {
    student,
    invoices: invoiceList,
    summary,
  }
}

export async function getChildGradesById(studentId: string) {
  const supabase = await createClient()

  const { data: student, error: studentError } = await (supabase as any)
    .from("students")
    .select("first_name, last_name, admission_number")
    .eq("id", studentId)
    .single()

  if (studentError) {
    console.error("Error fetching student:", studentError)
    return null
  }

  const { data: results, error: resultsError } = await (supabase as any)
    .from("exam_results")
    .select("*, exam_sessions(subject, exam_date, max_marks, exams(name))")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })

  if (resultsError) {
    console.error("Error fetching grades:", resultsError)
    return null
  }

  return {
    student,
    grades: (results as any[]) || [],
  }
}

export async function getChildAttendanceById(studentId: string) {
  const supabase = await createClient()

  const { data: student, error: studentError } = await (supabase as any)
    .from("students")
    .select("first_name, last_name, admission_number")
    .eq("id", studentId)
    .single()

  if (studentError) {
    console.error("Error fetching student:", studentError)
    return null
  }

  const { data: records, error: recordsError } = await (supabase as any)
    .from("attendance_records")
    .select("*")
    .eq("student_id", studentId)
    .order("attendance_date", { ascending: false })

  if (recordsError) {
    console.error("Error fetching attendance:", recordsError)
    return null
  }

  const attendanceList = (records as any[]) || []

  // Calculate summary
  const summary = {
    present: 0,
    absent: 0,
    late: 0,
    total: attendanceList.length,
  }

  for (const record of attendanceList) {
    if (record.status === "present") {
      summary.present++
    } else if (record.status === "absent") {
      summary.absent++
    } else if (record.status === "late") {
      summary.late++
    }
  }

  return {
    student,
    records: attendanceList,
    summary,
  }
}
