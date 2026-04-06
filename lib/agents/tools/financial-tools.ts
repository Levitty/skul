/**
 * Financial Tools for the Strategic Advisor
 * Every tool runs a real database query — no AI math, no guessing.
 */

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"

// ============================================================================
// Tool: get_financial_runway
// ============================================================================
export async function getFinancialRunway(userId: string) {
  const supabase = await createClient()
  const context = await requireTenantContext(userId)
  if (!context) return { error: "No school context" }

  // Get total bank balance
  const { data: bankAccounts } = await supabase
    .from("bank_accounts")
    .select("current_balance, account_name")
    .eq("school_id", context.schoolId)
    .eq("is_active", true)

  const accounts = (bankAccounts || []).map((a: any) => ({
    name: a.account_name,
    balance: Number(a.current_balance || 0),
  }))
  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0)

  // Get expenses from last 6 months
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const { data: expenses } = await supabase
    .from("expenses")
    .select("amount, expense_date")
    .eq("school_id", context.schoolId)
    .gte("expense_date", sixMonthsAgo.toISOString().split("T")[0])

  const totalExpenses = (expenses || []).reduce(
    (sum: number, e: any) => sum + Number(e.amount || 0),
    0
  )
  const avgMonthlyExpenses = totalExpenses / 6

  // Get income from last 6 months (fee payments)
  const { data: recentPayments } = await supabase
    .from("payments")
    .select("amount")
    .eq("school_id", context.schoolId)
    .eq("status", "completed")
    .gte("created_at", sixMonthsAgo.toISOString())

  const totalIncome = (recentPayments || []).reduce(
    (sum: number, p: any) => sum + Number(p.amount || 0),
    0
  )
  const avgMonthlyIncome = totalIncome / 6

  const netMonthlyCashFlow = avgMonthlyIncome - avgMonthlyExpenses
  const runwayMonths =
    avgMonthlyExpenses > 0
      ? Math.round((totalBalance / avgMonthlyExpenses) * 10) / 10
      : null

  let status: "healthy" | "warning" | "critical" = "healthy"
  if (runwayMonths !== null) {
    if (runwayMonths < 2) status = "critical"
    else if (runwayMonths < 4) status = "warning"
  }

  return {
    bank_balance_kes: totalBalance,
    bank_accounts: accounts,
    avg_monthly_expenses_kes: Math.round(avgMonthlyExpenses),
    avg_monthly_income_kes: Math.round(avgMonthlyIncome),
    net_monthly_cash_flow_kes: Math.round(netMonthlyCashFlow),
    runway_months: runwayMonths,
    status,
    data_period: "last 6 months",
  }
}

// ============================================================================
// Tool: get_collection_rate
// ============================================================================
export async function getCollectionRate(
  userId: string,
  params: { term_id?: string; class_id?: string }
) {
  const supabase = await createClient()
  const context = await requireTenantContext(userId)
  if (!context) return { error: "No school context" }

  // Get current term if not specified
  let termId = params.term_id
  if (!termId) {
    const { data: currentTerm } = await supabase
      .from("terms")
      .select("id, name")
      .eq("school_id", context.schoolId)
      .eq("is_current", true)
      .single()
    termId = (currentTerm as any)?.id
    if (!termId) return { error: "No current term found" }
  }

  // Build invoice query
  let invoiceQuery = supabase
    .from("invoices")
    .select("id, amount, status, student_id")
    .eq("school_id", context.schoolId)
    .eq("term_id", termId)

  const { data: invoices } = await invoiceQuery

  if (!invoices || invoices.length === 0) {
    return { error: "No invoices found for this term" }
  }

  // Filter by class if specified
  let filteredInvoices = invoices
  if (params.class_id) {
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("student_id")
      .eq("class_id", params.class_id)

    const studentIds = new Set(
      (enrollments || []).map((e: any) => e.student_id)
    )
    filteredInvoices = invoices.filter((inv: any) =>
      studentIds.has(inv.student_id)
    )
  }

  const totalInvoiced = filteredInvoices.reduce(
    (sum: number, inv: any) => sum + Number(inv.amount || 0),
    0
  )

  // Get payments for these invoices
  const invoiceIds = filteredInvoices.map((inv: any) => inv.id)
  let totalCollected = 0
  if (invoiceIds.length > 0) {
    const { data: payments } = await supabase
      .from("payments")
      .select("amount")
      .eq("status", "completed")
      .in("invoice_id", invoiceIds)

    totalCollected = (payments || []).reduce(
      (sum: number, p: any) => sum + Number(p.amount || 0),
      0
    )
  }

  const collectionRate =
    totalInvoiced > 0 ? Math.round((totalCollected / totalInvoiced) * 1000) / 10 : 0
  const outstanding = totalInvoiced - totalCollected

  // Status breakdown
  const statusBreakdown = {
    paid: filteredInvoices.filter((i: any) => i.status === "paid").length,
    partial: filteredInvoices.filter((i: any) => i.status === "partial").length,
    unpaid: filteredInvoices.filter((i: any) => i.status === "unpaid").length,
    overdue: filteredInvoices.filter((i: any) => i.status === "overdue").length,
  }

  return {
    total_invoiced_kes: totalInvoiced,
    total_collected_kes: totalCollected,
    outstanding_kes: outstanding,
    collection_rate_percent: collectionRate,
    total_invoices: filteredInvoices.length,
    status_breakdown: statusBreakdown,
  }
}

