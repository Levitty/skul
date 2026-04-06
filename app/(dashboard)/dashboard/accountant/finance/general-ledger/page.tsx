import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getGeneralLedger } from "@/lib/actions/general-ledger"
import Link from "next/link"
import { GeneralLedgerClient } from "@/components/finance/general-ledger-client"

export default async function GeneralLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string; startDate?: string; endDate?: string }>
}) {
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

  const params = await searchParams
  const startDate = params.startDate || new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0]
  const endDate = params.endDate || new Date().toISOString().split("T")[0]

  const entries = await getGeneralLedger({
    accountId: params.accountId,
    startDate,
    endDate,
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent mb-2">
            General Ledger
          </h1>
          <p className="text-lg text-muted-foreground">
            Complete transaction history
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/accountant/finance">Back to Finance</Link>
        </Button>
      </div>

      <GeneralLedgerClient entries={entries} />
    </div>
  )
}



