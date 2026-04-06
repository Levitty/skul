"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

const ASSIGNMENTS_PATH = "/dashboard/teacher/assignments"
const QUIZZES_PATH = "/dashboard/teacher/quizzes"

// ============ Assignments ============

export async function getAssignments(filters?: {
  class_id?: string
  subject_id?: string
  teacher_id?: string
}) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated" }

  const context = await requireTenantContext(user.id)

  let query = supabase
    .from("assignments")
    .select("*, subjects(name), classes(name), employees(first_name, last_name)")
    .eq("school_id", context.schoolId)

  if (filters?.class_id) {
    query = query.eq("class_id", filters.class_id)
  }
  if (filters?.subject_id) {
    query = query.eq("subject_id", filters.subject_id)
  }
  if (filters?.teacher_id) {
    query = query.eq("teacher_id", filters.teacher_id)
  }

  const { data, error } = await query.order("created_at", { ascending: false })

  if (error) return { error: error.message }

  return { data }
}

export async function getAssignment(id: string) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated" }

  const context = await requireTenantContext(user.id)

  const { data, error } = await supabase
    .from("assignments")
    .select("*, subjects(name), classes(name), assignment_submissions(*, students(first_name, last_name, admission_number))")
    .eq("id", id)
    .eq("school_id", context.schoolId)
    .single()

  if (error) return { error: error.message }

  return { data }
}

export async function createAssignment(data: {
  subject_id: string
  class_id: string
  teacher_id?: string
  title: string
  description?: string
  instructions?: string
  due_date?: string
  max_score?: number
  allow_late_submission?: boolean
}) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated" }

  const context = await requireTenantContext(user.id)

  if (!data.title || !data.subject_id || !data.class_id) {
    return { error: "Title, subject, and class are required" }
  }

  const { data: assignment, error } = await supabase
    .from("assignments")
    // @ts-ignore
    .insert({
      school_id: context.schoolId,
      subject_id: data.subject_id,
      class_id: data.class_id,
      teacher_id: data.teacher_id ?? null,
      title: data.title,
      description: data.description ?? null,
      instructions: data.instructions ?? null,
      due_date: data.due_date ?? null,
      max_score: data.max_score ?? 100,
      allow_late_submission: data.allow_late_submission ?? false,
    } as any)
    .select()
    .single()

  if (error) return { error: error.message }

  revalidatePath(ASSIGNMENTS_PATH)
  return { data: assignment }
}

export async function updateAssignment(id: string, data: {
  title?: string
  description?: string
  instructions?: string
  due_date?: string
  max_score?: number
  allow_late_submission?: boolean
  is_published?: boolean
  subject_id?: string
  class_id?: string
}) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated" }

  const context = await requireTenantContext(user.id)

  const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (data.title !== undefined) updatePayload.title = data.title
  if (data.description !== undefined) updatePayload.description = data.description
  if (data.instructions !== undefined) updatePayload.instructions = data.instructions
  if (data.due_date !== undefined) updatePayload.due_date = data.due_date
  if (data.max_score !== undefined) updatePayload.max_score = data.max_score
  if (data.allow_late_submission !== undefined) updatePayload.allow_late_submission = data.allow_late_submission
  if (data.is_published !== undefined) updatePayload.is_published = data.is_published
  if (data.subject_id !== undefined) updatePayload.subject_id = data.subject_id
  if (data.class_id !== undefined) updatePayload.class_id = data.class_id

  const { data: assignment, error } = await supabase
    .from("assignments")
    // @ts-ignore
    .update(updatePayload)
    .eq("id", id)
    .eq("school_id", context.schoolId)
    .select()
    .single()

  if (error) return { error: error.message }

  revalidatePath(ASSIGNMENTS_PATH)
  return { data: assignment }
}

