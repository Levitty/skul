"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

export async function getSubjects() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }
  
  const { data: subjects, error } = await supabase
    .from("subjects")
    .select("*")
    .eq("school_id", context.schoolId)
    .order("name", { ascending: true })
  
  if (error) {
    return { error: error.message }
  }
  
  return { data: subjects }
}

export async function createSubject(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }
  
  const name = formData.get("name") as string
  const code = formData.get("code") as string || null
  const description = formData.get("description") as string || null
  
  if (!name) {
    return { error: "Subject name is required" }
  }
  
  const { data: subject, error } = await supabase
    .from("subjects")
    // @ts-ignore
    .insert({
      school_id: context.schoolId,
      name,
      code,
      description,
    } as any)
    .select()
    .single()
  
  if (error) {
    return { error: error.message }
  }
  
  revalidatePath("/dashboard/admin/academic/subjects")
  return { success: true, data: subject }
}

export async function updateSubject(subjectId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }
  
  const name = formData.get("name") as string
  const code = formData.get("code") as string || null
  const description = formData.get("description") as string || null
  const isActive = formData.get("is_active") !== "false"
  
  const { error } = await supabase
    .from("subjects")
    // @ts-ignore
    .update({
      name,
      code,
      description,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", subjectId)
    .eq("school_id", context.schoolId)
  
  if (error) {
    return { error: error.message }
  }
  
  revalidatePath("/dashboard/admin/academic/subjects")
  return { success: true }
}

export async function deleteSubject(subjectId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }
  
  const { error } = await supabase
    .from("subjects")
    .delete()
    .eq("id", subjectId)
    .eq("school_id", context.schoolId)
  
  if (error) {
    return { error: error.message }
  }
  
  revalidatePath("/dashboard/admin/academic/subjects")
  return { success: true }
}

// ============ Class-Subject Mapping ============

export async function getClassSubjects(classId: string) {
  const supabase = await createClient()
  
  const { data: classSubjects, error } = await supabase
    .from("class_subjects")
    .select(`
      *,
      subject:subjects(id, name, code)
    `)
    .eq("class_id", classId)
  
  if (error) {
    return { error: error.message }
  }
  
  return { data: classSubjects }
}

export async function assignSubjectToClass(classId: string, subjectId: string, isRequired: boolean = true) {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from("class_subjects")
    // @ts-ignore
    .insert({
      class_id: classId,
      subject_id: subjectId,
      is_required: isRequired,
    } as any)
    .select()
    .single()
  
  if (error) {
    return { error: error.message }
  }
  
  revalidatePath("/dashboard/admin/academic/subjects")
  return { success: true, data }
}

export async function removeSubjectFromClass(classSubjectId: string) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from("class_subjects")
    .delete()
    .eq("id", classSubjectId)
  
  if (error) {
    return { error: error.message }
  }
  
  revalidatePath("/dashboard/admin/academic/subjects")
  return { success: true }
}


