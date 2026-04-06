import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { getStudentLeaves, getLeaveStats } from "@/lib/actions/student-leaves"
import { StudentLeavesManager } from "@/components/academic/student-leaves-manager"

export default async function StudentLeavesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect("/login")
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }
  
  const [leavesResult, statsResult] = await Promise.all([
    getStudentLeaves(),
    getLeaveStats(),
  ])
  
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Student Leaves</h1>
        <p className="text-muted-foreground">
          Manage student leave requests
        </p>
      </div>
      
      <StudentLeavesManager 
        initialLeaves={leavesResult.data || []}
        stats={statsResult.data}
      />
    </div>
  )
}


