import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { DisciplineClient } from "@/components/discipline/discipline-client"

export default async function DisciplinePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }

  const [incidentsRes, categoriesRes, studentsRes] = await Promise.all([
    supabase
      .from("discipline_incidents")
      .select("*, students(first_name, last_name, admission_number), discipline_categories(name, severity)")
      .eq("school_id", context.schoolId)
      .order("incident_date", { ascending: false })
      .limit(50),
    supabase
      .from("discipline_categories")
      .select("*")
      .eq("school_id", context.schoolId)
      .order("name"),
    supabase
      .from("students")
      .select("id, first_name, last_name, admission_number")
      .eq("school_id", context.schoolId)
      .eq("status", "active")
      .order("first_name"),
  ])

  return (
    <DisciplineClient
      initialIncidents={incidentsRes.data || []}
      initialCategories={categoriesRes.data || []}
      students={studentsRes.data || []}
    />
  )
}
