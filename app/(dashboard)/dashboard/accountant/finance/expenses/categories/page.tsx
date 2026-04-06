import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getExpenseCategories } from "@/lib/actions/expense-categories"
import Link from "next/link"
import { ExpenseCategoriesClient } from "@/components/finance/expense-categories-client"

export default async function ExpenseCategoriesPage() {
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

  const categories = await getExpenseCategories()

  // Get accounts for linking
  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name")
    .eq("school_id", context.schoolId)
    .eq("account_type", "expense")
    .eq("is_active", true)
    .order("account_code", { ascending: true })

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent mb-2">
            Expense Categories
          </h1>
          <p className="text-lg text-muted-foreground">
            Manage expense categories and link to chart of accounts
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/accountant/finance/expenses">Back to Expenses</Link>
        </Button>
      </div>

      <ExpenseCategoriesClient categories={categories} accounts={accounts || []} />
    </div>
  )
}



