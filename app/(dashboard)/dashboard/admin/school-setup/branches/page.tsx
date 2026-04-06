import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { getBranches } from "@/lib/actions/school-branches"
import { BranchesManager } from "@/components/school-setup/branches-manager"

export default async function BranchesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect("/login")
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }
  
  // Only school admins can manage branches
  if (context.role !== 'school_admin' && context.role !== 'super_admin') {
    redirect("/dashboard")
  }
  
  const { data: branches, error } = await getBranches()
  
  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">School Branches</h1>
        <p className="text-red-500">Error loading branches: {error}</p>
      </div>
    )
  }
  
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">School Branches</h1>
        <p className="text-muted-foreground">
          Manage your school branches. Branch admins can only access data from their assigned branch.
        </p>
      </div>
      
      <BranchesManager initialBranches={branches || []} />
    </div>
  )
}


