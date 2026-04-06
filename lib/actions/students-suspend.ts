"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

export interface SuspendStudentOptions {
  studentId: string
  reason: string
  startDate: string
  endDate?: string
}

export async function suspendStudent(options: SuspendStudentOptions) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Unauthorized" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context found" }
  }

  // Verify student belongs to school
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id, school_id")
    .eq("id", options.studentId)
    .eq("school_id", context.schoolId)
    .single()

  if (studentError || !student) {
    return { error: "Student not found" }
  }

  // Update student status and suspension fields
  const { error: updateError } = await supabase
    .from("students")
    // @ts-ignore - Supabase strict type checking
    .update({
      status: "suspended",
      suspension_reason: options.reason,
      suspension_start_date: options.startDate,
      suspension_end_date: options.endDate,
      updated_at: new Date().toISOString(),
    })
    .eq("id", options.studentId)

  if (updateError) {
    return { error: updateError.message }
  }

  // Create suspension record
  const { data: suspension, error: suspensionError } = await supabase
    .from("student_suspensions")
    // @ts-ignore - Supabase strict type checking
    .insert({
      student_id: options.studentId,
      reason: options.reason,
      start_date: options.startDate,
      end_date: options.endDate,
      status: "active",
      created_by: user.id,
    })
    .select()
    .single()

  if (suspensionError) {
    return { error: suspensionError.message }
  }

  revalidatePath("/dashboard/admin/students")
  revalidatePath(`/dashboard/admin/students/${options.studentId}`)
  return { data: suspension }
}

export async function revokeSuspension(suspensionId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Unauthorized" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context found" }
  }

  // Get suspension and verify student belongs to school
  const { data: suspension, error: suspensionError } = await supabase
    .from("student_suspensions")
    .select("id, student_id, students!inner(school_id)")
    .eq("id", suspensionId)
    .single()

  if (suspensionError || !suspension) {
    return { error: "Suspension not found" }
  }

  const suspensionData = suspension as any
  const student = suspensionData.students as any
  if (student?.school_id !== context.schoolId) {
    return { error: "Access denied" }
  }

  // Update suspension status
  const { error: updateError } = await supabase
    .from("student_suspensions")
    // @ts-ignore - Supabase strict type checking
    .update({
      status: "revoked",
      updated_at: new Date().toISOString(),
    })
    .eq("id", suspensionId)

  if (updateError) {
    return { error: updateError.message }
  }

  // Update student status back to active
  const { error: studentUpdateError } = await supabase
    .from("students")
    // @ts-ignore - Supabase strict type checking
    .update({
      status: "active",
      suspension_reason: null,
      suspension_start_date: null,
      suspension_end_date: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", suspensionData.student_id)

  if (studentUpdateError) {
    return { error: studentUpdateError.message }
  }

  revalidatePath("/dashboard/admin/students")
  revalidatePath(`/dashboard/admin/students/${(suspension as any).student_id}`)
  return { success: true }
}

export async function getStudentSuspensions(studentId?: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Unauthorized" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context found" }
  }

  let query = supabase
    .from("student_suspensions")
    .select(`
      *,
      students!inner(id, first_name, last_name, admission_number, school_id)
    `)
    .eq("students.school_id", context.schoolId)
    .order("start_date", { ascending: false })

  if (studentId) {
    query = query.eq("student_id", studentId)
  }

  const { data: suspensions, error } = await query

  if (error) {
    return { error: error.message }
  }

  return { data: suspensions }
}

