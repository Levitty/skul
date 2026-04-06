"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

export interface EmergencyContactData {
  name: string
  relation: string
  phone: string
  email?: string
  address?: string
  is_primary?: boolean
}

export async function createEmergencyContact(
  studentId: string,
  data: EmergencyContactData
) {
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
    .eq("id", studentId)
    .eq("school_id", context.schoolId)
    .single()

  if (studentError || !student) {
    return { error: "Student not found" }
  }

  // If this is primary, unset other primary contacts
  if (data.is_primary) {
    // @ts-ignore - Supabase strict type checking
    await supabase.from("emergency_contacts").update({ is_primary: false }).eq("student_id", studentId).eq("is_primary", true)
  }

  const { data: contact, error } = await supabase
    .from("emergency_contacts")
    // @ts-ignore - Supabase strict type checking
    .insert({
      student_id: studentId,
      ...data,
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/dashboard/admin/students/${studentId}`)
  return { data: contact }
}

export async function updateEmergencyContact(
  contactId: string,
  data: Partial<EmergencyContactData>
) {
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

  // Verify contact belongs to student in school
  const { data: contact, error: contactError } = await supabase
    .from("emergency_contacts")
    .select("id, student_id, students!inner(school_id)")
    .eq("id", contactId)
    .single()

  if (contactError || !contact) {
    return { error: "Emergency contact not found" }
  }

  const contactData = contact as any
  const student = contactData.students as any
  if (student?.school_id !== context.schoolId) {
    return { error: "Access denied" }
  }

  // If setting as primary, unset other primary contacts
  if (data.is_primary) {
    // @ts-ignore - Supabase strict type checking
    await supabase.from("emergency_contacts").update({ is_primary: false }).eq("student_id", contactData.student_id).eq("is_primary", true).neq("id", contactId)
  }

  const { data: updated, error } = await supabase
    .from("emergency_contacts")
    // @ts-ignore - Supabase strict type checking
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", contactId)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/dashboard/admin/students/${contactData.student_id}`)
  return { data: updated }
}

export async function deleteEmergencyContact(contactId: string) {
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

  // Verify contact belongs to student in school
  const { data: contact, error: contactError } = await supabase
    .from("emergency_contacts")
    .select("id, student_id, students!inner(school_id)")
    .eq("id", contactId)
    .single()

  if (contactError || !contact) {
    return { error: "Emergency contact not found" }
  }

  const contactData = contact as any
  const student = contactData.students as any
  if (student?.school_id !== context.schoolId) {
    return { error: "Access denied" }
  }

  const { error } = await supabase
    .from("emergency_contacts")
    .delete()
    .eq("id", contactId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/dashboard/admin/students/${contactData.student_id}`)
  return { success: true }
}

export async function getEmergencyContacts(studentId: string) {
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
    .eq("id", studentId)
    .eq("school_id", context.schoolId)
    .single()

  if (studentError || !student) {
    return { error: "Student not found" }
  }

  const { data: contacts, error } = await supabase
    .from("emergency_contacts")
    .select("*")
    .eq("student_id", studentId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true })

  if (error) {
    return { error: error.message }
  }

  return { data: contacts }
}

