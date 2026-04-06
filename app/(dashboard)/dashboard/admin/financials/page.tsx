import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default async function FinancialsPage() {
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

  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString()

  const [
    { data: payments },
    { data: invoices },
    { data: expenses },
    { count: activeStudentCount },
    { data: revenueByType },
    { data: expensesByCategory },
  ] = await Promise.all([
    supabase
      .from("payments")
      .select("*")
      .eq("school_id", context.schoolId)
      .eq("status", "completed")
      .gte("created_at", yearStart),
    supabase
      .from("invoices")
      .select("*")
      .eq("school_id", context.schoolId)
      .gte("created_at", yearStart),
    supabase
      .from("expenses")
      .select("*, expense_categories(name)")
      .eq("school_id", context.schoolId)
      .gte("expense_date", yearStart),
    supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("school_id", context.schoolId)
      .eq("status", "active"),
    supabase
      .from("invoice_items")
      .select("amount, fee_structures(fee_type)")
      .in(
        "invoice_id",
        (await supabase
          .from("invoices")
          .select("id")
          .eq("school_id", context.schoolId)
          .gte("created_at", yearStart)
        ).data?.map((i: any) => i.id) || []
      ),
    supabase
      .from("expenses")
      .select("amount, expense_categories(name)")
      .eq("school_id", context.schoolId)
      .gte("expense_date", yearStart),
  ])

  const paymentsList: any[] = payments || []
  const invoicesList: any[] = invoices || []
  const expensesList: any[] = expenses || []
  const studentCount = activeStudentCount || 0

  const totalRevenue = paymentsList.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0)
  const totalInvoiced = invoicesList.reduce((sum: number, i: any) => sum + (Number(i.amount) || 0), 0)
  const totalExpenses = expensesList.reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0)
  const netProfit = totalRevenue - totalExpenses
  const outstandingAR = totalInvoiced - totalRevenue

  // Revenue breakdown by fee type
  const revenueBreakdown: Record<string, number> = {}
  for (const item of (revenueByType || [])) {
    const feeType = (item as any).fee_structures?.fee_type || "other"
    const label = feeType.charAt(0).toUpperCase() + feeType.slice(1) + " Fees"
    revenueBreakdown[label] = (revenueBreakdown[label] || 0) + Number((item as any).amount || 0)
  }
  const revenueItems = Object.entries(revenueBreakdown)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)

  // Expense breakdown by category
  const expenseBreakdown: Record<string, number> = {}
  for (const item of (expensesByCategory || [])) {
    const catName = (item as any).expense_categories?.name || "Uncategorized"
    expenseBreakdown[catName] = (expenseBreakdown[catName] || 0) + Number((item as any).amount || 0)
  }
  const expenseItems = Object.entries(expenseBreakdown)
    .map(([name, amount]) => ({ name, amount, percent: totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount)

  // Monthly cash flow from real data
  const currentYear = new Date().getFullYear()
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  const currentMonth = new Date().getMonth()

  const monthlyInflow: number[] = Array(12).fill(0)
  const monthlyOutflow: number[] = Array(12).fill(0)

  for (const p of paymentsList) {
    const d = new Date(p.paid_at || p.created_at)
    if (d.getFullYear() === currentYear) {
      monthlyInflow[d.getMonth()] += Number(p.amount) || 0
    }
  }
  for (const e of expensesList) {
    const d = new Date(e.expense_date)
    if (d.getFullYear() === currentYear) {
      monthlyOutflow[d.getMonth()] += Number(e.amount) || 0
    }
  }

  const cashFlowMonths = monthNames
    .slice(0, currentMonth + 1)
    .map((name, i) => ({
      name: `${name} ${currentYear}`,
      inflow: monthlyInflow[i],
      outflow: monthlyOutflow[i],
      net: monthlyInflow[i] - monthlyOutflow[i],
    }))
    .filter((m) => m.inflow > 0 || m.outflow > 0)

  // Computed financial ratios
  const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : "N/A"
  const operatingRatio = totalRevenue > 0 ? ((totalExpenses / totalRevenue) * 100).toFixed(1) : "N/A"
  const revenuePerStudent = studentCount > 0 ? `KES ${Math.round(totalRevenue / studentCount).toLocaleString()}` : "N/A"
  const collectionRate = totalInvoiced > 0 ? ((totalRevenue / totalInvoiced) * 100).toFixed(1) : "N/A"

  const safeDiv = (a: number, b: number) => (b !== 0 ? a / b : 0)
  const profitMarginStatus = safeDiv(netProfit, totalRevenue) >= 0.15 ? "excellent" : safeDiv(netProfit, totalRevenue) >= 0.05 ? "good" : "warning"
  const collectionRateNum = safeDiv(totalRevenue, totalInvoiced) * 100
  const collectionStatus = collectionRateNum >= 90 ? "excellent" : collectionRateNum >= 75 ? "good" : "warning"

  const formatAmount = (n: number) => {
    if (Math.abs(n) >= 1_000_000) return `KES ${(n / 1_000_000).toFixed(2)}M`
    if (Math.abs(n) >= 1_000) return `KES ${(n / 1_000).toFixed(1)}K`
    return `KES ${n.toLocaleString()}`
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-neutral-900 mb-2">
            Financial Management
          </h1>
          <p className="text-lg text-neutral-500">
            Comprehensive financial overview and reporting
          </p>
        </div>
      </div>

      {/* Key Financial Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border border-neutral-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>Total Revenue</CardDescription>
              <div className="p-2 rounded-lg bg-neutral-100 text-neutral-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
            </div>
            <CardTitle className="text-3xl">{formatAmount(totalRevenue)}</CardTitle>
            <p className="text-xs text-neutral-500 font-medium">
              {paymentsList.length} completed payments
            </p>
          </CardHeader>
        </Card>

        <Card className="border border-neutral-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>Total Expenses</CardDescription>
              <div className="p-2 rounded-lg bg-neutral-100 text-neutral-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 13v-3a2 2 0 00-2-2H9a2 2 0 00-2 2v7a2 2 0 002 2h6a2 2 0 002-2v-3a2 2 0 002-2m0-4h-2M5 13h2m-2 4h2M5 17h2" />
                </svg>
              </div>
            </div>
            <CardTitle className="text-3xl">{formatAmount(totalExpenses)}</CardTitle>
            <p className="text-xs text-neutral-500 font-medium">
              {expensesList.length} expense records
            </p>
          </CardHeader>
        </Card>

        <Card className="border border-neutral-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>Net Profit</CardDescription>
              <div className="p-2 rounded-lg bg-neutral-100 text-neutral-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <CardTitle className="text-3xl">{formatAmount(netProfit)}</CardTitle>
            <p className="text-xs text-neutral-500 font-medium">
              {profitMargin !== "N/A" ? `${profitMargin}% margin` : "No revenue yet"}
            </p>
          </CardHeader>
        </Card>

        <Card className="border border-neutral-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>Outstanding AR</CardDescription>
              <div className="p-2 rounded-lg bg-neutral-100 text-neutral-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <CardTitle className="text-3xl">{formatAmount(Math.max(outstandingAR, 0))}</CardTitle>
            <p className="text-xs text-neutral-500 font-medium">Pending collection</p>
          </CardHeader>
        </Card>
      </div>

      {/* Profit & Loss Statement */}
      <Card className="border border-neutral-200 shadow-sm">
        <CardHeader>
          <div>
            <CardTitle className="text-2xl">Profit & Loss Statement</CardTitle>
            <CardDescription className="mt-1">Year-to-date financial performance</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Revenue Section */}
            <div>
              <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-lg mb-3">
                <h3 className="text-lg font-semibold">Revenue</h3>
                <span className="text-2xl font-bold text-neutral-900">
                  {formatAmount(totalRevenue)}
                </span>
              </div>
              <div className="space-y-2 ml-4">
                {revenueItems.length > 0 ? revenueItems.map((item) => (
                  <div key={item.name} className="flex items-center justify-between py-2 border-b border-neutral-100">
                    <span className="text-neutral-500">{item.name}</span>
                    <span className="font-medium">{formatAmount(item.amount)}</span>
                  </div>
                )) : (
                  <p className="text-sm text-neutral-500 py-2">No itemized revenue data available</p>
                )}
              </div>
            </div>

            {/* Expenses Section */}
            <div>
              <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-lg mb-3">
                <h3 className="text-lg font-semibold">Expenses</h3>
                <span className="text-2xl font-bold text-neutral-900">
                  {formatAmount(totalExpenses)}
                </span>
              </div>
              <div className="space-y-2 ml-4">
                {expenseItems.length > 0 ? expenseItems.map((item) => (
                  <div key={item.name} className="py-2 border-b border-neutral-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-neutral-500">{item.name}</span>
                      <span className="font-medium">{formatAmount(item.amount)}</span>
                    </div>
                    <div className="w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-neutral-400 rounded-full"
                        style={{ width: `${item.percent}%` }}
                      />
                    </div>
                  </div>
                )) : (
                  <p className="text-sm text-neutral-500 py-2">No expense records found</p>
                )}
              </div>
            </div>

            {/* Net Income */}
            <div className="flex items-center justify-between p-6 bg-neutral-50 rounded-lg border border-neutral-200">
              <h3 className="text-xl font-bold">Net Income</h3>
              <span className={`text-3xl font-bold ${netProfit >= 0 ? "text-neutral-900" : "text-neutral-600"}`}>
                {formatAmount(netProfit)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cash Flow */}
      <Card className="border border-neutral-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Cash Flow Analysis</CardTitle>
          <CardDescription>Monthly cash inflow and outflow ({currentYear})</CardDescription>
        </CardHeader>
        <CardContent>
          {cashFlowMonths.length > 0 ? (
            <div className="space-y-4">
              {cashFlowMonths.map((month) => {
                const total = month.inflow + month.outflow
                return (
                  <div key={month.name} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{month.name}</span>
                      <span className={`font-semibold ${month.net >= 0 ? "text-neutral-900" : "text-neutral-600"}`}>
                        {formatAmount(month.net)}
                      </span>
                    </div>
                    <div className="flex gap-2 h-8">
                      {month.inflow > 0 && (
                        <div
                          className="bg-neutral-700 rounded flex items-center justify-center text-white text-xs font-medium"
                          style={{ width: `${total > 0 ? (month.inflow / total) * 100 : 50}%` }}
                        >
                          In: {formatAmount(month.inflow)}
                        </div>
                      )}
                      {month.outflow > 0 && (
                        <div
                          className="bg-neutral-400 rounded flex items-center justify-center text-white text-xs font-medium"
                          style={{ width: `${total > 0 ? (month.outflow / total) * 100 : 50}%` }}
                        >
                          Out: {formatAmount(month.outflow)}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-neutral-500 text-center py-8">No cash flow data for {currentYear} yet</p>
          )}
        </CardContent>
      </Card>

      {/* Financial Ratios */}
      <Card className="border border-neutral-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Financial Ratios & KPIs</CardTitle>
          <CardDescription>Key financial health indicators</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: "Profit Margin",
                value: profitMargin !== "N/A" ? `${profitMargin}%` : "N/A",
                target: ">15%",
                status: profitMarginStatus,
              },
              {
                label: "Operating Ratio",
                value: operatingRatio !== "N/A" ? `${operatingRatio}%` : "N/A",
                target: "<80%",
                status: operatingRatio !== "N/A" && parseFloat(operatingRatio) < 80 ? "good" : operatingRatio === "N/A" ? "warning" : "warning",
              },
              {
                label: "Revenue Per Student",
                value: revenuePerStudent,
                target: "Varies",
                status: studentCount > 0 ? "good" : "warning",
              },
              {
                label: "Collection Rate",
                value: collectionRate !== "N/A" ? `${collectionRate}%` : "N/A",
                target: ">90%",
                status: collectionStatus,
              },
              {
                label: "Total Invoiced",
                value: formatAmount(totalInvoiced),
                target: "—",
                status: "good",
              },
              {
                label: "Active Students",
                value: studentCount.toString(),
                target: "—",
                status: studentCount > 0 ? "excellent" : "warning",
              },
              {
                label: "Expense Records",
                value: expensesList.length.toString(),
                target: "—",
                status: "good",
              },
              {
                label: "Payments Processed",
                value: paymentsList.length.toString(),
                target: "—",
                status: paymentsList.length > 0 ? "excellent" : "warning",
              },
            ].map((ratio) => (
              <div
                key={ratio.label}
                className="p-4 rounded-lg border border-neutral-200 hover:shadow-sm transition-all duration-200"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm text-neutral-500">{ratio.label}</div>
                  <div className={`w-2 h-2 rounded-full ${
                    ratio.status === "excellent" ? "bg-neutral-900" :
                    ratio.status === "good" ? "bg-neutral-700" :
                    "bg-neutral-500"
                  }`} />
                </div>
                <div className="text-2xl font-bold mb-1">{ratio.value}</div>
                <div className="text-xs text-neutral-500">Target: {ratio.target}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
