import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ExpenseForm } from "@/components/finance/expense-form"
import { ExpensesList } from "@/components/finance/expenses-list"
import { getExpenses } from "@/lib/actions/expenses"
import { getExpenseCategories } from "@/lib/actions/expense-categories"
import Link from "next/link"
import { TrendingDown, CheckCircle2, AlertCircle, Clock } from "lucide-react"

export default async function ExpensesPage() {
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

  // Load data with error handling
  let categories: any[] = []
  let expenses: any[] = []
  let categoriesError: string | null = null
  let expensesError: string | null = null

  try {
    categories = await getExpenseCategories()
  } catch (error: any) {
    console.error("Error loading expense categories:", error)
    categoriesError = error.message || "Failed to load expense categories"
  }

  try {
    expenses = await getExpenses({
      startDate: new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0],
    })
  } catch (error: any) {
    console.error("Error loading expenses:", error)
    expensesError = error.message || "Failed to load expenses"
  }

  const { data: school } = await supabase
    .from("schools")
    .select("name, address, phone, email")
    .eq("id", context.schoolId)
    .single()

  const totalExpenses = expenses.reduce((sum: number, exp: any) => sum + Number(exp.amount || 0), 0)
  const paidExpenses = expenses.filter((e: any) => e.payment_status === "paid")
  const unpaidExpenses = expenses.filter((e: any) => e.payment_status === "unpaid")
  const pendingApproval = expenses.filter((e: any) => e.approval_status === "pending")
  const totalPaid = paidExpenses.reduce((sum: number, exp: any) => sum + Number(exp.amount || 0), 0)
  const totalUnpaid = unpaidExpenses.reduce((sum: number, exp: any) => sum + Number(exp.amount || 0), 0)
  const pendingApprovalAmount = pendingApproval.reduce((sum: number, exp: any) => sum + Number(exp.amount || 0), 0)

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent mb-2">
            Expense Management
          </h1>
          <p className="text-lg text-muted-foreground">
            Track and manage school expenses
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/accountant/finance">Back to Finance</Link>
        </Button>
      </div>

      {(categoriesError || expensesError) && (
        <Card className="border-0 shadow-lg border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <p className="font-medium">Error loading data:</p>
              {categoriesError && <p className="text-sm">Categories: {categoriesError}</p>}
              {expensesError && <p className="text-sm">Expenses: {expensesError}</p>}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>Total Expenses</CardDescription>
              <TrendingDown className="w-4 h-4 text-gray-400" />
            </div>
            <CardTitle className="text-2xl">KES {totalExpenses.toLocaleString()}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{expenses.length} records</p>
          </CardHeader>
        </Card>
        <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>Paid</CardDescription>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <CardTitle className="text-2xl text-emerald-600 dark:text-emerald-400">KES {totalPaid.toLocaleString()}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{paidExpenses.length} paid</p>
          </CardHeader>
        </Card>
        <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>Unpaid</CardDescription>
              <AlertCircle className="w-4 h-4 text-red-500" />
            </div>
            <CardTitle className="text-2xl text-red-600 dark:text-red-400">KES {totalUnpaid.toLocaleString()}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{unpaidExpenses.length} unpaid</p>
          </CardHeader>
        </Card>
        <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>Pending Approval</CardDescription>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <CardTitle className="text-2xl text-amber-600 dark:text-amber-400">KES {pendingApprovalAmount.toLocaleString()}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{pendingApproval.length} pending</p>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-0 shadow-xl">
          <CardHeader>
            <CardTitle>Record Expense</CardTitle>
            <CardDescription>Add a new expense entry</CardDescription>
          </CardHeader>
          <CardContent>
            <ExpenseForm categories={categories} />
          </CardContent>
        </Card>

        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle>Expense Categories</CardTitle>
          </CardHeader>
          <CardContent>
            {categories.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground mb-2">No expense categories found</p>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/dashboard/accountant/finance/expenses/categories">
                    Create Category
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {categories.slice(0, 10).map((category: any) => (
                  <div key={category.id} className="p-2 rounded-lg border border-gray-200 dark:border-gray-800">
                    <p className="font-medium text-sm">{category.name}</p>
                    {category.description && (
                      <p className="text-xs text-muted-foreground">{category.description}</p>
                    )}
                  </div>
                ))}
                {categories.length > 10 && (
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    +{categories.length - 10} more categories
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ExpensesList expenses={expenses} categories={categories} school={school} />
    </div>
  )
}

