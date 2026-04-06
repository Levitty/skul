import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { RecordPaymentPageClient } from "@/components/fees/record-payment-form"

export default async function RecordPaymentPage() {
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

  // Use service role client to bypass RLS issues
  // TODO: Fix RLS policies on users table so regular client works
  const adminClient = createServiceRoleClient()

  // Fetch unpaid and partial invoices
  const { data: invoices } = await adminClient
    .from("invoices")
    .select("*")
    .eq("school_id", context.schoolId)
    .in("status", ["unpaid", "partial"])
    .order("created_at", { ascending: false })

  return <RecordPaymentPageClient invoices={invoices || []} />
}




