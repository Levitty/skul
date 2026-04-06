import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getBankTransactions, getReconciliationSummary, getUnmatchedPayments } from "@/lib/actions/bank-reconciliation"
import { getBankAccounts } from "@/lib/actions/bank-accounts"
import Link from "next/link"
import { BankReconciliationClient } from "@/components/finance/bank-reconciliation-client"

export default async function BankReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string }>
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
  const bankAccounts = await getBankAccounts()
  
  const selectedAccountId = params.accountId || (bankAccounts.length > 0 ? (bankAccounts[0] as any).id : null)
  
  let transactions: any[] = []
  let summary: any = null
  let unmatchedPayments: any[] = []

  if (selectedAccountId) {
    transactions = await getBankTransactions(selectedAccountId, {
      isReconciled: false,
    })
    summary = await getReconciliationSummary(selectedAccountId)
    unmatchedPayments = await getUnmatchedPayments(selectedAccountId)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent mb-2">
            Bank Reconciliation
          </h1>
          <p className="text-lg text-muted-foreground">
            Match bank transactions with recorded payments and expenses
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard/accountant/finance/banking">Manage Accounts</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard/accountant/finance">Back to Finance</Link>
          </Button>
        </div>
      </div>

      {bankAccounts.length === 0 ? (
        <Card className="border-0 shadow-xl">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">No bank accounts configured</p>
            <Button asChild>
              <Link href="/dashboard/accountant/finance/banking">Add Bank Account</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            {summary && (
              <>
                <Card className="border-0 shadow-lg">
                  <CardHeader className="pb-3">
                    <CardDescription>Bank Balance</CardDescription>
                    <CardTitle className="text-2xl">KES {summary.bankAccountBalance.toLocaleString()}</CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border-0 shadow-lg">
                  <CardHeader className="pb-3">
                    <CardDescription>Statement Balance</CardDescription>
                    <CardTitle className="text-2xl">KES {summary.statementBalance.toLocaleString()}</CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border-0 shadow-lg">
                  <CardHeader className="pb-3">
                    <CardDescription>Unreconciled</CardDescription>
                    <CardTitle className={`text-2xl ${summary.unreconciledCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                      {summary.unreconciledCount}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border-0 shadow-lg">
                  <CardHeader className="pb-3">
                    <CardDescription>Difference</CardDescription>
                    <CardTitle className={`text-2xl ${Math.abs(summary.difference) > 0.01 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                      KES {Math.abs(summary.difference).toLocaleString()}
                    </CardTitle>
                  </CardHeader>
                </Card>
              </>
            )}
          </div>

          <BankReconciliationClient
            bankAccounts={bankAccounts}
            selectedAccountId={selectedAccountId}
            transactions={transactions}
            unmatchedPayments={unmatchedPayments}
          />
        </>
      )}
    </div>
  )
}

