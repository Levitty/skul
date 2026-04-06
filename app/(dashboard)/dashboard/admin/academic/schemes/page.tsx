import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { SchemesClient } from "@/components/academic/schemes-client"

export default async function SchemesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }

  const { data: schemes } = await supabase
    .from("schemes_of_work")
    .select("*, subjects(name), classes(name), terms(name), employees(first_name, last_name)")
    .eq("school_id", context.schoolId)
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

  const { data: terms } = await supabase
    .from("terms")
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
      <SchemesClient
        initialSchemes={schemes || []}
        subjects={subjects || []}
        classes={classes || []}
        terms={terms || []}
        teachers={teachers || []}
      />
    </div>
  )
}
