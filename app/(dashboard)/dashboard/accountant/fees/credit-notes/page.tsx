import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { CreditNotesPageClient } from "@/components/fees/credit-notes-page-client"

export default async function CreditNotesPage() {
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

  // Fetch all required data
  const [
    { data: creditNotes },
    { data: invoices },
    { data: students },
  ] = await Promise.all([
    supabase
      .from("credit_notes")
      .select(`
        *,
        invoices(id, reference, amount, status),
        students(id, first_name, last_name, admission_number)
      `)
      .eq("school_id", context.schoolId)
      .order("issued_at", { ascending: false }),
    supabase
      .from("invoices")
      .select("id, reference, amount, status, student_id, discount_amount")
      .eq("school_id", context.schoolId)
      .in("status", ["unpaid", "partial"])
      .order("created_at", { ascending: false }),
    supabase
      .from("students")
      .select("id, first_name, last_name, admission_number, status")
      .eq("school_id", context.schoolId)
      .eq("status", "active")
      .order("first_name", { ascending: true }),
  ])

  return (
    <CreditNotesPageClient
      creditNotes={creditNotes || []}
      invoices={invoices || []}
      students={students || []}
    />
  )
}
