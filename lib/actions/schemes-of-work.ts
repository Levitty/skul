"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

const SCHEMES_PATH = "/dashboard/admin/academic/schemes"
const LESSON_PLANS_PATH = "/dashboard/admin/academic/lesson-plans"

// ============ Schemes of Work ============

export async function getSchemes(filters?: {
  term_id?: string
  subject_id?: string
  teacher_id?: string
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

  if (filters?.term_id) {
    query = query.eq("term_id", filters.term_id)
  }
  if (filters?.subject_id) {
    query = query.eq("subject_id", filters.subject_id)
  }
  if (filters?.teacher_id) {
    query = query.eq("teacher_id", filters.teacher_id)
  }

  const { data, error } = await query.order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return { data }
}

export async function getScheme(schemeId: string) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
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

export async function createScheme(data: {
  subject_id: string
  class_id: string
  term_id: string
  teacher_id?: string
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
      teacher_id: data.teacher_id ?? null,
      title: data.title,
      description: data.description ?? null,
      status: "draft",
    } as any)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath(SCHEMES_PATH)
  return { data: scheme }
}

export async function updateScheme(
  schemeId: string,
  data: { title?: string; description?: string; status?: string }
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

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (data.title !== undefined) updatePayload.title = data.title
  if (data.description !== undefined) updatePayload.description = data.description
  if (data.status !== undefined) updatePayload.status = data.status

  const { error } = await supabase
    .from("schemes_of_work")
    // @ts-ignore
    .update(updatePayload as any)
    .eq("id", schemeId)
    .eq("school_id", context.schoolId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath(SCHEMES_PATH)
  return { data: null }
}

export async function deleteScheme(schemeId: string) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const { error } = await supabase
    .from("schemes_of_work")
    .delete()
    .eq("id", schemeId)
    .eq("school_id", context.schoolId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath(SCHEMES_PATH)
  return { data: null }
}

// ============ Scheme Entries (weekly breakdown) ============

export async function addSchemeEntry(
  schemeId: string,
  data: {
    week_number: number
    topic: string
    subtopic?: string
    objectives?: string
    teaching_activities?: string
    learning_resources?: string
    assessment?: string
    remarks?: string
  }
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

  const { data: existing } = await supabase
    .from("schemes_of_work")
    .select("id")
    .eq("id", schemeId)
    .eq("school_id", context.schoolId)
    .single()

  if (!existing) {
    return { error: "Scheme not found" }
  }

  const { data: entry, error } = await supabase
    .from("scheme_entries")
    // @ts-ignore
    .insert({
      scheme_id: schemeId,
      week_number: data.week_number,
      topic: data.topic,
      subtopic: data.subtopic ?? null,
      objectives: data.objectives ?? null,
      teaching_activities: data.teaching_activities ?? null,
      learning_resources: data.learning_resources ?? null,
      assessment: data.assessment ?? null,
      remarks: data.remarks ?? null,
    } as any)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath(SCHEMES_PATH)
  return { data: entry }
}

export async function updateSchemeEntry(
  entryId: string,
  data: {
    week_number?: number
    topic?: string
    subtopic?: string
    objectives?: string
    teaching_activities?: string
    learning_resources?: string
    assessment?: string
    remarks?: string
  }
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

  const updatePayload: Record<string, unknown> = {}
  if (data.week_number !== undefined) updatePayload.week_number = data.week_number
  if (data.topic !== undefined) updatePayload.topic = data.topic
  if (data.subtopic !== undefined) updatePayload.subtopic = data.subtopic
  if (data.objectives !== undefined) updatePayload.objectives = data.objectives
  if (data.teaching_activities !== undefined) updatePayload.teaching_activities = data.teaching_activities
  if (data.learning_resources !== undefined) updatePayload.learning_resources = data.learning_resources
  if (data.assessment !== undefined) updatePayload.assessment = data.assessment
  if (data.remarks !== undefined) updatePayload.remarks = data.remarks

  if (Object.keys(updatePayload).length === 0) {
    return { data: null }
  }

  const { error } = await supabase
    .from("scheme_entries")
    // @ts-ignore
    .update(updatePayload as any)
    .eq("id", entryId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath(SCHEMES_PATH)
  return { data: null }
}

export async function deleteSchemeEntry(entryId: string) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  await requireTenantContext(user.id)

  const { error } = await supabase
    .from("scheme_entries")
    .delete()
    .eq("id", entryId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath(SCHEMES_PATH)
  return { data: null }
}

// ============ Lesson Plans ============

export async function getLessonPlans(filters?: {
  date?: string
  teacher_id?: string
  subject_id?: string
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

  let query = supabase
    .from("lesson_plans")
    .select(`
      *,
      subject:subjects(id, name),
      class:classes(id, name),
      teacher:employees(id, first_name, last_name),
      scheme_entry:scheme_entries(id, week_number, topic)
    `)
    .eq("school_id", context.schoolId)

  if (filters?.date) {
    query = query.eq("lesson_date", filters.date)
  }
  if (filters?.teacher_id) {
    query = query.eq("teacher_id", filters.teacher_id)
  }
  if (filters?.subject_id) {
    query = query.eq("subject_id", filters.subject_id)
  }

  const { data, error } = await query.order("lesson_date", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return { data }
}

export async function getLessonPlan(planId: string) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const { data, error } = await supabase
    .from("lesson_plans")
    .select(`
      *,
      subject:subjects(id, name),
      class:classes(id, name),
      teacher:employees(id, first_name, last_name),
      scheme_entry:scheme_entries(id, week_number, topic, subtopic, objectives)
    `)
    .eq("id", planId)
    .eq("school_id", context.schoolId)
    .single()

  if (error) {
    return { error: error.message }
  }

  if (!data) {
    return { error: "Lesson plan not found" }
  }

  return { data }
}

export async function createLessonPlan(data: {
  scheme_entry_id?: string
  subject_id: string
  class_id: string
  teacher_id?: string
  title: string
  lesson_date?: string
  duration_minutes?: number
  strand?: string
  sub_strand?: string
  learning_indicators?: string
  introduction?: string
  lesson_development?: string
  conclusion?: string
  teaching_aids?: string
  assessment_method?: string
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

  if (!data.title) {
    return { error: "Title is required" }
  }

  const { data: plan, error } = await supabase
    .from("lesson_plans")
    // @ts-ignore
    .insert({
      school_id: context.schoolId,
      scheme_entry_id: data.scheme_entry_id ?? null,
      subject_id: data.subject_id,
      class_id: data.class_id,
      teacher_id: data.teacher_id ?? null,
      title: data.title,
      lesson_date: data.lesson_date ?? null,
      duration_minutes: data.duration_minutes ?? 40,
      strand: data.strand ?? null,
      sub_strand: data.sub_strand ?? null,
      learning_indicators: data.learning_indicators ?? null,
      introduction: data.introduction ?? null,
      lesson_development: data.lesson_development ?? null,
      conclusion: data.conclusion ?? null,
      teaching_aids: data.teaching_aids ?? null,
      assessment_method: data.assessment_method ?? null,
      status: "draft",
    } as any)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath(LESSON_PLANS_PATH)
  revalidatePath(SCHEMES_PATH)
  return { data: plan }
}

export async function updateLessonPlan(
  planId: string,
  data: {
    scheme_entry_id?: string
    subject_id?: string
    class_id?: string
    teacher_id?: string
    title?: string
    lesson_date?: string
    duration_minutes?: number
    strand?: string
    sub_strand?: string
    learning_indicators?: string
    introduction?: string
    lesson_development?: string
    conclusion?: string
    teaching_aids?: string
    assessment_method?: string
    status?: string
  }
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

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (data.scheme_entry_id !== undefined) updatePayload.scheme_entry_id = data.scheme_entry_id
  if (data.subject_id !== undefined) updatePayload.subject_id = data.subject_id
  if (data.class_id !== undefined) updatePayload.class_id = data.class_id
  if (data.teacher_id !== undefined) updatePayload.teacher_id = data.teacher_id
  if (data.title !== undefined) updatePayload.title = data.title
  if (data.lesson_date !== undefined) updatePayload.lesson_date = data.lesson_date
  if (data.duration_minutes !== undefined) updatePayload.duration_minutes = data.duration_minutes
  if (data.strand !== undefined) updatePayload.strand = data.strand
  if (data.sub_strand !== undefined) updatePayload.sub_strand = data.sub_strand
  if (data.learning_indicators !== undefined) updatePayload.learning_indicators = data.learning_indicators
  if (data.introduction !== undefined) updatePayload.introduction = data.introduction
  if (data.lesson_development !== undefined) updatePayload.lesson_development = data.lesson_development
  if (data.conclusion !== undefined) updatePayload.conclusion = data.conclusion
  if (data.teaching_aids !== undefined) updatePayload.teaching_aids = data.teaching_aids
  if (data.assessment_method !== undefined) updatePayload.assessment_method = data.assessment_method
  if (data.status !== undefined) updatePayload.status = data.status

  const { error } = await supabase
    .from("lesson_plans")
    // @ts-ignore
    .update(updatePayload as any)
    .eq("id", planId)
    .eq("school_id", context.schoolId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath(LESSON_PLANS_PATH)
  revalidatePath(SCHEMES_PATH)
  return { data: null }
}

export async function deleteLessonPlan(planId: string) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const { error } = await supabase
    .from("lesson_plans")
    .delete()
    .eq("id", planId)
    .eq("school_id", context.schoolId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath(LESSON_PLANS_PATH)
  revalidatePath(SCHEMES_PATH)
  return { data: null }
}
