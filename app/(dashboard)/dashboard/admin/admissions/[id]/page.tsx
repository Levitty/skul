import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { ApplicationReviewClient } from "@/components/admissions/application-review-client"

export default async function ApplicationReviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
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

  // Fetch application
  const { data: application, error } = await supabase
    .from("applications")
    .select("*")
    .eq("id", id)
    .single()

  if (error || !application) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Application Not Found</h1>
          <p className="text-muted-foreground">
            The application you&apos;re looking for doesn&apos;t exist or you don&apos;t have access.
          </p>
        </div>
      </div>
    )
  }

  // Type assertion to help TypeScript understand the structure
  const app = application as any

  // Fetch classes for enrollment selection
  const { data: classes, error: classesError } = await supabase
    .from("classes")
    .select("id, name, level")
    .eq("school_id", context.schoolId)
    .order("level", { ascending: true })

  let sectionsData = null
  if (app.applied_class_id) {
    const { data, error: sectionsError } = await supabase
      .from("sections")
      .select("id, name")
      .eq("class_id", app.applied_class_id)
    if (!sectionsError) {
      sectionsData = data
    }
  }
  
  const sections = sectionsData

  // Fetch current academic year
  const { data: currentYear, error: yearError } = await supabase
    .from("academic_years")
    .select("id, name")
    .eq("school_id", context.schoolId)
    .eq("is_current", true)
    .single()

  // Fetch current term
  const { data: currentTerm, error: termError } = !yearError && currentYear
    ? await supabase
        .from("terms")
        .select("id, name")
        .eq("academic_year_id", (currentYear as any).id)
        .eq("is_current", true)
        .single()
    : { data: null, error: null }

  // Fetch activities, fee structures, and transport routes in parallel
  const [
    { data: activities },
    { data: feeStructures },
    { data: transportRoutes },
    { data: allSections },
  ] = await Promise.all([
    supabase
      .from("activities")
      .select("id, name, fee_amount")
      .eq("school_id", context.schoolId)
      .eq("is_active", true),
    supabase
      .from("fee_structures")
      .select("id, name, amount, fee_type, class_id")
      .eq("school_id", context.schoolId)
      .eq("is_active", true)
      .eq("academic_year_id", (currentYear as any)?.id || "")
      .order("fee_type"),
    supabase
      .from("transport_routes")
      .select("id, name, route_number, start_location, end_location, fee_amount")
      .eq("school_id", context.schoolId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("sections")
      .select("id, name, class_id")
      .in("class_id", (classes || []).map((c: any) => c.id)),
  ])

  return (
    <ApplicationReviewClient
      application={app}
      classes={classes || []}
      sections={allSections || sections || []}
      currentYear={currentYear}
      currentTerm={currentTerm}
      activities={activities || []}
      feeStructures={feeStructures || []}
      transportRoutes={transportRoutes || []}
    />
  )
}


