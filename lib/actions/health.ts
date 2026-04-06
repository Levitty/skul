"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

const HEALTH_PATH = "/dashboard/admin/health"

// ============ Health Profiles ============

export async function getHealthProfile(studentId: string) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated" }

  const context = await requireTenantContext(user.id)

  const { data: profile, error } = await supabase
    .from("student_health_profiles")
    .select("*")
    .eq("school_id", context.schoolId)
    .eq("student_id", studentId)
    .single()

  if (error && error.code !== "PGRST116") return { error: error.message }

  return { data: profile }
}

export type HealthProfileData = {
  blood_group?: string
  allergies?: string
  chronic_conditions?: string
  current_medications?: string
  immunization_notes?: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
  doctor_name?: string
  doctor_phone?: string
  insurance_provider?: string
  insurance_number?: string
  special_needs?: string
}

export async function upsertHealthProfile(studentId: string, data: HealthProfileData) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated" }

  const context = await requireTenantContext(user.id)

  const payload = {
    school_id: context.schoolId,
    student_id: studentId,
    blood_group: data.blood_group ?? null,
    allergies: data.allergies ?? null,
    chronic_conditions: data.chronic_conditions ?? null,
    current_medications: data.current_medications ?? null,
    immunization_notes: data.immunization_notes ?? null,
    emergency_contact_name: data.emergency_contact_name ?? null,
    emergency_contact_phone: data.emergency_contact_phone ?? null,
    doctor_name: data.doctor_name ?? null,
    doctor_phone: data.doctor_phone ?? null,
    insurance_provider: data.insurance_provider ?? null,
    insurance_number: data.insurance_number ?? null,
    special_needs: data.special_needs ?? null,
    updated_at: new Date().toISOString(),
  }

  const { data: profile, error } = await supabase
    .from("student_health_profiles")
    // @ts-ignore
    .upsert(payload, { onConflict: "school_id,student_id" })
    .select()
    .single()

  if (error) return { error: error.message }

  revalidatePath(HEALTH_PATH)
  return { data: profile }
}

// ============ Clinic Visits ============

export async function getClinicVisits(filters?: {
  student_id?: string
  date_from?: string
  date_to?: string
}) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated" }

  const context = await requireTenantContext(user.id)

  let query = supabase
    .from("clinic_visits")
    .select("*, students(first_name, last_name, admission_number)")
    .eq("school_id", context.schoolId)

  if (filters?.student_id) {
    query = query.eq("student_id", filters.student_id)
  }
  if (filters?.date_from) {
    query = query.gte("visit_date", filters.date_from)
  }
  if (filters?.date_to) {
    query = query.lte("visit_date", filters.date_to)
  }

  const { data: visits, error } = await query.order("visit_date", { ascending: false })

  if (error) return { error: error.message }

  return { data: visits }
}

export type CreateClinicVisitData = {
  student_id: string
  complaint: string
  diagnosis?: string
  treatment?: string
  medication_given?: string
  temperature?: string
  blood_pressure?: string
  weight?: string
  action_taken?: string
  parent_notified?: boolean
  follow_up_needed?: boolean
  follow_up_date?: string
  notes?: string
}

