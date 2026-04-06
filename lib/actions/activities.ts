"use server"

import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

// ============ Get Activities ============

export async function getActivities() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  const { data: activities, error } = await adminClient
    .from("activities")
    .select("*")
    .eq("school_id", context.schoolId)
    .order("name", { ascending: true })

  if (error) {
    return { error: error.message }
  }

  return { data: activities }
}

// ============ Get Activity with Enrolled Students ============

export async function getActivity(activityId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  const { data: activity, error } = await adminClient
    .from("activities")
    .select("*")
    .eq("id", activityId)
    .eq("school_id", context.schoolId)
    .single()

  if (error) {
    return { error: error.message }
  }

  // Get enrolled students
  const { data: enrollments } = await adminClient
    .from("student_activities")
    .select(`
      *,
      student:students(id, first_name, last_name, admission_number),
      term:terms(id, name)
    `)
    .eq("activity_id", activityId)
    .order("created_at", { ascending: false })

  return { data: activity, enrollments: enrollments || [] }
}

// ============ Create Activity ============

export async function createActivity(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  const name = formData.get("name") as string
  const feeAmount = parseFloat(formData.get("fee_amount") as string) || 0
  const description = formData.get("description") as string || null

  if (!name) {
    return { error: "Activity name is required" }
  }

  const { data: activity, error } = await adminClient
    .from("activities")
    // @ts-ignore
    .insert({
      school_id: context.schoolId,
      name,
      fee_amount: feeAmount,
      description,
      is_active: true,
    } as any)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/activities")
  return { success: true, data: activity }
}

// ============ Update Activity ============

export async function updateActivity(activityId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  const name = formData.get("name") as string
  const feeAmount = parseFloat(formData.get("fee_amount") as string) || 0
  const description = formData.get("description") as string || null
  const isActive = formData.get("is_active") !== "false"

  const { error } = await adminClient
    .from("activities")
    // @ts-ignore
    .update({
      name,
      fee_amount: feeAmount,
      description,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", activityId)
    .eq("school_id", context.schoolId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/activities")
  return { success: true }
}

// ============ Delete Activity ============

export async function deleteActivity(activityId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  const { error } = await adminClient
    .from("activities")
    .delete()
    .eq("id", activityId)
    .eq("school_id", context.schoolId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/activities")
  return { success: true }
}

// ============ Enroll Student in Activity ============

export async function enrollStudentInActivity(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  const studentId = formData.get("student_id") as string
  const activityId = formData.get("activity_id") as string
  const termId = formData.get("term_id") as string

  if (!studentId || !activityId || !termId) {
    return { error: "Student, activity, and term are required" }
  }

  const { data: enrollment, error } = await adminClient
    .from("student_activities")
    // @ts-ignore
    .insert({
      student_id: studentId,
      activity_id: activityId,
      term_id: termId,
      status: "active",
    } as any)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/activities")
  return { success: true, data: enrollment }
}

// ============ Remove Student from Activity ============

export async function removeStudentFromActivity(enrollmentId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  const { error } = await adminClient
    .from("student_activities")
    .delete()
    .eq("id", enrollmentId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/activities")
  return { success: true }
}

// ============ Get Activity Stats ============

export async function getActivityStats() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  const { data: activities, error } = await adminClient
    .from("activities")
    .select("id, name, fee_amount, is_active")
    .eq("school_id", context.schoolId)

  if (error) {
    return { error: error.message }
  }

  const { count: totalEnrollments } = await adminClient
    .from("student_activities")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")

  return {
    data: {
      totalActivities: activities?.length || 0,
      activeActivities: activities?.filter((a: any) => a.is_active).length || 0,
      totalEnrollments: totalEnrollments || 0,
    }
  }
}
