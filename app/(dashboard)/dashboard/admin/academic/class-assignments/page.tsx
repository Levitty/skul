import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { getClassAssignments, getAssignmentStats } from "@/lib/actions/class-assignments"
import { ClassAssignmentsManager } from "@/components/academic/class-assignments-manager"

export default async function ClassAssignmentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }

  const { data: assignments } = await getClassAssignments()
  const { data: stats } = await getAssignmentStats()

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Class-Teacher Assignments</h1>
        <p className="text-muted-foreground">
          Manage class-teacher-subject assignments and view coverage
        </p>
      </div>

      <ClassAssignmentsManager
        initialAssignments={assignments || []}
        initialStats={stats || {
          totalAssignments: 0,
          teachersAssigned: 0,
          classesCovered: 0,
          unassignedSubjects: 0,
        }}
      />
    </div>
  )
}
