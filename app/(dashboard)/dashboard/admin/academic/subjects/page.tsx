import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { getSubjects } from "@/lib/actions/subjects"
import { SubjectsManager } from "@/components/academic/subjects-manager"

export default async function SubjectsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect("/login")
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }
  
  const { data: subjects } = await getSubjects()
  
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Subjects</h1>
        <p className="text-muted-foreground">
          Manage school subjects
        </p>
      </div>
      
      <SubjectsManager initialSubjects={subjects || []} />
    </div>
  )
}


