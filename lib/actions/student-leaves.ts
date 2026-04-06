"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

export async function getStudentLeaves(filters?: {
  studentId?: string
  status?: string
  leaveType?: string
}) {
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
    .from("student_leaves")
    .select(`
      *,
      student:students!inner(id, first_name, last_name, admission_number, school_id),
      reviewer:employees(id, user_profiles(full_name))
    `)
    .eq("student.school_id", context.schoolId)
  
  if (filters?.studentId) {
    query = query.eq("student_id", filters.studentId)
  }
  
  if (filters?.status) {
    query = query.eq("status", filters.status)
  }
  
  if (filters?.leaveType) {
    query = query.eq("leave_type", filters.leaveType)
  }
  
  const { data: leaves, error } = await query.order("created_at", { ascending: false })
  
  if (error) {
    return { error: error.message }
  }
  
  return { data: leaves }
}

export async function applyForLeave(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }
  
  const studentId = formData.get("student_id") as string
  const leaveType = formData.get("leave_type") as string
  const startDate = formData.get("start_date") as string
  const endDate = formData.get("end_date") as string
  const reason = formData.get("reason") as string
  const academicYearId = formData.get("academic_year_id") as string || null
  const termId = formData.get("term_id") as string || null
  
  if (!studentId || !leaveType || !startDate || !endDate || !reason) {
    return { error: "All fields are required" }
  }
  
  // Verify student belongs to school
  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("id", studentId)
    .eq("school_id", context.schoolId)
    .single()
  
  if (!student) {
    return { error: "Student not found" }
  }
  
  const { data: leave, error } = await supabase
    .from("student_leaves")
    // @ts-ignore
    .insert({
      student_id: studentId,
      leave_type: leaveType,
      start_date: startDate,
      end_date: endDate,
      reason,
      applied_by: user.id,
      academic_year_id: academicYearId,
      term_id: termId,
    } as any)
    .select()
    .single()
  
  if (error) {
    return { error: error.message }
  }
  
  revalidatePath("/dashboard/admin/student-leaves")
  revalidatePath("/dashboard/parent/dashboard")
  return { success: true, data: leave }
}

export async function reviewLeave(leaveId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }
  
  const status = formData.get("status") as string // approved, rejected
  const reviewerRemarks = formData.get("reviewer_remarks") as string || null
  
  if (!status || !["approved", "rejected"].includes(status)) {
    return { error: "Invalid status" }
  }
  
  // Get reviewer's employee ID
  let reviewedBy = null
  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("user_id", user.id)
    .single()
  reviewedBy = (employee as any)?.id || null
  
  const { error } = await supabase
    .from("student_leaves")
    // @ts-ignore
    .update({
      status,
      reviewer_remarks: reviewerRemarks,
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", leaveId)
  
  if (error) {
    return { error: error.message }
  }
  
  revalidatePath("/dashboard/admin/student-leaves")
  return { success: true }
}

export async function cancelLeave(leaveId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const { error } = await supabase
    .from("student_leaves")
    // @ts-ignore
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", leaveId)
    .eq("status", "pending") // Can only cancel pending leaves
  
  if (error) {
    return { error: error.message }
  }
  
  revalidatePath("/dashboard/admin/student-leaves")
  revalidatePath("/dashboard/parent/dashboard")
  return { success: true }
}

export async function deleteLeave(leaveId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const { error } = await supabase
    .from("student_leaves")
    .delete()
    .eq("id", leaveId)
  
  if (error) {
    return { error: error.message }
  }
  
  revalidatePath("/dashboard/admin/student-leaves")
  return { success: true }
}

export async function getLeaveStats() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }
  
  const [
    { count: pendingCount },
    { count: approvedCount },
    { count: rejectedCount },
  ] = await Promise.all([
    supabase
      .from("student_leaves")
      .select("id, student:students!inner(school_id)", { count: "exact", head: true })
      .eq("student.school_id", context.schoolId)
      .eq("status", "pending"),
    supabase
      .from("student_leaves")
      .select("id, student:students!inner(school_id)", { count: "exact", head: true })
      .eq("student.school_id", context.schoolId)
      .eq("status", "approved"),
    supabase
      .from("student_leaves")
      .select("id, student:students!inner(school_id)", { count: "exact", head: true })
      .eq("student.school_id", context.schoolId)
      .eq("status", "rejected"),
  ])
  
  return {
    data: {
      pending: pendingCount || 0,
      approved: approvedCount || 0,
      rejected: rejectedCount || 0,
    }
  }
}


