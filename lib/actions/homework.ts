"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

export async function getHomework(filters?: {
  classId?: string
  subjectId?: string
  status?: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }
  
  let query = supabase
    .from("homework")
    .select(`
      *,
      class:classes(id, name),
      section:sections(id, name),
      subject:subjects(id, name),
      teacher:employees(id, user_profiles(full_name))
    `)
    .eq("school_id", context.schoolId)
  
  if (filters?.classId) {
    query = query.eq("class_id", filters.classId)
  }
  
  if (filters?.subjectId) {
    query = query.eq("subject_id", filters.subjectId)
  }
  
  if (filters?.status) {
    query = query.eq("status", filters.status)
  }
  
  const { data: homework, error } = await query.order("due_date", { ascending: false })
  
  if (error) {
    return { error: error.message }
  }
  
  return { data: homework }
}

export async function createHomework(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }
  
  const classId = formData.get("class_id") as string
  const sectionId = formData.get("section_id") as string || null
  const subjectId = formData.get("subject_id") as string || null
  const title = formData.get("title") as string
  const description = formData.get("description") as string || null
  const instructions = formData.get("instructions") as string || null
  const dueDate = formData.get("due_date") as string
  const dueTime = formData.get("due_time") as string || null
  const maxMarks = parseInt(formData.get("max_marks") as string) || null
  const isGraded = formData.get("is_graded") === "true"
  const status = formData.get("status") as string || "active"
  const academicYearId = formData.get("academic_year_id") as string || null
  const termId = formData.get("term_id") as string || null
  
  if (!classId || !title || !dueDate) {
    return { error: "Class, title, and due date are required" }
  }
  
  // Get teacher's employee ID if they are a teacher
  let teacherId = null
  if (context.role === "teacher") {
    const { data: employee } = await supabase
      .from("employees")
      .select("id")
      .eq("user_id", user.id)
      .single()
    teacherId = (employee as any)?.id || null
  }
  
  const { data: homework, error } = await supabase
    .from("homework")
    // @ts-ignore
    .insert({
      school_id: context.schoolId,
      class_id: classId,
      section_id: sectionId,
      subject_id: subjectId,
      teacher_id: teacherId,
      title,
      description,
      instructions,
      due_date: dueDate,
      due_time: dueTime,
      max_marks: maxMarks,
      is_graded: isGraded,
      status,
      academic_year_id: academicYearId,
      term_id: termId,
    } as any)
    .select()
    .single()
  
  if (error) {
    return { error: error.message }
  }
  
  revalidatePath("/dashboard/teacher/homework")
  return { success: true, data: homework }
}

export async function updateHomework(homeworkId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }
  
  const title = formData.get("title") as string
  const description = formData.get("description") as string || null
  const instructions = formData.get("instructions") as string || null
  const dueDate = formData.get("due_date") as string
  const dueTime = formData.get("due_time") as string || null
  const maxMarks = parseInt(formData.get("max_marks") as string) || null
  const isGraded = formData.get("is_graded") === "true"
  const status = formData.get("status") as string || "active"
  
  const { error } = await supabase
    .from("homework")
    // @ts-ignore
    .update({
      title,
      description,
      instructions,
      due_date: dueDate,
      due_time: dueTime,
      max_marks: maxMarks,
      is_graded: isGraded,
      status,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", homeworkId)
    .eq("school_id", context.schoolId)
  
  if (error) {
    return { error: error.message }
  }
  
  revalidatePath("/dashboard/teacher/homework")
  return { success: true }
}

export async function deleteHomework(homeworkId: string) {
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
    .from("homework")
    .delete()
    .eq("id", homeworkId)
    .eq("school_id", context.schoolId)
  
  if (error) {
    return { error: error.message }
  }
  
  revalidatePath("/dashboard/teacher/homework")
  return { success: true }
}

// ============ Homework Submissions ============

export async function getHomeworkSubmissions(homeworkId: string) {
  const supabase = await createClient()
  
  const { data: submissions, error } = await supabase
    .from("homework_submissions")
    .select(`
      *,
      student:students(id, first_name, last_name, admission_number)
    `)
    .eq("homework_id", homeworkId)
    .order("submitted_at", { ascending: false })
  
  if (error) {
    return { error: error.message }
  }
  
  return { data: submissions }
}

export async function gradeSubmission(submissionId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const marksObtained = parseInt(formData.get("marks_obtained") as string)
  const feedback = formData.get("feedback") as string || null
  
  // Get teacher's employee ID
  let gradedBy = null
  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("user_id", user.id)
    .single()
  gradedBy = (employee as any)?.id || null
  
  const { error } = await supabase
    .from("homework_submissions")
    // @ts-ignore
    .update({
      marks_obtained: marksObtained,
      feedback,
      graded_at: new Date().toISOString(),
      graded_by: gradedBy,
      status: "graded",
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", submissionId)
  
  if (error) {
    return { error: error.message }
  }
  
  revalidatePath("/dashboard/teacher/homework")
  return { success: true }
}


