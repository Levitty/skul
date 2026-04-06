import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { GenerateInvoiceForm } from "@/components/fees/generate-invoice-form"

export default async function GenerateInvoicePage() {
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

  // Get current academic year for fee structures
  const { data: currentYear } = await supabase
    .from("academic_years")
    .select("id")
    .eq("school_id", context.schoolId)
    .eq("is_current", true)
    .single()

  const [
    { data: students },
    { data: terms },
    { data: activities },
    { data: transportRoutes },
    { data: feeStructures },
    { data: enrollments },
    { data: studentServices },
  ] = await Promise.all([
    supabase
      .from("students")
      .select("id, first_name, last_name, admission_number, status")
      .eq("school_id", context.schoolId)
      .eq("status", "active")
      .order("first_name", { ascending: true }),
    supabase
      .from("terms")
      .select("id, name, due_date, is_current, academic_year_id")
      .eq("school_id", context.schoolId)
      .order("created_at", { ascending: false }),
    supabase
      .from("activities")
      .select("id, name, fee_amount")
      .eq("school_id", context.schoolId)
      .eq("is_active", true),
    supabase
      .from("transport_routes")
      .select("id, name, route_number, start_location, end_location, fee_amount")
      .eq("school_id", context.schoolId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("fee_structures")
      .select("id, name, amount, fee_type, class_id, academic_year_id")
      .eq("school_id", context.schoolId)
      .eq("is_active", true),
    supabase
      .from("enrollments")
      .select("student_id, class_id, classes(id, name)")
      .eq("academic_year_id", (currentYear as any)?.id || ""),
    supabase
      .from("student_services")
      .select("student_id, boarding_enabled, transport_enabled, transport_route_id"),
  ])

  return (
    <GenerateInvoiceForm
      students={students || []}
      terms={terms || []}
      activities={activities || []}
      transportRoutes={transportRoutes || []}
      feeStructures={feeStructures || []}
      enrollments={enrollments || []}
      studentServices={studentServices || []}
    />
  )
}




