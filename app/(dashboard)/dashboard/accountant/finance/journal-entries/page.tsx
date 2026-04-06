import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { JournalEntriesClient } from "@/components/finance/journal-entries-client"

export default async function JournalEntriesPage() {
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

  const [
    { data: journalEntries },
    { data: chartOfAccounts },
  ] = await Promise.all([
    supabase
      .from("journal_entries")
      .select("*, journal_entry_lines(*, chart_of_accounts(account_code, account_name))")
      .eq("school_id", context.schoolId)
      .order("entry_date", { ascending: false })
      .limit(50),
    supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_name, account_type")
      .eq("school_id", context.schoolId)
      .order("account_code"),
  ])

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent mb-2">
            Journal Entries
          </h1>
          <p className="text-lg text-muted-foreground">
            Record manual journal entries and inter-account transfers
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/accountant/finance">Back to Finance</Link>
        </Button>
      </div>

      <JournalEntriesClient
        journalEntries={journalEntries || []}
        chartOfAccounts={chartOfAccounts || []}
      />
    </div>
  )
}
