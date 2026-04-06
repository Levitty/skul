import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { getHomework } from "@/lib/actions/homework"
import { getSubjects } from "@/lib/actions/subjects"
import { getClasses } from "@/lib/actions/school-setup"
import { HomeworkManager } from "@/components/academic/homework-manager"

export default async function HomeworkPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect("/login")
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }
  
  const [homeworkResult, subjectsResult, classesResult, academicYearResult] = await Promise.all([
    getHomework(),
    getSubjects(),
    getClasses(),
    supabase
      .from("academic_years")
      .select("id, name, terms(id, name, is_current)")
      .eq("school_id", context.schoolId)
      .eq("is_current", true)
      .single(),
  ])
  
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Homework</h1>
        <p className="text-muted-foreground">
          Create and manage homework assignments
        </p>
      </div>
      
      <HomeworkManager 
        initialHomework={homeworkResult.data || []}
        subjects={subjectsResult.data || []}
        classes={classesResult.data || []}
        currentAcademicYear={academicYearResult.data as any}
      />
    </div>
  )
}


