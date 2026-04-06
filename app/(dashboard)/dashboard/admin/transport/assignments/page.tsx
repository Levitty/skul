import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { getRoutes, getStudentTransportAssignments } from "@/lib/actions/transport"
import { TransportAssignmentsManager } from "@/components/transport/assignments-manager"

export default async function AssignmentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect("/login")
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }
  
  // Get current academic year
  const { data: currentYear } = await supabase
    .from("academic_years")
    .select("id, name")
    .eq("school_id", context.schoolId)
    .eq("is_current", true)
    .single()
  
  const [routesResult, assignmentsResult, studentsResult] = await Promise.all([
    getRoutes(),
    getStudentTransportAssignments({ academicYearId: (currentYear as any)?.id }),
    supabase
      .from("students")
      .select("id, first_name, last_name, admission_number")
      .eq("school_id", context.schoolId)
      .eq("status", "active")
      .order("first_name", { ascending: true }),
  ])
  
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Student Transport Assignments</h1>
        <p className="text-muted-foreground">
          Assign students to transport routes
        </p>
      </div>
      
      <TransportAssignmentsManager 
        initialAssignments={assignmentsResult.data || []}
        routes={routesResult.data || []}
        students={studentsResult.data || []}
        currentAcademicYearId={(currentYear as any)?.id}
      />
    </div>
  )
}


