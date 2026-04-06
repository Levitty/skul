import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { LessonPlansClient } from "@/components/academic/lesson-plans-client"

export default async function LessonPlansPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }

  const { data: lessonPlans } = await supabase
    .from("lesson_plans")
    .select("*, subjects(name), classes(name), employees(first_name, last_name)")
    .eq("school_id", context.schoolId)
    .order("lesson_date", { ascending: false })
    .limit(50)

  const { data: subjects } = await supabase
    .from("subjects")
    .select("id, name")
    .eq("school_id", context.schoolId)
    .eq("is_active", true)
    .order("name")

  const { data: classes } = await supabase
    .from("classes")
    .select("id, name")
    .eq("school_id", context.schoolId)
    .order("name")

  const { data: teachers } = await supabase
    .from("employees")
    .select("id, first_name, last_name")
    .eq("school_id", context.schoolId)
    .order("first_name")

  return (
    <div className="p-6 space-y-6">
      <LessonPlansClient
        initialPlans={lessonPlans || []}
        subjects={subjects || []}
        classes={classes || []}
        teachers={teachers || []}
      />
    </div>
  )
}
