import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { getExams, getExamSessions } from "@/lib/actions/exams"
import { ExamsManager } from "@/components/academic/exams-manager"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BookOpen } from "lucide-react"

export default async function ExamsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }

  // Get academic years for filter
  const { data: academicYears } = await supabase
    .from("academic_years")
    .select("id, name, is_current")
    .eq("school_id", context.schoolId)
    .order("start_date", { ascending: false })

  // Get classes for exam session creation
  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, level")
    .eq("school_id", context.schoolId)
    .order("level", { ascending: true })

  // Get exams
  const examsResult = await getExams()
  const exams = examsResult.data || []

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Exam Management</h1>
        <p className="text-muted-foreground mt-2">
          Create and manage exams, enter grades, and generate report cards
        </p>
      </div>

      {!exams || exams.length === 0 ? (
        <Card>
          <CardContent className="pt-12 pb-12">
            <div className="text-center space-y-4">
              <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="font-semibold">No Exams Yet</h3>
              <p className="text-sm text-muted-foreground">
                Create your first exam to get started with grade management
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <ExamsManager
        initialExams={exams}
        academicYears={academicYears || []}
        classes={classes || []}
      />
    </div>
  )
}
