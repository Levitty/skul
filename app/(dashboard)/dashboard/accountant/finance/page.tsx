import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { FinanceDashboardClient } from "@/components/finance/finance-dashboard-client"

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>
}) {
  const params = await searchParams
  const branchFilter = params.branch || null

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

  // Helper: add branch filter to a query if a branch is selected
  function withBranch(q: any, column = "branch_id") {
    if (branchFilter) return q.eq(column, branchFilter)
    return q
  }

  // Fetch all financial data in parallel
  const [
    { data: invoices },
    { data: payments },
    { data: otherIncome },
    { data: expenses },
    { data: budgets },
    { data: accountsPayable },
    { data: bankAccounts },
  ] = await Promise.all([
    // Fee invoices (PRIMARY)
    withBranch(
      supabase
        .from("invoices")
        .select("id, amount, status, created_at, issued_date")
        .eq("school_id", context.schoolId)
        .order("created_at", { ascending: false })
        .limit(50)
    ),

    // Fee payments (PRIMARY)
    withBranch(
      supabase
        .from("payments")
        .select("id, amount, method, paid_at, created_at, invoices(id, reference, students(first_name, last_name))")
        .eq("school_id", context.schoolId)
        .eq("status", "completed")
        .order("paid_at", { ascending: false })
        .limit(20)
    ),

    // Other income (SECONDARY)
    withBranch(
      supabase
        .from("other_income")
        .select("id, amount, income_type, received_date")
        .eq("school_id", context.schoolId)
        .order("received_date", { ascending: false })
        .limit(10)
    ),

    // Expenses
    withBranch(
      supabase
        .from("expenses")
        .select("id, amount, expense_date, payment_status")
        .eq("school_id", context.schoolId)
        .order("expense_date", { ascending: false })
        .limit(10)
    ),

    // Budgets
    withBranch(
      supabase
        .from("budgets")
        .select("id, budget_name, budget_type, budgeted_amount, period_start, period_end")
        .eq("school_id", context.schoolId)
        .order("period_start", { ascending: false })
        .limit(10)
    ),

    // Accounts Payable
    withBranch(
      supabase
        .from("accounts_payable")
        .select("id, vendor_name, amount, due_date, status")
        .eq("school_id", context.schoolId)
        .in("status", ["unpaid", "partial", "overdue"])
        .order("due_date", { ascending: true })
        .limit(10)
    ),

    // Bank Accounts
    withBranch(
      // @ts-ignore - bank_accounts table may not be in generated types
      supabase
        .from("bank_accounts")
        .select("id, account_name, current_balance")
        .eq("school_id", context.schoolId)
        .eq("is_active", true)
    ),
  ])

  // Calculate totals
  const invoicesList = invoices || []
  const paymentsList = payments || []
  const otherIncomeList = otherIncome || []
  const expensesList = expenses || []

  // Fee revenue (PRIMARY)
  const totalFeeRevenue = paymentsList.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0)
  const totalFeeInvoiced = invoicesList.reduce((sum: number, i: any) => sum + (Number(i.amount) || 0), 0)
  const outstandingFeeInvoices = invoicesList.filter((i: any) => ["unpaid", "partial", "overdue"].includes(i.status))
  const outstandingFeeAmount = outstandingFeeInvoices.reduce((sum: number, i: any) => sum + (Number(i.amount) || 0), 0)
  const feeCollectionRate = totalFeeInvoiced > 0 ? (totalFeeRevenue / totalFeeInvoiced) * 100 : 0

  // Other income (SECONDARY)
  const totalOtherIncome = otherIncomeList.reduce((sum: number, oi: any) => sum + (Number(oi.amount) || 0), 0)

  // Expenses
  const totalExpenses = expensesList.reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0)

  // Net profit
  const netProfit = totalFeeRevenue + totalOtherIncome - totalExpenses

  // Cash balance (from bank accounts)
  const bankAccountsList = bankAccounts || []
  const cashBalance = bankAccountsList.reduce((sum: number, ba: any) => sum + (Number(ba.current_balance) || 0), 0)

  // Accounts Payable
  const accountsPayableList = accountsPayable || []
  const totalAccountsPayable = accountsPayableList.reduce((sum: number, ap: any) => {
    const amount = Number(ap.amount) || 0
    const paidAmount = Number(ap.paid_amount) || 0
    return sum + (amount - paidAmount)
  }, 0)

  return (
    <FinanceDashboardClient
      totalFeeRevenue={totalFeeRevenue}
      totalFeeInvoiced={totalFeeInvoiced}
      outstandingFeeAmount={outstandingFeeAmount}
      feeCollectionRate={feeCollectionRate}
      totalOtherIncome={totalOtherIncome}
      totalExpenses={totalExpenses}
      netProfit={netProfit}
      cashBalance={cashBalance}
      totalAccountsPayable={totalAccountsPayable}
      recentPayments={paymentsList.slice(0, 10)}
      recentInvoices={invoicesList.slice(0, 10)}
      recentOtherIncome={otherIncomeList.slice(0, 5)}
      recentExpenses={expensesList.slice(0, 5)}
      overdueInvoices={invoicesList.filter((i: any) => i.status === "overdue")}
      overduePayables={accountsPayableList.filter((ap: any) => ap.status === "overdue")}
      budgets={budgets || []}
    />
  )
}

