import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { EnhancedAdmissionForm } from "@/components/students/enhanced-admission-form"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default async function NewStudentPage() {
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

  // Fetch all required data in parallel
  const [
    { data: classes, error: classesError },
    { data: sections, error: sectionsError },
    { data: subjects, error: subjectsError },
    { data: activities, error: activitiesError },
    { data: transportRoutes, error: transportRoutesError },
    { data: hostels, error: hostelsError },
    { data: feeStructures, error: feeStructuresError },
    { data: terms, error: termsError },
  ] = await Promise.all([
    supabase
      .from("classes")
      .select("*")
      .eq("school_id", context.schoolId)
      .order("level", { ascending: true }),
    supabase
      .from("sections")
      .select("id, name, capacity, class_id, classes!inner(id, name, school_id)")
      .eq("classes.school_id", context.schoolId)
      .order("name", { ascending: true }),
    supabase
      .from("subjects")
      .select("*, class_subjects(class_id)")
      .eq("school_id", context.schoolId)
      .eq("is_active", true),
    supabase
      .from("activities")
      .select("*")
      .eq("school_id", context.schoolId)
      .eq("is_active", true),
    supabase
      .from("transport_routes")
      .select("*")
      .eq("school_id", context.schoolId)
      .eq("is_active", true),
    supabase
      .from("hostels")
      .select("*")
      .eq("school_id", context.schoolId)
      .eq("is_active", true),
    supabase
      .from("fee_structures")
      .select("*")
      .eq("school_id", context.schoolId)
      .eq("is_active", true),
    supabase
      .from("terms")
      .select("*")
      .eq("school_id", context.schoolId)
      .order("start_date", { ascending: false }),
  ])

  // Log any errors for debugging
  if (sectionsError) {
    console.error("Error fetching sections:", sectionsError)
  }

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
        <h1 className="text-3xl font-bold">Admit New Student</h1>
        <p className="text-muted-foreground">
          Complete the admission form to enroll a new student
        </p>
      </div>

      <EnhancedAdmissionForm
        classes={classes || []}
        sections={sections || []}
        subjects={subjects || []}
        activities={activities || []}
        transportRoutes={transportRoutes || []}
        hostels={hostels || []}
        feeStructures={feeStructures || []}
        terms={terms || []}
      />
    </div>
  )
}
