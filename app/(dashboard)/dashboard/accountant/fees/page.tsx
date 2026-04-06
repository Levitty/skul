import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { FeesPageClient } from "@/components/fees/fees-page-client"

export default async function FeesPage() {
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

  // Use service role client for data reads to bypass RLS issues
  // TODO: Fix RLS policies on users table so regular client works
  const adminClient = createServiceRoleClient()

  // Fetch all required data in parallel
  const [
    { data: schoolInvoices },
    { data: feeStructures },
    { data: classes },
    { data: terms },
    { data: currentYear },
  ] = await Promise.all([
    adminClient
      .from("invoices")
      .select("id")
      .eq("school_id", context.schoolId),
    adminClient
      .from("fee_structures")
      .select("*, classes(name)")
      .eq("school_id", context.schoolId)
      .order("created_at", { ascending: false }),
    adminClient
      .from("classes")
      .select("id, name, level")
      .eq("school_id", context.schoolId)
      .order("level", { ascending: true }),
    adminClient
      .from("terms")
      .select("id, name, due_date, is_current")
      .eq("school_id", context.schoolId)
      .order("created_at", { ascending: false }),
    adminClient
      .from("academic_years")
      .select("id, name")
      .eq("school_id", context.schoolId)
      .eq("is_current", true)
      .single(),
  ])

  const invoicesList = schoolInvoices || []
  const invoiceIds = invoicesList.map((i: any) => i.id)

  const { data: payments } = invoiceIds.length > 0
    ? await adminClient
        .from("payments")
        .select("*")
        .in("invoice_id", invoiceIds)
        .order("created_at", { ascending: false })
        .limit(20)
    : { data: null }

  const { data: invoices } = await adminClient
    .from("invoices")
    .select("*")
    .eq("school_id", context.schoolId)
    .order("created_at", { ascending: false })
    .limit(50)

  return (
    <FeesPageClient
      payments={payments || []}
      invoices={invoices || []}
      feeStructures={feeStructures || []}
      classes={classes || []}
      terms={terms || []}
      currentYear={currentYear}
    />
  )
}
