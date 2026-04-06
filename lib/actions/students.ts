"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { applyBranchFilter, requireBranchAccess, getDefaultBranchId } from "@/lib/supabase/branch-context"
import { revalidatePath } from "next/cache"

export async function createStudent(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Not authenticated")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    throw new Error("User not associated with any school")
  }

  // Get branch_id from form or default to user's branch
  const branchId = formData.get("branch_id") as string || getDefaultBranchId(context)
  
  // If user is branch-scoped, verify they can only create in their branch
  if (branchId) {
    requireBranchAccess(context, branchId)
  }

  const studentData: any = {
    school_id: context.schoolId,
    branch_id: branchId,
    first_name: formData.get("first_name") as string,
    last_name: formData.get("last_name") as string,
    middle_name: formData.get("middle_name") as string || null,
    dob: formData.get("dob") as string || null,
    gender: formData.get("gender") as string || null,
    admission_number: formData.get("admission_number") as string || null, // Will be auto-generated if null
    status: formData.get("status") as string || "active",
    // Enhanced fields
    religion: formData.get("religion") as string || null,
    blood_group: formData.get("blood_group") as string || null,
    address: formData.get("address") as string || null,
    phone: formData.get("phone") as string || null,
    email: formData.get("email") as string || null,
    city: formData.get("city") as string || null,
    country: formData.get("country") as string || null,
    extra_notes: formData.get("extra_notes") as string || null,
    dob_in_words: formData.get("dob_in_words") as string || null,
    birth_place: formData.get("birth_place") as string || null,
    previous_school_name: formData.get("previous_school_name") as string || null,
    previous_school_address: formData.get("previous_school_address") as string || null,
    previous_school_class: formData.get("previous_school_class") as string || null,
    previous_school_passout_year: formData.get("previous_school_passout_year") ? parseInt(formData.get("previous_school_passout_year") as string) : null,
    admission_date: formData.get("admission_date") as string || null,
    roll_number: formData.get("roll_number") as string || null,
    suspension_reason: formData.get("suspension_reason") as string || null,
    suspension_start_date: formData.get("suspension_start_date") as string || null,
    suspension_end_date: formData.get("suspension_end_date") as string || null,
  }

  const { data: student, error } = await supabase
    .from("students")
    .insert(studentData)
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath("/dashboard/admin/students")
  return student
}

export async function updateStudent(studentId: string, formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Not authenticated")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    throw new Error("User not associated with any school")
  }

  // Verify student belongs to user's school and branch
  const { data: existingStudent, error: existingError } = await supabase
    .from("students")
    .select("school_id, branch_id")
    .eq("id", studentId)
    .single()

  if (existingError || !existingStudent || (existingStudent as any).school_id !== context.schoolId) {
    throw new Error("Student not found or access denied")
  }

  // Check branch access
  requireBranchAccess(context, (existingStudent as any).branch_id)

  const updateData: any = {
    first_name: formData.get("first_name") as string,
    last_name: formData.get("last_name") as string,
    updated_at: new Date().toISOString(),
  }

  // Handle branch_id update (only if user has permission)
  const newBranchId = formData.get("branch_id") as string
  if (newBranchId !== undefined) {
    // School admins can change branch, branch users cannot
    if (context.hasAllBranchesAccess) {
      updateData.branch_id = newBranchId || null
    }
  }

  // Basic fields
  const middleName = formData.get("middle_name") as string
  if (middleName) updateData.middle_name = middleName

  const dob = formData.get("dob") as string
  if (dob) updateData.dob = dob

  const gender = formData.get("gender") as string
  if (gender) updateData.gender = gender

  const status = formData.get("status") as string
  if (status) updateData.status = status

  // Enhanced fields
  const religion = formData.get("religion") as string
  if (religion !== null) updateData.religion = religion || null

  const bloodGroup = formData.get("blood_group") as string
  if (bloodGroup !== null) updateData.blood_group = bloodGroup || null

  const address = formData.get("address") as string
  if (address !== null) updateData.address = address || null

  const phone = formData.get("phone") as string
  if (phone !== null) updateData.phone = phone || null

  const email = formData.get("email") as string
  if (email !== null) updateData.email = email || null

  const city = formData.get("city") as string
  if (city !== null) updateData.city = city || null

  const country = formData.get("country") as string
  if (country !== null) updateData.country = country || null

  const extraNotes = formData.get("extra_notes") as string
  if (extraNotes !== null) updateData.extra_notes = extraNotes || null

  const dobInWords = formData.get("dob_in_words") as string
  if (dobInWords !== null) updateData.dob_in_words = dobInWords || null

  const birthPlace = formData.get("birth_place") as string
  if (birthPlace !== null) updateData.birth_place = birthPlace || null

  const previousSchoolName = formData.get("previous_school_name") as string
  if (previousSchoolName !== null) updateData.previous_school_name = previousSchoolName || null

  const previousSchoolAddress = formData.get("previous_school_address") as string
  if (previousSchoolAddress !== null) updateData.previous_school_address = previousSchoolAddress || null

  const previousSchoolClass = formData.get("previous_school_class") as string
  if (previousSchoolClass !== null) updateData.previous_school_class = previousSchoolClass || null

  const previousSchoolPassoutYear = formData.get("previous_school_passout_year") as string
  if (previousSchoolPassoutYear) updateData.previous_school_passout_year = parseInt(previousSchoolPassoutYear) || null

  const admissionDate = formData.get("admission_date") as string
  if (admissionDate) updateData.admission_date = admissionDate

  const rollNumber = formData.get("roll_number") as string
  if (rollNumber !== null) updateData.roll_number = rollNumber || null

  const suspensionReason = formData.get("suspension_reason") as string
  if (suspensionReason !== null) updateData.suspension_reason = suspensionReason || null

  const suspensionStartDate = formData.get("suspension_start_date") as string
  if (suspensionStartDate) updateData.suspension_start_date = suspensionStartDate

  const suspensionEndDate = formData.get("suspension_end_date") as string
  if (suspensionEndDate) updateData.suspension_end_date = suspensionEndDate

  const { data: student, error } = await supabase
    .from("students")
    // @ts-ignore - Supabase strict type checking
    .update(updateData)
    .eq("id", studentId)
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath("/dashboard/admin/students")
  revalidatePath(`/dashboard/admin/students/${studentId}`)
  return student
}