export async function deleteAssignment(id: string) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated" }

  const context = await requireTenantContext(user.id)

  const { error } = await supabase
    .from("assignments")
    .delete()
    .eq("id", id)
    .eq("school_id", context.schoolId)

  if (error) return { error: error.message }

  revalidatePath(ASSIGNMENTS_PATH)
  return { data: null }
}

export async function gradeSubmission(submissionId: string, data: {
  score: number
  feedback?: string
}) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated" }

  await requireTenantContext(user.id)

  const { data: submission, error } = await supabase
    .from("assignment_submissions")
    // @ts-ignore
    .update({
      score: data.score,
      feedback: data.feedback ?? null,
      graded_at: new Date().toISOString(),
      graded_by: user.id,
      status: "graded",
    } as any)
    .eq("id", submissionId)
    .select()
    .single()

  if (error) return { error: error.message }

  revalidatePath(ASSIGNMENTS_PATH)
  return { data: submission }
}

// ============ Quizzes ============

export async function getQuizzes(filters?: {
  class_id?: string
  subject_id?: string
  teacher_id?: string
}) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated" }

  const context = await requireTenantContext(user.id)

  let query = supabase
    .from("quizzes")
    .select("*, subjects(name), classes(name), employees(first_name, last_name)")
    .eq("school_id", context.schoolId)

  if (filters?.class_id) {
    query = query.eq("class_id", filters.class_id)
  }
  if (filters?.subject_id) {
    query = query.eq("subject_id", filters.subject_id)
  }
  if (filters?.teacher_id) {
    query = query.eq("teacher_id", filters.teacher_id)
  }

  const { data, error } = await query.order("created_at", { ascending: false })

  if (error) return { error: error.message }

  return { data }
}

export async function getQuiz(id: string) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated" }

  const context = await requireTenantContext(user.id)

  const { data, error } = await supabase
    .from("quizzes")
    .select("*, subjects(name), classes(name), quiz_questions(*, quiz_options(*))")
    .eq("id", id)
    .eq("school_id", context.schoolId)
    .single()

  if (error) return { error: error.message }

  if (data?.quiz_questions) {
    (data as any).quiz_questions.sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
  }

  return { data }
}

export async function createQuiz(data: {
  subject_id: string
  class_id: string
  teacher_id?: string
  title: string
  description?: string
  time_limit_minutes?: number
  max_attempts?: number
  passing_score?: number
  shuffle_questions?: boolean
  show_answers_after?: boolean
}) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated" }

  const context = await requireTenantContext(user.id)

  if (!data.title || !data.subject_id || !data.class_id) {
    return { error: "Title, subject, and class are required" }
  }

  const { data: quiz, error } = await supabase
    .from("quizzes")
    // @ts-ignore
    .insert({
      school_id: context.schoolId,
      subject_id: data.subject_id,
      class_id: data.class_id,
      teacher_id: data.teacher_id ?? null,
      title: data.title,
      description: data.description ?? null,
      time_limit_minutes: data.time_limit_minutes ?? null,
      max_attempts: data.max_attempts ?? 1,
      passing_score: data.passing_score ?? null,
      shuffle_questions: data.shuffle_questions ?? false,
      show_answers_after: data.show_answers_after ?? true,
    } as any)
    .select()
    .single()

  if (error) return { error: error.message }

  revalidatePath(QUIZZES_PATH)
  return { data: quiz }
}

