import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { PromoteStudentsForm } from "@/components/students/promote-students-form"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default async function PromoteStudentsPage() {
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

  // Fetch required data
  const [
    { data: academicYears },
    { data: classes },
    { data: sections },
    { data: students },
  ] = await Promise.all([
    supabase
      .from("academic_years")
      .select("*")
      .eq("school_id", context.schoolId)
      .order("start_date", { ascending: false }),
    supabase
      .from("classes")
      .select("*")
      .eq("school_id", context.schoolId)
      .order("level", { ascending: true }),
    supabase
      .from("sections")
      .select("*, classes!inner(school_id)")
      .eq("classes.school_id", context.schoolId),
    supabase
      .from("students")
      .select(`
        *,
        enrollments(
          id,
          academic_year_id,
          class_id,
          section_id,
          classes(name),
          sections(name),
          academic_years(name, is_current)
        )
      `)
      .eq("school_id", context.schoolId)
      .eq("status", "active")
      .order("first_name", { ascending: true }),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/admin/students"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Students
        </Link>
      </div>

      <div>
        <h1 className="text-3xl font-bold">Promote Students</h1>
        <p className="text-muted-foreground">
          Promote students from one class/academic year to the next
        </p>
      </div>

      <PromoteStudentsForm
        academicYears={academicYears || []}
        classes={classes || []}
        sections={sections || []}
        students={students || []}
      />
    </div>
  )
}



