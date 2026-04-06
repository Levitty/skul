import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { InvoiceViewClient } from "@/components/fees/invoice-view-client"

export default async function InvoiceViewPage({
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

  // Fetch invoice with all related data
  const { data: invoice } = await supabase
    .from("invoices")
    .select(`
      *,
      invoice_items(*),
      students(id, first_name, last_name, admission_number),
      terms(name, due_date),
      academic_years(name)
    `)
    .eq("id", id)
    .eq("school_id", context.schoolId)
    .single()

  if (!invoice) {
    redirect("/dashboard/accountant/fees")
  }

  const invoiceData = invoice as any

  // Fetch payments for this invoice
  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select("*")
    .eq("invoice_id", invoiceData.id)
    .order("created_at", { ascending: false })

  // Fetch school details
  const { data: school, error: schoolError } = await supabase
    .from("schools")
    .select("name, address, phone, email")
    .eq("id", context.schoolId)
    .single()

  // Fetch guardians for the student
  const { data: guardians, error: guardiansError } = await supabase
    .from("guardians")
    .select("*")
    .eq("student_id", invoiceData.student_id)
    .eq("is_billing_contact", true)
    .limit(1)

  return (
    <InvoiceViewClient
      invoice={invoice}
      payments={payments || []}
      school={school}
      guardian={guardians?.[0]}
    />
  )
}


