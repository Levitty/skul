import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { QuizDetailClient } from "@/components/lms/quiz-detail-client"

export default async function QuizDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }

  const { data: quiz, error } = await supabase
    .from("quizzes")
    .select("*, subjects(name), classes(name), quiz_questions(*, quiz_options(*))")
    .eq("id", id)
    .eq("school_id", context.schoolId)
    .single()

  if (error || !quiz) {
    redirect("/dashboard/teacher/quizzes")
  }

  if ((quiz as any).quiz_questions) {
    (quiz as any).quiz_questions.sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
  }

  return (
    <QuizDetailClient quiz={quiz as any} />
  )
}
