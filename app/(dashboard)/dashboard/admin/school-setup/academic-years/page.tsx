import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Calendar } from "lucide-react"
import { AcademicYearsManager } from "@/components/school-setup/academic-years-manager"

export default async function AcademicYearsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }

  const { data: academicYears } = await supabase
    .from("academic_years")
    .select("*, terms(id, name, start_date, end_date, due_date, is_current)")
    .eq("school_id", context.schoolId)
    .order("start_date", { ascending: false })

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/admin/school-setup"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Setup
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent mb-2">
            Academic Years & Terms
          </h1>
          <p className="text-lg text-muted-foreground">
            Configure academic calendar and term dates
          </p>
        </div>
      </div>

      {/* Info Card */}
      <Card className="border-0 shadow-lg bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-1">About Academic Years</h3>
              <p className="text-sm text-muted-foreground">
                Academic years define the school calendar (e.g., 2024-2025). Each year can have 
                multiple terms with specific start/end dates and fee due dates. Mark one year 
                and one term as &quot;current&quot; to set the active academic context.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Academic Years Manager */}
      <AcademicYearsManager initialYears={academicYears || []} />
    </div>
  )
}


