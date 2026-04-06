import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getBankAccounts } from "@/lib/actions/bank-accounts"
import Link from "next/link"
import { BankAccountsClient } from "@/components/finance/bank-accounts-client"

export default async function BankingPage() {
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

  const bankAccounts = await getBankAccounts()
  const totalBalance = bankAccounts.reduce((sum: number, ba: any) => sum + (Number(ba.current_balance) || 0), 0)

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent mb-2">
            Bank Accounts
          </h1>
          <p className="text-lg text-muted-foreground">
            Manage bank accounts and track balances
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/dashboard/accountant/finance/banking/new">Add Account</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard/accountant/finance">Back to Finance</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-0 shadow-lg">
          <CardHeader className="pb-3">
            <CardDescription>Total Balance</CardDescription>
            <CardTitle className="text-2xl">KES {totalBalance.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-0 shadow-lg">
          <CardHeader className="pb-3">
            <CardDescription>Active Accounts</CardDescription>
            <CardTitle className="text-2xl">{bankAccounts.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-0 shadow-lg">
          <CardHeader className="pb-3">
            <CardDescription>Actions</CardDescription>
            <Button variant="outline" size="sm" asChild className="mt-2">
              <Link href="/dashboard/accountant/finance/bank-reconciliation">Reconcile</Link>
            </Button>
          </CardHeader>
        </Card>
      </div>

      <BankAccountsClient bankAccounts={bankAccounts} />
    </div>
  )
}



