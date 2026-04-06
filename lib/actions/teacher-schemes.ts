"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

const TEACHER_SCHEMES_PATH = "/dashboard/teacher/schemes"

// ============ Teacher Schemes ============

export async function getTeacherSchemes(filters?: {
  term_id?: string
  subject_id?: string
  status?: string
}) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  // Get the teacher's employee record
  const { data: teacher } = await supabase
    .from("employees")
    .select("id")
    .eq("user_id", user.id)
    .eq("school_id", context.schoolId)
    .single()

  if (!teacher) {
    return { error: "Teacher record not found" }
  }

  let query = supabase
    .from("schemes_of_work")
    .select(`
      *,
      subject:subjects(id, name),
      class:classes(id, name),
      term:terms(id, name),
      teacher:employees(id, first_name, last_name)
    `)
    .eq("school_id", context.schoolId)
    .eq("teacher_id", teacher.id)

  if (filters?.term_id) {
    query = query.eq("term_id", filters.term_id)
  }
  if (filters?.subject_id) {
    query = query.eq("subject_id", filters.subject_id)
  }
  if (filters?.status) {
    query = query.eq("status", filters.status)
  }

  const { data, error } = await query.order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return { data }
}

export async function getTeacherSchemesStats() {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  // Get the teacher's employee record
  const { data: teacher } = await supabase
    .from("employees")
    .select("id")
    .eq("user_id", user.id)
    .eq("school_id", context.schoolId)
    .single()

  if (!teacher) {
    return { error: "Teacher record not found" }
  }

  const { data: schemes } = await supabase
    .from("schemes_of_work")
    .select("id, status")
    .eq("school_id", context.schoolId)
    .eq("teacher_id", teacher.id)

  if (!schemes) {
    return { data: { total: 0, draft: 0, submitted: 0, approved: 0 } }
  }

  const total = schemes.length
  const draft = schemes.filter((s: any) => s.status === "draft").length
  const submitted = schemes.filter((s: any) => s.status === "submitted").length
  const approved = schemes.filter((s: any) => s.status === "approved").length

  return { data: { total, draft, submitted, approved } }
}

export async function getTeacherSchemeDetail(schemeId: string) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  // Get the teacher's employee record
  const { data: teacher } = await supabase
    .from("employees")
    .select("id")
    .eq("user_id", user.id)
    .eq("school_id", context.schoolId)
    .single()

  if (!teacher) {
    return { error: "Teacher record not found" }
  }

  const { data, error } = await supabase
    .from("schemes_of_work")
    .select(`
      *,
      subject:subjects(id, name),
      class:classes(id, name),
      term:terms(id, name),
      teacher:employees(id, first_name, last_name),
      scheme_entries(*)
    `)
    .eq("id", schemeId)
    .eq("school_id", context.schoolId)
    .eq("teacher_id", teacher.id)
    .single()

  if (error) {
    return { error: error.message }
  }

  if (!data) {
    return { error: "Scheme not found" }
  }

  const entries = (data as any).scheme_entries || []
  const sortedEntries = entries.sort((a: { week_number: number }, b: { week_number: number }) => a.week_number - b.week_number)

  return { data: { ...data, scheme_entries: sortedEntries } }
}

export async function createTeacherScheme(data: {
  subject_id: string
  class_id: string
  term_id: string
  title: string
  description?: string
}) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  // Get the teacher's employee record
  const { data: teacher } = await supabase
    .from("employees")
    .select("id")
    .eq("user_id", user.id)
    .eq("school_id", context.schoolId)
    .single()

  if (!teacher) {
    return { error: "Teacher record not found" }
  }

  if (!data.title) {
    return { error: "Title is required" }
  }

  const { data: scheme, error } = await supabase
    .from("schemes_of_work")
    // @ts-ignore
    .insert({
      school_id: context.schoolId,
      subject_id: data.subject_id,
      class_id: data.class_id,
      term_id: data.term_id,
      teacher_id: teacher.id,
      title: data.title,
      description: data.description ?? null,
      status: "draft",
    } as any)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath(TEACHER_SCHEMES_PATH)
  return { data: scheme }
}

export async function submitTeacherScheme(schemeId: string) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  // Get the teacher's employee record
  const { data: teacher } = await supabase
    .from("employees")
    .select("id")
    .eq("user_id", user.id)
    .eq("school_id", context.schoolId)
    .single()

  if (!teacher) {
    return { error: "Teacher record not found" }
  }

  const { error } = await supabase
    .from("schemes_of_work")
    // @ts-ignore
    .update({
      status: "submitted",
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", schemeId)
    .eq("school_id", context.schoolId)
    .eq("teacher_id", teacher.id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath(TEACHER_SCHEMES_PATH)
  return { data: null }
}

export async function updateTeacherScheme(
  schemeId: string,
  data: { title?: string; description?: string }
) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  // Get the teacher's employee record
  const { data: teacher } = await supabase
    .from("employees")
    .select("id")
    .eq("user_id", user.id)
    .eq("school_id", context.schoolId)
    .single()

  if (!teacher) {
    return { error: "Teacher record not found" }
  }

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (data.title !== undefined) updatePayload.title = data.title
  if (data.description !== undefined) updatePayload.description = data.description

  const { error } = await supabase
    .from("schemes_of_work")
    // @ts-ignore
    .update(updatePayload as any)
    .eq("id", schemeId)
    .eq("school_id", context.schoolId)
    .eq("teacher_id", teacher.id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath(TEACHER_SCHEMES_PATH)
  return { data: null }
}

export async function deleteTeacherScheme(schemeId: string) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  // Get the teacher's employee record
  const { data: teacher } = await supabase
    .from("employees")
    .select("id")
    .eq("user_id", user.id)
    .eq("school_id", context.schoolId)
    .single()

  if (!teacher) {
    return { error: "Teacher record not found" }
  }

  const { error } = await supabase
    .from("schemes_of_work")
    .delete()
    .eq("id", schemeId)
    .eq("school_id", context.schoolId)
    .eq("teacher_id", teacher.id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath(TEACHER_SCHEMES_PATH)
  return { data: null }
}