// ============================================================================
// Tool: get_fee_arrears
// ============================================================================
export async function getFeeArrears(
  userId: string,
  params: { term_id?: string; class_id?: string; limit?: number }
) {
  const supabase = await createClient()
  const context = await requireTenantContext(userId)
  if (!context) return { error: "No school context" }

  let query = supabase
    .from("invoices")
    .select(
      `id, amount, status, due_date,
       students(id, first_name, last_name, admission_number,
         enrollments(class_id, classes(name)))`
    )
    .eq("school_id", context.schoolId)
    .in("status", ["unpaid", "partial", "overdue"])
    .order("amount", { ascending: false })

  if (params.term_id) {
    query = query.eq("term_id", params.term_id)
  }

  const { data: invoices } = await query

  if (!invoices || invoices.length === 0) {
    return { total_arrears_kes: 0, defaulters: [], count: 0 }
  }

  // Calculate outstanding per invoice
  const defaulters = await Promise.all(
    (invoices as any[]).map(async (inv) => {
      const { data: payments } = await supabase
        .from("payments")
        .select("amount")
        .eq("invoice_id", inv.id)
        .eq("status", "completed")

      const paid = (payments || []).reduce(
        (sum: number, p: any) => sum + Number(p.amount || 0),
        0
      )
      const outstanding = Number(inv.amount) - paid

      const className =
        inv.students?.enrollments?.[0]?.classes?.name || "Unknown"

      return {
        student_name: `${inv.students?.first_name || ""} ${inv.students?.last_name || ""}`.trim(),
        admission_number: inv.students?.admission_number || "",
        class: className,
        invoiced_kes: Number(inv.amount),
        paid_kes: paid,
        outstanding_kes: outstanding,
        status: inv.status,
        due_date: inv.due_date,
      }
    })
  )

  const activeDefaulters = defaulters
    .filter((d) => d.outstanding_kes > 0)
    .sort((a, b) => b.outstanding_kes - a.outstanding_kes)
    .slice(0, params.limit || 20)

  const totalArrears = activeDefaulters.reduce(
    (sum, d) => sum + d.outstanding_kes,
    0
  )

  return {
    total_arrears_kes: totalArrears,
    count: activeDefaulters.length,
    defaulters: activeDefaulters,
  }
}

// ============================================================================
// Tool: get_expense_summary
// ============================================================================
export async function getExpenseSummary(
  userId: string,
  params: { months?: number }
) {
  const supabase = await createClient()
  const context = await requireTenantContext(userId)
  if (!context) return { error: "No school context" }

  const months = params.months || 3
  const startDate = new Date()
  startDate.setMonth(startDate.getMonth() - months)

  const { data: expenses } = await supabase
    .from("expenses")
    .select("amount, expense_date, description, expense_categories(name)")
    .eq("school_id", context.schoolId)
    .gte("expense_date", startDate.toISOString().split("T")[0])
    .order("expense_date", { ascending: false })

  if (!expenses || expenses.length === 0) {
    return { total_kes: 0, by_category: [], expenses: [], period_months: months }
  }

  // Group by category
  const categoryTotals: Record<string, number> = {}
  for (const exp of expenses as any[]) {
    const category = exp.expense_categories?.name || "Uncategorized"
    categoryTotals[category] = (categoryTotals[category] || 0) + Number(exp.amount || 0)
  }

  const byCategory = Object.entries(categoryTotals)
    .map(([name, total]) => ({ category: name, total_kes: total }))
    .sort((a, b) => b.total_kes - a.total_kes)

  const total = (expenses as any[]).reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0
  )

  return {
    total_kes: total,
    avg_monthly_kes: Math.round(total / months),
    by_category: byCategory,
    expense_count: expenses.length,
    period_months: months,
  }
}

// ============================================================================
// Tool: get_fee_structure
// ============================================================================
export async function getFeeStructure(
  userId: string,
  params: { term_id?: string; class_id?: string }
) {
  const supabase = await createClient()
  const context = await requireTenantContext(userId)
  if (!context) return { error: "No school context" }

  let query = supabase
    .from("fee_structures")
    .select("id, name, fee_type, amount, is_required, class_id, term_id, classes(name)")
    .eq("school_id", context.schoolId)
    .eq("is_active", true)

  if (params.term_id) {
    query = query.or(`term_id.eq.${params.term_id},term_id.is.null`)
  }
  if (params.class_id) {
    query = query.or(`class_id.eq.${params.class_id},class_id.is.null`)
  }

  const { data: structures } = await query

  if (!structures || structures.length === 0) {
    return { fee_structures: [], total_required_kes: 0 }
  }

  const formatted = (structures as any[]).map((fs) => ({
    name: fs.name,
    fee_type: fs.fee_type,
    amount_kes: Number(fs.amount),
    is_required: fs.is_required,
    class: fs.classes?.name || "All classes",
  }))

  const totalRequired = formatted
    .filter((f) => f.is_required)
    .reduce((sum, f) => sum + f.amount_kes, 0)

  return {
    fee_structures: formatted,
    total_required_kes: totalRequired,
    total_all_kes: formatted.reduce((sum, f) => sum + f.amount_kes, 0),
  }
}
