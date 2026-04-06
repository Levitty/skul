import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { StudyMaterialsClient } from "@/components/academic/study-materials-client"

export default async function StudyMaterialsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }

  // Get teacher's employee record
  const { data: teacher } = await supabase
    .from("employees")
    .select("id")
    .eq("user_id", user.id)
    .eq("school_id", context.schoolId)
    .single()

  if (!teacher) {
    redirect("/login")
  }

  const { data: materials } = await supabase
    .from("study_materials")
    .select("*, class:classes(id, name), subject:subjects(id, name), uploaded_by:employees(id, first_name, last_name)")
    .eq("school_id", context.schoolId)
    .eq("uploaded_by", teacher.id)
    .order("created_at", { ascending: false })

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

  const { data: academicYear } = await supabase
    .from("academic_years")
    .select("id, name, terms(id, name, is_current)")
    .eq("school_id", context.schoolId)
    .eq("is_current", true)
    .single()

  return (
    <div className="p-6 space-y-6">
      <StudyMaterialsClient
        initialMaterials={materials || []}
        subjects={subjects || []}
        classes={classes || []}
        currentAcademicYear={academicYear as any}
      />
    </div>
  )
}