export async function updateQuiz(id: string, data: {
  title?: string
  description?: string
  time_limit_minutes?: number
  max_attempts?: number
  passing_score?: number
  shuffle_questions?: boolean
  show_answers_after?: boolean
  is_published?: boolean
  subject_id?: string
  class_id?: string
}) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated" }

  const context = await requireTenantContext(user.id)

  const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (data.title !== undefined) updatePayload.title = data.title
  if (data.description !== undefined) updatePayload.description = data.description
  if (data.time_limit_minutes !== undefined) updatePayload.time_limit_minutes = data.time_limit_minutes
  if (data.max_attempts !== undefined) updatePayload.max_attempts = data.max_attempts
  if (data.passing_score !== undefined) updatePayload.passing_score = data.passing_score
  if (data.shuffle_questions !== undefined) updatePayload.shuffle_questions = data.shuffle_questions
  if (data.show_answers_after !== undefined) updatePayload.show_answers_after = data.show_answers_after
  if (data.is_published !== undefined) updatePayload.is_published = data.is_published
  if (data.subject_id !== undefined) updatePayload.subject_id = data.subject_id
  if (data.class_id !== undefined) updatePayload.class_id = data.class_id

  const { data: quiz, error } = await supabase
    .from("quizzes")
    // @ts-ignore
    .update(updatePayload)
    .eq("id", id)
    .eq("school_id", context.schoolId)
    .select()
    .single()

  if (error) return { error: error.message }

  revalidatePath(QUIZZES_PATH)
  return { data: quiz }
}

export async function deleteQuiz(id: string) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated" }

  const context = await requireTenantContext(user.id)

  const { error } = await supabase
    .from("quizzes")
    .delete()
    .eq("id", id)
    .eq("school_id", context.schoolId)

  if (error) return { error: error.message }

  revalidatePath(QUIZZES_PATH)
  return { data: null }
}

export async function addQuizQuestion(quizId: string, data: {
  question_text: string
  question_type: string
  points?: number
  explanation?: string
  options?: Array<{ option_text: string; is_correct: boolean }>
}) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated" }

  await requireTenantContext(user.id)

  if (!data.question_text || !data.question_type) {
    return { error: "Question text and type are required" }
  }

  const { data: existingQuestions } = await supabase
    .from("quiz_questions")
    .select("order_index")
    .eq("quiz_id", quizId)
    .order("order_index", { ascending: false })
    .limit(1)

  const nextOrder = (existingQuestions?.[0]?.order_index ?? -1) + 1

  const { data: question, error: qError } = await supabase
    .from("quiz_questions")
    // @ts-ignore
    .insert({
      quiz_id: quizId,
      question_text: data.question_text,
      question_type: data.question_type,
      points: data.points ?? 1,
      explanation: data.explanation ?? null,
      order_index: nextOrder,
    } as any)
    .select()
    .single()

  if (qError) return { error: qError.message }

  if (data.options && data.options.length > 0 && question) {
    const optionRows = data.options.map((opt, idx) => ({
      question_id: (question as any).id,
      option_text: opt.option_text,
      is_correct: opt.is_correct,
      order_index: idx,
    }))

    const { error: oError } = await supabase
      .from("quiz_options")
      // @ts-ignore
      .insert(optionRows as any)

    if (oError) return { error: oError.message }
  }

  revalidatePath(QUIZZES_PATH)
  return { data: question }
}

export async function updateQuizQuestion(questionId: string, data: {
  question_text?: string
  question_type?: string
  points?: number
  explanation?: string
}) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated" }

  await requireTenantContext(user.id)

  const updatePayload: Record<string, unknown> = {}

  if (data.question_text !== undefined) updatePayload.question_text = data.question_text
  if (data.question_type !== undefined) updatePayload.question_type = data.question_type
  if (data.points !== undefined) updatePayload.points = data.points
  if (data.explanation !== undefined) updatePayload.explanation = data.explanation

  const { data: question, error } = await supabase
    .from("quiz_questions")
    // @ts-ignore
    .update(updatePayload)
    .eq("id", questionId)
    .select()
    .single()

  if (error) return { error: error.message }

  revalidatePath(QUIZZES_PATH)
  return { data: question }
}

export async function deleteQuizQuestion(questionId: string) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated" }

  await requireTenantContext(user.id)

  const { error } = await supabase
    .from("quiz_questions")
    .delete()
    .eq("id", questionId)

  if (error) return { error: error.message }

  revalidatePath(QUIZZES_PATH)
  return { data: null }
}
