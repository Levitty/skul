import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getAccountsPayable, payAccountsPayable } from "@/lib/actions/accounts-payable"
import Link from "next/link"
import { AccountsPayableClient } from "@/components/finance/accounts-payable-client"

export default async function AccountsPayablePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
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
  const payables = await getAccountsPayable({
    status: params.status,
  })

  const totalPayable = payables.reduce((sum: number, ap: any) => {
    const amount = Number(ap.amount) || 0
    const paidAmount = Number(ap.paid_amount) || 0
    return sum + (amount - paidAmount)
  }, 0)

  const overduePayables = payables.filter((ap: any) => ap.status === "overdue")
  const unpaidPayables = payables.filter((ap: any) => ap.status === "unpaid")
  const totalOverdue = overduePayables.reduce((sum: number, ap: any) => {
    const amount = Number(ap.amount) || 0
    const paidAmount = Number(ap.paid_amount) || 0
    return sum + (amount - paidAmount)
  }, 0)

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent mb-2">
            Accounts Payable
          </h1>
          <p className="text-lg text-muted-foreground">
            Track and manage outstanding bills
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/accountant/finance">Back to Finance</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-0 shadow-lg">
          <CardHeader className="pb-3">
            <CardDescription>Total Payable</CardDescription>
            <CardTitle className="text-2xl">KES {totalPayable.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-0 shadow-lg">
          <CardHeader className="pb-3">
            <CardDescription>Overdue</CardDescription>
            <CardTitle className="text-2xl text-red-600 dark:text-red-400">
              KES {totalOverdue.toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-0 shadow-lg">
          <CardHeader className="pb-3">
            <CardDescription>Unpaid Bills</CardDescription>
            <CardTitle className="text-2xl">{unpaidPayables.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-0 shadow-lg">
          <CardHeader className="pb-3">
            <CardDescription>Overdue Bills</CardDescription>
            <CardTitle className="text-2xl text-red-600 dark:text-red-400">
              {overduePayables.length}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <AccountsPayableClient payables={payables} />
    </div>
  )
}



