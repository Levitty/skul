import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { AssignmentDetailClient } from "@/components/lms/assignment-detail-client"

export default async function AssignmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
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

  const { data: assignment, error } = await supabase
    .from("assignments")
    .select("*, subjects(name), classes(name), assignment_submissions(*, students(first_name, last_name, admission_number))")
    .eq("id", id)
    .eq("school_id", context.schoolId)
    .single()

  if (error || !assignment) {
    redirect("/dashboard/teacher/assignments")
  }

  return (
    <AssignmentDetailClient assignment={assignment as any} />
  )
}
