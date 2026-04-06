import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { GradeEntryClient } from "@/components/teacher/grade-entry-client"
import { getTeacherAssignedClasses, getCurrentAcademicYear } from "@/lib/actions/teacher-grades"

export default async function GradeEntryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }

  // Get teacher ID from employee record
  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (!employee) {
    redirect("/dashboard/teacher")
  }

  const { data: currentYear } = await getCurrentAcademicYear()
  const { data: assignedClasses } = await getTeacherAssignedClasses(employee.id)

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Enter Grades</h1>
        <p className="text-muted-foreground">
          Manage grade entry for your classes and subjects
        </p>
      </div>

      <GradeEntryClient
        teacherId={employee.id}
        currentAcademicYearId={currentYear?.id}
        initialClasses={assignedClasses || []}
      />
    </div>
  )
}