export async function deleteStudent(studentId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Not authenticated")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    throw new Error("User not associated with any school")
  }

  // Verify student belongs to user's school and branch
  const { data: existingStudent, error: existingError } = await supabase
    .from("students")
    .select("school_id, branch_id")
    .eq("id", studentId)
    .single()

  if (existingError || !existingStudent || (existingStudent as any).school_id !== context.schoolId) {
    throw new Error("Student not found or access denied")
  }

  // Check branch access
  requireBranchAccess(context, (existingStudent as any).branch_id)

  // Soft delete by setting status to 'exited'
  const { error } = await supabase
    .from("students")
    // @ts-ignore - Supabase strict type checking
    .update({ status: "exited", updated_at: new Date().toISOString() })
    .eq("id", studentId)

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath("/dashboard/admin/students")
  return { success: true }
}

export async function getStudent(studentId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Not authenticated")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    throw new Error("User not associated with any school")
  }

  let query = supabase
    .from("students")
    .select("*")
    .eq("id", studentId)
    .eq("school_id", context.schoolId)

  // Apply branch filter if user is branch-scoped
  query = applyBranchFilter(query, context)

  const { data: student, error } = await query.single()

  if (error) {
    throw new Error(error.message)
  }

  return student
}

export async function getStudents(filters?: {
  status?: string
  classId?: string
  search?: string
  limit?: number
  offset?: number
  branchId?: string  // New filter for branch
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Not authenticated")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    throw new Error("User not associated with any school")
  }

  let query = supabase
    .from("students")
    .select("*", { count: "exact" })
    .eq("school_id", context.schoolId)

  // Apply branch filter - either from explicit filter or user's branch scope
  if (filters?.branchId) {
    // Explicit branch filter - verify user can access it
    requireBranchAccess(context, filters.branchId)
    query = query.eq("branch_id", filters.branchId)
  } else {
    // Apply user's branch scope
    query = applyBranchFilter(query, context)
  }

  if (filters?.status) {
    query = query.eq("status", filters.status)
  }

  if (filters?.classId) {
    // Join through enrollments to filter by class
    // First get student IDs from enrollments
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("student_id")
      .eq("class_id", filters.classId)
    
    const studentIds = enrollments?.map((e: any) => e.student_id) || []
    if (studentIds.length > 0) {
      query = query.in("id", studentIds)
    } else {
      // No students in this class, return empty result
      return { students: [], count: 0 }
    }
  }

  if (filters?.search) {
    query = query.or(
      `first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,admission_number.ilike.%${filters.search}%,roll_number.ilike.%${filters.search}%`
    )
  }

  if (filters?.limit) {
    query = query.limit(filters.limit)
  }

  if (filters?.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 20) - 1)
  }

  query = query.order("created_at", { ascending: false })

  const { data: students, error, count } = await query

  if (error) {
    throw new Error(error.message)
  }

  return { students: students || [], count: count || 0 }
}
