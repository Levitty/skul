"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

export async function createApplication(formData: FormData) {
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

  const appliedClassId = formData.get("applied_class_id") as string

  const applicationData = {
    school_id: context.schoolId,
    first_name: formData.get("first_name") as string,
    last_name: formData.get("last_name") as string,
    dob: (formData.get("dob") as string) || null,
    gender: (formData.get("gender") as string) || null,
    guardian_name: formData.get("guardian_name") as string,
    guardian_phone: formData.get("guardian_phone") as string,
    guardian_email: (formData.get("guardian_email") as string) || null,
    applied_class_id: appliedClassId || null,
    status: "pending" as const,
    // Additional student information fields
    email: (formData.get("email") as string) || null,
    phone: (formData.get("phone") as string) || null,
    address: (formData.get("address") as string) || null,
    medical_notes: (formData.get("medical_notes") as string) || null,
    previous_school_name: (formData.get("previous_school_name") as string) || null,
    previous_school_address: (formData.get("previous_school_address") as string) || null,
    previous_school_class: (formData.get("previous_school_class") as string) || null,
    previous_school_passout_year: formData.get("previous_school_passout_year")
      ? parseInt(formData.get("previous_school_passout_year") as string, 10)
      : null,
  }

  const { data: application, error } = await supabase
    .from("applications")
    // @ts-ignore - Supabase strict type checking
    .insert(applicationData)
    .select()
    .single()

  if (error || !application) {
    throw new Error(error?.message || "Failed to create application")
  }

  revalidatePath("/dashboard/admin/admissions")
  return application as any
}

export async function updateApplicationStatus(
  applicationId: string,
  status: "pending" | "reviewed" | "interviewed" | "accepted" | "rejected" | "waitlisted",
  notes?: string
) {
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

  const { data: existing, error: existingError } = await supabase
    .from("applications")
    .select("id")
    .eq("id", applicationId)
    .single()

  if (existingError || !existing) {
    throw new Error("Application not found or access denied")
  }

  const updateData: any = {
    status,
    updated_at: new Date().toISOString(),
  }

  if (notes) {
    updateData.notes = notes
  }

  const { data: application, error } = await supabase
    .from("applications")
    // @ts-ignore - Supabase strict type checking
    .update(updateData)
    .eq("id", applicationId)
    .select()
    .single()

  if (error || !application) {
    throw new Error(error?.message || "Failed to update application")
  }

  revalidatePath("/dashboard/admin/admissions")
  revalidatePath(`/dashboard/admin/admissions/${applicationId}`)
  return application as any
}

export async function getApplication(applicationId: string) {
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

  const { data: application, error } = await supabase
    .from("applications")
    .select("*")
    .eq("id", applicationId)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return application
}

export async function getApplications(filters?: {
  status?: string
  search?: string
  limit?: number
  offset?: number
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
    .from("applications")
    .select("*", { count: "exact" })

  if (filters?.status) {
    query = query.eq("status", filters.status)
  }

  if (filters?.search) {
    query = query.or(
      `first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,guardian_name.ilike.%${filters.search}%,guardian_phone.ilike.%${filters.search}%`
    )
  }

  if (filters?.limit) {
    query = query.limit(filters.limit)
  }

  if (filters?.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 20) - 1)
  }

  query = query.order("created_at", { ascending: false })

  const { data: applications, error, count } = await query

  if (error) {
    throw new Error(error.message)
  }

  return { applications: applications || [], count: count || 0 }
}


