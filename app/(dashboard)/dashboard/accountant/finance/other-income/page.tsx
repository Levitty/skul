import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { OtherIncomeForm } from "@/components/finance/other-income-form"
import { OtherIncomeList } from "@/components/finance/other-income-list"
import { getOtherIncome } from "@/lib/actions/other-income"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { TrendingUp, DollarSign, Package, Gift } from "lucide-react"

export default async function OtherIncomePage() {
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

  // Get students for dropdown
  const { data: students } = await supabase
    .from("students")
    .select("id, first_name, last_name, admission_number")
    .eq("school_id", context.schoolId)
    .eq("status", "active")
    .order("first_name", { ascending: true })
    .limit(100)

  // Get recent other income
  const otherIncome = await getOtherIncome({
    startDate: new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0],
  })

  const totalOtherIncome = otherIncome.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0)

  // Calculate income by category
  const incomeByCategory = otherIncome.reduce((acc: any, item: any) => {
    if (!acc[item.income_type]) {
      acc[item.income_type] = 0
    }
    acc[item.income_type] += Number(item.amount || 0)
    return acc
  }, {})

  // Calculate monthly totals for current year
  const currentYear = new Date().getFullYear()
  const monthlyTotals = Array(12).fill(0)
  otherIncome.forEach((item: any) => {
    const itemDate = new Date(item.received_date)
    if (itemDate.getFullYear() === currentYear) {
      monthlyTotals[itemDate.getMonth()] += Number(item.amount || 0)
    }
  })

  // Get top categories
  const topCategories = Object.entries(incomeByCategory)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 5)

  const INCOME_TYPE_LABELS: Record<string, string> = {
    donation: "Donation",
    uniform_sale: "Uniform Sales",
    book_sales: "Book Sales",
    event_revenue: "Event Revenue",
    rental_income: "Rental Income",
    interest_income: "Interest Income",
    government_grant: "Government Grant",
    trip_payment: "Trip Payment",
    club_fee: "Club Fee",
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent mb-2">
            Other Income
          </h1>
          <p className="text-lg text-muted-foreground">
            Track supplementary revenue: donations, uniforms, books, events, rentals, and more
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/accountant/finance">Back to Finance</Link>
        </Button>
      </div>

      {/* Dashboard Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>Total Income</CardDescription>
              <TrendingUp className="w-4 h-4 text-emerald-500" />
            </div>
            <CardTitle className="text-2xl text-emerald-600 dark:text-emerald-400">
              KES {totalOtherIncome.toLocaleString()}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{otherIncome.length} records</p>
          </CardHeader>
        </Card>

        <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>This Month</CardDescription>
              <DollarSign className="w-4 h-4 text-blue-500" />
            </div>
            <CardTitle className="text-2xl">
              KES {monthlyTotals[new Date().getMonth()].toLocaleString()}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {otherIncome.filter(
                (i: any) =>
                  new Date(i.received_date).getMonth() === new Date().getMonth() &&
                  new Date(i.received_date).getFullYear() === currentYear
              ).length} this month
            </p>
          </CardHeader>
        </Card>

        <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>Top Category</CardDescription>
              <Package className="w-4 h-4 text-purple-500" />
            </div>
            <CardTitle className="text-lg">
              {topCategories.length > 0
                ? INCOME_TYPE_LABELS[(topCategories[0][0] as string)] || topCategories[0][0]
                : "N/A"}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {topCategories.length > 0 ? `KES ${(topCategories[0][1] as number).toLocaleString()}` : "No data"}
            </p>
          </CardHeader>
        </Card>

        <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>Categories</CardDescription>
              <Gift className="w-4 h-4 text-pink-500" />
            </div>
            <CardTitle className="text-2xl">{Object.keys(incomeByCategory).length}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">types tracked</p>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-0 shadow-xl">
          <CardHeader>
            <CardTitle>Record Other Income</CardTitle>
            <CardDescription>Add a new income entry from donations, uniforms, books, events, rentals, or other sources</CardDescription>
          </CardHeader>
          <CardContent>
            <OtherIncomeForm students={students || []} />
          </CardContent>
        </Card>

        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle>Income by Category</CardTitle>
            <CardDescription>This year</CardDescription>
          </CardHeader>
          <CardContent>
            {topCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No income data yet</p>
            ) : (
              <div className="space-y-3">
                {topCategories.map(([type, amount]: any) => (
                  <div key={type} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {INCOME_TYPE_LABELS[type] || type}
                      </span>
                      <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                        KES {(amount as number).toLocaleString()}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                      <div
                        className="bg-emerald-500 h-1.5 rounded-full"
                        style={{
                          width: `${((amount as number) / totalOtherIncome) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Income List */}
      <OtherIncomeList income={otherIncome} />
    </div>
  )
}



