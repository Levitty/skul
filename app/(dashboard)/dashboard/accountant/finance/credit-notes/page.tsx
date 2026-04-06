import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { CreditNotesClient } from "@/components/finance/credit-notes-client"
import Link from "next/link"
import { Button } from "@/components/ui/button"

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

  const { data: creditNotes, error: creditNotesError } = await supabase
    .from("credit_notes")
    .select("*, invoices(reference, amount), students(first_name, last_name, admission_number)")
    .eq("school_id", context.schoolId)
    .order("created_at", { ascending: false })

  const { data: invoices, error: invoicesError } = await supabase
    .from("invoices")
    .select("id, reference, amount, status, students(first_name, last_name)")
    .eq("school_id", context.schoolId)
    .in("status", ["pending", "partial", "overdue"])
    .order("created_at", { ascending: false })

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent mb-2">
            Credit Notes
          </h1>
          <p className="text-lg text-muted-foreground">
            Issue and manage credit notes for invoices
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/accountant/finance">Back to Finance</Link>
        </Button>
      </div>

      <CreditNotesClient
        creditNotes={creditNotesError ? [] : (creditNotes || [])}
        invoices={invoicesError ? [] : (invoices || [])}
      />
    </div>
  )
}
