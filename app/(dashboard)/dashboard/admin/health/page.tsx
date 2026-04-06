import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { HealthClient } from "@/components/health/health-client"

export default async function HealthPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }

  const { data: clinicVisits } = await supabase
    .from("clinic_visits")
    .select("*, students(first_name, last_name, admission_number)")
    .eq("school_id", context.schoolId)
    .order("visit_date", { ascending: false })
    .limit(50)

  const { data: inventory } = await supabase
    .from("clinic_inventory")
    .select("*")
    .eq("school_id", context.schoolId)
    .order("name")

  const { data: students } = await supabase
    .from("students")
    .select("id, first_name, last_name, admission_number")
    .eq("school_id", context.schoolId)
    .eq("status", "active")
    .order("first_name")

  return (
    <HealthClient
      initialVisits={clinicVisits || []}
      initialInventory={inventory || []}
      students={students || []}
    />
  )
}
