"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

export interface InquiryData {
  student_name: string
  guardian_name: string
  guardian_phone: string
  guardian_email?: string
  interested_class_id?: string
  source?: string
  status?: string
  notes?: string
}

export async function createInquiry(data: InquiryData) {
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

  const { data: inquiry, error } = await supabase
    .from("inquiries")
    // @ts-ignore - Supabase strict type checking
    .insert({
      school_id: context.schoolId,
      ...data,
      status: data.status || "new",
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/my-school")
  return { data: inquiry }
}

export async function updateInquiry(inquiryId: string, data: Partial<InquiryData>) {
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

  // Verify inquiry belongs to school
  const { data: inquiry, error: inquiryError } = await supabase
    .from("inquiries")
    .select("id, school_id")
    .eq("id", inquiryId)
    .eq("school_id", context.schoolId)
    .single()

  if (inquiryError || !inquiry) {
    return { error: "Inquiry not found" }
  }

  const { data: updated, error } = await supabase
    .from("inquiries")
    // @ts-ignore - Supabase strict type checking
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", inquiryId)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/my-school")
  return { data: updated }
}

export async function convertInquiryToApplication(inquiryId: string) {
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

  // Get inquiry
  const { data: inquiry, error: inquiryError } = await supabase
    .from("inquiries")
    .select("*")
    .eq("id", inquiryId)
    .eq("school_id", context.schoolId)
    .single()

  if (inquiryError || !inquiry) {
    return { error: "Inquiry not found" }
  }

  // Create application from inquiry
  const inquiryData = inquiry as any
  const [firstName, ...lastNameParts] = inquiryData.student_name.split(" ")
  const lastName = lastNameParts.join(" ") || firstName

  // Get class name if class_id is provided
  let appliedClass = null
  if (inquiryData.interested_class_id) {
    const { data: classData } = await supabase
      .from("classes")
      .select("name")
      .eq("id", inquiryData.interested_class_id)
      .single()
    if (classData) {
      appliedClass = (classData as any).name
    }
  }

  const { data: application, error: appError } = await supabase
    .from("applications")
    // @ts-ignore - Supabase strict type checking
    .insert({
      school_id: context.schoolId,
      first_name: firstName,
      last_name: lastName,
      guardian_name: inquiryData.guardian_name,
      guardian_phone: inquiryData.guardian_phone,
      guardian_email: inquiryData.guardian_email,
      applied_class_id: inquiryData.interested_class_id || null,
      status: "pending",
      notes: inquiryData.notes,
    })
    .select()
    .single()

  if (appError || !application) {
    return { error: appError?.message || "Failed to create application" }
  }

  // Update inquiry to mark as converted
  const inquiryUpdateData = {
    status: "converted",
    converted_to_application_id: (application as any).id,
    updated_at: new Date().toISOString(),
  }
  // @ts-ignore - Supabase strict type checking
  await supabase.from("inquiries").update(inquiryUpdateData).eq("id", inquiryId)

  revalidatePath("/dashboard/admin/my-school")
  revalidatePath("/dashboard/admin/admissions")
  return { data: application }
}

export async function getInquiries(filters?: {
  status?: string
  search?: string
}) {
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
    .from("inquiries")
    .select(`
      *,
      interested_class:classes(id, name)
    `)
    .eq("school_id", context.schoolId)
    .order("created_at", { ascending: false })

  if (filters?.status) {
    query = query.eq("status", filters.status)
  }

  if (filters?.search) {
    query = query.or(
      `student_name.ilike.%${filters.search}%,guardian_name.ilike.%${filters.search}%,guardian_phone.ilike.%${filters.search}%`
    )
  }

  const { data: inquiries, error } = await query

  if (error) {
    return { error: error.message }
  }

  return { data: inquiries || [] }
}

export async function deleteInquiry(inquiryId: string) {
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

  const { error } = await supabase
    .from("inquiries")
    .delete()
    .eq("id", inquiryId)
    .eq("school_id", context.schoolId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/my-school")
  return { success: true }
}

