import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { BudgetForm } from "@/components/finance/budget-form"
import { getBudgets, getBudgetVariance } from "@/lib/actions/budgets"
import Link from "next/link"
import { BudgetsClient } from "@/components/finance/budgets-client"

export default async function BudgetsPage() {
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

  // Get accounts and categories for budget creation
  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name, account_type")
    .eq("school_id", context.schoolId)
    .eq("is_active", true)
    .order("account_code", { ascending: true })

  const { data: categories } = await supabase
    .from("expense_categories")
    .select("id, name")
    .eq("school_id", context.schoolId)
    .eq("is_active", true)
    .order("name", { ascending: true })

  const { data: academicYears } = await supabase
    .from("academic_years")
    .select("id, name")
    .eq("school_id", context.schoolId)
    .order("created_at", { ascending: false })

  const budgets = await getBudgets()

  // Calculate budget summaries
  const revenueBudgets = budgets.filter((b: any) => b.budget_type === "revenue")
  const expenseBudgets = budgets.filter((b: any) => b.budget_type === "expense")
  
  const totalRevenueBudget = revenueBudgets.reduce((sum: number, b: any) => sum + Number(b.budgeted_amount || 0), 0)
  const totalExpenseBudget = expenseBudgets.reduce((sum: number, b: any) => sum + Number(b.budgeted_amount || 0), 0)

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent mb-2">
            Budget Management
          </h1>
          <p className="text-lg text-muted-foreground">
            Create and track budgets for revenue and expenses
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/accountant/finance">Back to Finance</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-0 shadow-lg">
          <CardHeader className="pb-3">
            <CardDescription>Total Revenue Budget</CardDescription>
            <CardTitle className="text-2xl text-emerald-600 dark:text-emerald-400">
              KES {totalRevenueBudget.toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-0 shadow-lg">
          <CardHeader className="pb-3">
            <CardDescription>Total Expense Budget</CardDescription>
            <CardTitle className="text-2xl text-red-600 dark:text-red-400">
              KES {totalExpenseBudget.toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-0 shadow-lg">
          <CardHeader className="pb-3">
            <CardDescription>Active Budgets</CardDescription>
            <CardTitle className="text-2xl">{budgets.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-0 shadow-xl">
          <CardHeader>
            <CardTitle>Create Budget</CardTitle>
            <CardDescription>Set budget targets for revenue or expenses</CardDescription>
          </CardHeader>
          <CardContent>
            <BudgetForm 
              accounts={accounts || []} 
              categories={categories || []}
              academicYears={academicYears || []}
            />
          </CardContent>
        </Card>

        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle>Quick Stats</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Revenue Budgets</p>
                <p className="text-xl font-semibold">{revenueBudgets.length}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Expense Budgets</p>
                <p className="text-xl font-semibold">{expenseBudgets.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <BudgetsClient budgets={budgets} />
    </div>
  )
}



