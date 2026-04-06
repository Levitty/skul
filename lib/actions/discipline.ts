"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

// ── Categories ──

export async function getCategories() {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)

  const { data, error } = await supabase
    .from("discipline_categories")
    .select("*")
    .eq("school_id", context.schoolId)
    .order("name")

  if (error) {
    return { error: error.message }
  }

  return { data }
}

export async function createCategory(data: {
  name: string
  severity: string
  default_action?: string
  points?: number
}) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)

  const { data: category, error } = await supabase
    .from("discipline_categories")
    // @ts-ignore
    .insert({
      school_id: context.schoolId,
      name: data.name,
      severity: data.severity,
      default_action: data.default_action || null,
      points: data.points || 0,
    } as any)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/discipline")
  return { success: true, data: category }
}

export async function updateCategory(
  id: string,
  data: { name?: string; severity?: string; default_action?: string; points?: number }
) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)

  const { error } = await supabase
    .from("discipline_categories")
    // @ts-ignore
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", id)
    .eq("school_id", context.schoolId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/discipline")
  return { success: true }
}

export async function deleteCategory(id: string) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)

  const { error } = await supabase
    .from("discipline_categories")
    .delete()
    .eq("id", id)
    .eq("school_id", context.schoolId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/discipline")
  return { success: true }
}

// ── Incidents ──

export async function getIncidents(filters?: {
  student_id?: string
  status?: string
  severity?: string
  from_date?: string
  to_date?: string
}) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)

  let query = supabase
    .from("discipline_incidents")
    .select(`
      *,
      students(id, first_name, last_name, admission_number),
      discipline_categories(id, name, severity)
    `)
    .eq("school_id", context.schoolId)

  if (filters?.student_id) {
    query = query.eq("student_id", filters.student_id)
  }

  if (filters?.status) {
    query = query.eq("status", filters.status)
  }

  if (filters?.severity) {
    query = query.eq("severity", filters.severity)
  }

  if (filters?.from_date) {
    query = query.gte("incident_date", filters.from_date)
  }

  if (filters?.to_date) {
    query = query.lte("incident_date", filters.to_date)
  }

  const { data, error } = await query.order("incident_date", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return { data }
}

export async function getIncident(id: string) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)

  const { data, error } = await supabase
    .from("discipline_incidents")
    .select(`
      *,
      students(id, first_name, last_name, admission_number),
      discipline_categories(id, name, severity, default_action)
    `)
    .eq("id", id)
    .eq("school_id", context.schoolId)
    .single()

  if (error) {
    return { error: error.message }
  }

  return { data }
}

export async function createIncident(data: {
  student_id: string
  category_id?: string
  incident_date?: string
  description: string
  location?: string
  witnesses?: string
  severity?: string
  action_taken?: string
  punishment?: string
}) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)

  const { data: incident, error } = await supabase
    .from("discipline_incidents")
    // @ts-ignore
    .insert({
      school_id: context.schoolId,
      student_id: data.student_id,
      category_id: data.category_id || null,
      incident_date: data.incident_date || new Date().toISOString().split("T")[0],
      description: data.description,
      location: data.location || null,
      witnesses: data.witnesses || null,
      severity: data.severity || "minor",
      action_taken: data.action_taken || null,
      punishment: data.punishment || null,
      reported_by: user.id,
      status: "open",
    } as any)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/discipline")
  return { success: true, data: incident }
}

export async function updateIncident(
  id: string,
  data: {
    category_id?: string
    description?: string
    location?: string
    witnesses?: string
    severity?: string
    action_taken?: string
    punishment?: string
    status?: string
  }
) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)

  const updatePayload: Record<string, any> = {
    ...data,
    updated_at: new Date().toISOString(),
  }

  if (data.status === "resolved") {
    updatePayload.resolved_by = user.id
    updatePayload.resolved_at = new Date().toISOString()
  }

  const { error } = await supabase
    .from("discipline_incidents")
    // @ts-ignore
    .update(updatePayload as any)
    .eq("id", id)
    .eq("school_id", context.schoolId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/discipline")
  return { success: true }
}

// ── Merit Points ──

export async function getMeritPoints(studentId?: string) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)

  let query = supabase
    .from("merit_points")
    .select(`
      *,
      students(id, first_name, last_name, admission_number)
    `)
    .eq("school_id", context.schoolId)

  if (studentId) {
    query = query.eq("student_id", studentId)
  }

  const { data, error } = await query.order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return { data }
}

export async function awardMeritPoints(data: {
  student_id: string
  points: number
  reason: string
}) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)

  const { data: merit, error } = await supabase
    .from("merit_points")
    // @ts-ignore
    .insert({
      school_id: context.schoolId,
      student_id: data.student_id,
      points: data.points,
      reason: data.reason,
      awarded_by: user.id,
    } as any)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/discipline")
  return { success: true, data: merit }
}
