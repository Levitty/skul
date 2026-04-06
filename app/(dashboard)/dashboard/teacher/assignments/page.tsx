import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { AssignmentsClient } from "@/components/lms/assignments-client"

export default async function AssignmentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }

  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("school_id", context.schoolId)
    .eq("user_id", user.id)
    .single()

  const teacherId = (employee as any)?.id || null

  const [assignmentsRes, subjectsRes, classesRes] = await Promise.all([
    supabase
      .from("assignments")
      .select("*, subjects(name), classes(name), assignment_submissions(count)")
      .eq("school_id", context.schoolId)
      .order("created_at", { ascending: false }),
    supabase
      .from("subjects")
      .select("id, name")
      .eq("school_id", context.schoolId)
      .order("name"),
    supabase
      .from("classes")
      .select("id, name")
      .eq("school_id", context.schoolId)
      .order("name"),
  ])

  return (
    <AssignmentsClient
      initialAssignments={assignmentsRes.data || []}
      subjects={subjectsRes.data || []}
      classes={classesRes.data || []}
      teacherId={teacherId}
    />
  )
}
