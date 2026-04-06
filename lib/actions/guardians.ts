"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

export async function createGuardian(studentId: string, formData: FormData) {
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

  // Verify student belongs to user's school
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("school_id")
    .eq("id", studentId)
    .single()

  if (studentError || !student || (student as any).school_id !== context.schoolId) {
    throw new Error("Student not found or access denied")
  }

  const guardianData = {
    student_id: studentId,
    name: formData.get("name") as string,
    relation: formData.get("relation") as string,
    phone: formData.get("phone") as string || null,
    email: formData.get("email") as string || null,
    is_primary: formData.get("is_primary") === "true",
    is_billing_contact: formData.get("is_billing_contact") === "true",
  }

  // If this is primary, unset other primary guardians
  if (guardianData.is_primary) {
    // @ts-ignore - Supabase strict type checking
    await supabase.from("guardians").update({ is_primary: false }).eq("student_id", studentId)
  }

  // If this is billing contact, unset other billing contacts
  if (guardianData.is_billing_contact) {
    // @ts-ignore - Supabase strict type checking
    await supabase.from("guardians").update({ is_billing_contact: false }).eq("student_id", studentId)
  }

  const { data: guardian, error } = await supabase
    .from("guardians")
    // @ts-ignore - Supabase strict type checking
    .insert(guardianData)
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath(`/dashboard/admin/students/${studentId}`)
  return guardian
}

export async function updateGuardian(guardianId: string, studentId: string, formData: FormData) {
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

  // Verify guardian belongs to a student in user's school
  const { data: guardian, error: guardianError } = await supabase
    .from("guardians")
    .select("student_id, students!inner(school_id)")
    .eq("id", guardianId)
    .single()

  if (guardianError || !guardian) {
    throw new Error("Guardian not found or access denied")
  }

  const guardianData = guardian as any
  if (guardianData.students?.school_id !== context.schoolId) {
    throw new Error("Guardian not found or access denied")
  }

  const updateData: any = {
    name: formData.get("name") as string,
    relation: formData.get("relation") as string,
    updated_at: new Date().toISOString(),
  }

  const phone = formData.get("phone") as string
  if (phone) updateData.phone = phone

  const email = formData.get("email") as string
  if (email) updateData.email = email

  updateData.is_primary = formData.get("is_primary") === "true"
  updateData.is_billing_contact = formData.get("is_billing_contact") === "true"

  // Handle primary/billing contact uniqueness
  if (updateData.is_primary) {
    // @ts-ignore - Supabase strict type checking
    await supabase.from("guardians").update({ is_primary: false }).eq("student_id", studentId).neq("id", guardianId)
  }

  if (updateData.is_billing_contact) {
    // @ts-ignore - Supabase strict type checking
    await supabase.from("guardians").update({ is_billing_contact: false }).eq("student_id", studentId).neq("id", guardianId)
  }

  const { data: updatedGuardian, error } = await supabase
    .from("guardians")
    // @ts-ignore - Supabase strict type checking
    .update(updateData)
    .eq("id", guardianId)
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath(`/dashboard/admin/students/${studentId}`)
  return updatedGuardian
}

export async function deleteGuardian(guardianId: string, studentId: string) {
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

  // Verify guardian belongs to a student in user's school
  const { data: guardian, error: guardianError } = await supabase
    .from("guardians")
    .select("student_id, students!inner(school_id)")
    .eq("id", guardianId)
    .single()

  if (guardianError || !guardian) {
    throw new Error("Guardian not found or access denied")
  }

  const guardianData = guardian as any
  if (guardianData.students?.school_id !== context.schoolId) {
    throw new Error("Guardian not found or access denied")
  }

  const { error } = await supabase
    .from("guardians")
    .delete()
    .eq("id", guardianId)

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath(`/dashboard/admin/students/${studentId}`)
  return { success: true }
}

export async function getGuardians(studentId: string) {
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

  // Verify student belongs to user's school
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("school_id")
    .eq("id", studentId)
    .single()

  if (studentError || !student || (student as any).school_id !== context.schoolId) {
    throw new Error("Student not found or access denied")
  }

  const { data: guardians, error } = await supabase
    .from("guardians")
    .select("*")
    .eq("student_id", studentId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return guardians || []
}


