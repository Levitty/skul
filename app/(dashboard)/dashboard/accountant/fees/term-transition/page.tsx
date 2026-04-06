import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { TermTransitionClient } from "@/components/fees/term-transition-client"

export default async function TermTransitionPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }

  // Get all academic years with their terms
  const { data: academicYears } = await supabase
    .from("academic_years")
    .select("id, name, is_current")
    .eq("school_id", context.schoolId)
    .order("created_at", { ascending: false })

  // Get all terms
  const { data: terms } = await supabase
    .from("terms")
    .select("id, name, start_date, end_date, due_date, is_current, academic_year_id, academic_years(id, name)")
    .eq("school_id", context.schoolId)
    .order("start_date", { ascending: false })

  // Get all classes
  const { data: classes } = await supabase
    .from("classes")
    .select("id, name")
    .eq("school_id", context.schoolId)
    .order("name", { ascending: true })

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Term Transition</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Switch to a new term and generate invoices for all students in one step.
          Outstanding balances and transport fees are automatically carried forward.
        </p>
      </div>

      <TermTransitionClient
        terms={terms || []}
        classes={classes || []}
      />
    </div>
  )
}
