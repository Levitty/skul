import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getChartOfAccounts, seedDefaultAccounts } from "@/lib/actions/chart-of-accounts"
import Link from "next/link"
import { ChartOfAccountsClient } from "@/components/finance/chart-of-accounts-client"

export default async function ChartOfAccountsPage() {
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

  const accounts = await getChartOfAccounts()

  // Check if accounts exist
  const hasAccounts = accounts.length > 0

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent mb-2">
            Chart of Accounts
          </h1>
          <p className="text-lg text-muted-foreground">
            Manage your accounting structure
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" asChild>
            <Link href="/dashboard/accountant/finance">Back to Finance</Link>
          </Button>
        </div>
      </div>

      {!hasAccounts ? (
        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle>Setup Required</CardTitle>
            <CardDescription>You need to set up your chart of accounts first</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={async () => {
              "use server"
              await seedDefaultAccounts()
            }}>
              <Button type="submit" className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700">
                Seed Default Chart of Accounts
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <ChartOfAccountsClient accounts={accounts} />
      )}
    </div>
  )
}