export async function createClinicVisit(data: CreateClinicVisitData) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated" }

  const context = await requireTenantContext(user.id)

  if (!data.student_id || !data.complaint) {
    return { error: "Student and complaint are required" }
  }

  const { data: visit, error } = await supabase
    .from("clinic_visits")
    // @ts-ignore
    .insert({
      school_id: context.schoolId,
      student_id: data.student_id,
      complaint: data.complaint,
      diagnosis: data.diagnosis ?? null,
      treatment: data.treatment ?? null,
      medication_given: data.medication_given ?? null,
      temperature: data.temperature ?? null,
      blood_pressure: data.blood_pressure ?? null,
      weight: data.weight ?? null,
      action_taken: data.action_taken ?? null,
      parent_notified: data.parent_notified ?? false,
      follow_up_needed: data.follow_up_needed ?? false,
      follow_up_date: data.follow_up_date ?? null,
      notes: data.notes ?? null,
      attended_by: user.id,
      visit_date: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return { error: error.message }

  revalidatePath(HEALTH_PATH)
  return { data: visit }
}

export async function updateClinicVisit(visitId: string, data: Partial<CreateClinicVisitData>) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated" }

  const context = await requireTenantContext(user.id)

  const updatePayload: Record<string, unknown> = {}

  if (data.complaint !== undefined) updatePayload.complaint = data.complaint
  if (data.diagnosis !== undefined) updatePayload.diagnosis = data.diagnosis
  if (data.treatment !== undefined) updatePayload.treatment = data.treatment
  if (data.medication_given !== undefined) updatePayload.medication_given = data.medication_given
  if (data.temperature !== undefined) updatePayload.temperature = data.temperature
  if (data.blood_pressure !== undefined) updatePayload.blood_pressure = data.blood_pressure
  if (data.weight !== undefined) updatePayload.weight = data.weight
  if (data.action_taken !== undefined) updatePayload.action_taken = data.action_taken
  if (data.parent_notified !== undefined) updatePayload.parent_notified = data.parent_notified
  if (data.follow_up_needed !== undefined) updatePayload.follow_up_needed = data.follow_up_needed
  if (data.follow_up_date !== undefined) updatePayload.follow_up_date = data.follow_up_date
  if (data.notes !== undefined) updatePayload.notes = data.notes

  const { data: visit, error } = await supabase
    .from("clinic_visits")
    // @ts-ignore
    .update(updatePayload)
    .eq("id", visitId)
    .eq("school_id", context.schoolId)
    .select()
    .single()

  if (error) return { error: error.message }

  revalidatePath(HEALTH_PATH)
  return { data: visit }
}

// ============ Clinic Inventory ============

export async function getClinicInventory() {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated" }

  const context = await requireTenantContext(user.id)

  const { data: items, error } = await supabase
    .from("clinic_inventory")
    .select("*")
    .eq("school_id", context.schoolId)
    .order("name", { ascending: true })

  if (error) return { error: error.message }

  return { data: items }
}

export type ClinicItemData = {
  id?: string
  name: string
  category?: string
  quantity?: number
  unit?: string
  reorder_level?: number
  expiry_date?: string
  notes?: string
}

export async function upsertClinicItem(data: ClinicItemData) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated" }

  const context = await requireTenantContext(user.id)

  if (!data.name) {
    return { error: "Item name is required" }
  }

  if (data.id) {
    const { data: item, error } = await supabase
      .from("clinic_inventory")
      // @ts-ignore
      .update({
        name: data.name,
        category: data.category ?? null,
        quantity: data.quantity ?? 0,
        unit: data.unit ?? null,
        reorder_level: data.reorder_level ?? 0,
        expiry_date: data.expiry_date ?? null,
        notes: data.notes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("school_id", context.schoolId)
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath(HEALTH_PATH)
    return { data: item }
  }

  const { data: item, error } = await supabase
    .from("clinic_inventory")
    // @ts-ignore
    .insert({
      school_id: context.schoolId,
      name: data.name,
      category: data.category ?? null,
      quantity: data.quantity ?? 0,
      unit: data.unit ?? null,
      reorder_level: data.reorder_level ?? 0,
      expiry_date: data.expiry_date ?? null,
      notes: data.notes ?? null,
    })
    .select()
    .single()

  if (error) return { error: error.message }

  revalidatePath(HEALTH_PATH)
  return { data: item }
}

export async function deleteClinicItem(itemId: string) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated" }

  const context = await requireTenantContext(user.id)

  const { error } = await supabase
    .from("clinic_inventory")
    .delete()
    .eq("id", itemId)
    .eq("school_id", context.schoolId)

  if (error) return { error: error.message }

  revalidatePath(HEALTH_PATH)
  return { data: null }
}
