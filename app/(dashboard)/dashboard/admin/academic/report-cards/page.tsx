import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { ReportCardsManager } from "@/components/academic/report-cards-manager"
import { Card, CardContent } from "@/components/ui/card"
import { FileText } from "lucide-react"

export default async function ReportCardsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }

  // Get academic years
  const { data: academicYears } = await supabase
    .from("academic_years")
    .select("id, name, is_current")
    .eq("school_id", context.schoolId)
    .order("start_date", { ascending: false })

  // Get classes
  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, level")
    .eq("school_id", context.schoolId)
    .order("level", { ascending: true })

  // Get terms
  const { data: terms } = await supabase
    .from("terms")
    .select("id, name, academic_year_id")
    .eq("school_id", context.schoolId)
    .order("academic_year_id", { ascending: false })

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Report Cards</h1>
        <p className="text-muted-foreground mt-2">
          Generate and manage student report cards by class, student, or term
        </p>
      </div>

      <ReportCardsManager
        academicYears={academicYears || []}
        classes={classes || []}
        terms={terms || []}
      />
    </div>
  )
}
