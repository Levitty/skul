"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

const STUDY_MATERIALS_PATH = "/dashboard/teacher/study-materials"

// ============ Study Materials ============

export async function getStudyMaterials(filters?: {
  class_id?: string
  subject_id?: string
  material_type?: string
  term_id?: string
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
    .from("study_materials")
    .select(`
      *,
      class:classes(id, name),
      subject:subjects(id, name),
      uploaded_by:employees(id, first_name, last_name)
    `)
    .eq("school_id", context.schoolId)
    .eq("is_visible", true)

  if (filters?.class_id) {
    query = query.eq("class_id", filters.class_id)
  }
  if (filters?.subject_id) {
    query = query.eq("subject_id", filters.subject_id)
  }
  if (filters?.material_type) {
    query = query.eq("material_type", filters.material_type)
  }
  if (filters?.term_id) {
    query = query.eq("term_id", filters.term_id)
  }

  const { data, error } = await query.order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return { data }
}

export async function getMyStudyMaterials(filters?: {
  class_id?: string
  subject_id?: string
  material_type?: string
  term_id?: string
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
    .from("study_materials")
    .select(`
      *,
      class:classes(id, name),
      subject:subjects(id, name),
      uploaded_by:employees(id, first_name, last_name)
    `)
    .eq("school_id", context.schoolId)
    .eq("uploaded_by", teacher.id)

  if (filters?.class_id) {
    query = query.eq("class_id", filters.class_id)
  }
  if (filters?.subject_id) {
    query = query.eq("subject_id", filters.subject_id)
  }
  if (filters?.material_type) {
    query = query.eq("material_type", filters.material_type)
  }
  if (filters?.term_id) {
    query = query.eq("term_id", filters.term_id)
  }

  const { data, error } = await query.order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return { data }
}

export async function createStudyMaterial(data: {
  title: string
  description?: string
  material_type: string
  file_url?: string
  file_name?: string
  file_size?: number
  external_link?: string
  class_id?: string
  subject_id?: string
  term_id?: string
  is_downloadable?: boolean
  is_visible?: boolean
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

  if (!data.material_type) {
    return { error: "Material type is required" }
  }

  const { data: material, error } = await supabase
    .from("study_materials")
    // @ts-ignore
    .insert({
      school_id: context.schoolId,
      title: data.title,
      description: data.description ?? null,
      material_type: data.material_type,
      file_url: data.file_url ?? null,
      file_name: data.file_name ?? null,
      file_size: data.file_size ?? null,
      external_link: data.external_link ?? null,
      class_id: data.class_id ?? null,
      subject_id: data.subject_id ?? null,
      term_id: data.term_id ?? null,
      uploaded_by: teacher.id,
      is_downloadable: data.is_downloadable ?? true,
      is_visible: data.is_visible ?? true,
    } as any)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath(STUDY_MATERIALS_PATH)
  return { data: material }
}

export async function updateStudyMaterial(
  materialId: string,
  data: {
    title?: string
    description?: string
    class_id?: string
    subject_id?: string
    is_downloadable?: boolean
    is_visible?: boolean
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

  const updatePayload: Record<string, unknown> = {}
  if (data.title !== undefined) updatePayload.title = data.title
  if (data.description !== undefined) updatePayload.description = data.description
  if (data.class_id !== undefined) updatePayload.class_id = data.class_id
  if (data.subject_id !== undefined) updatePayload.subject_id = data.subject_id
  if (data.is_downloadable !== undefined) updatePayload.is_downloadable = data.is_downloadable
  if (data.is_visible !== undefined) updatePayload.is_visible = data.is_visible

  if (Object.keys(updatePayload).length === 0) {
    return { data: null }
  }

  const { error } = await supabase
    .from("study_materials")
    // @ts-ignore
    .update(updatePayload as any)
    .eq("id", materialId)
    .eq("school_id", context.schoolId)
    .eq("uploaded_by", teacher.id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath(STUDY_MATERIALS_PATH)
  return { data: null }
}

export async function deleteStudyMaterial(materialId: string) {
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
    .from("study_materials")
    .delete()
    .eq("id", materialId)
    .eq("school_id", context.schoolId)
    .eq("uploaded_by", teacher.id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath(STUDY_MATERIALS_PATH)
  return { data: null }
}

export async function incrementStudyMaterialView(materialId: string) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const { data: current } = await supabase
    .from("study_materials")
    .select("view_count")
    .eq("id", materialId)
    .eq("school_id", context.schoolId)
    .single()

  if (!current) {
    return { error: "Material not found" }
  }

  const { error } = await supabase
    .from("study_materials")
    .update({ view_count: (current.view_count || 0) + 1 })
    .eq("id", materialId)

  if (error) {
    return { error: error.message }
  }

  return { data: null }
}

export async function incrementStudyMaterialDownload(materialId: string) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const { data: current } = await supabase
    .from("study_materials")
    .select("download_count")
    .eq("id", materialId)
    .eq("school_id", context.schoolId)
    .single()

  if (!current) {
    return { error: "Material not found" }
  }

  const { error } = await supabase
    .from("study_materials")
    .update({ download_count: (current.download_count || 0) + 1 })
    .eq("id", materialId)

  if (error) {
    return { error: error.message }
  }

  return { data: null }
}
