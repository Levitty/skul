/**
 * Financial Runway Forecast calculations
 * Predicts how many months of cash runway the school has
 */

export interface FinancialForecast {
  currentBalance: number
  monthlyIncome: number
  monthlyExpenses: number
  runwayMonths: number
  forecastDate: Date
}

export interface CashFlowData {
  currentBalance: number
  monthlyIncome: number
  monthlyExpenses: number
}

/**
 * Calculate financial runway based on current balance and monthly cash flow
 */
export function calculateFinancialRunway(
  data: CashFlowData
): FinancialForecast {
  const { currentBalance, monthlyIncome, monthlyExpenses } = data

  // Net monthly cash flow
  const netMonthlyCashFlow = monthlyIncome - monthlyExpenses

  // If expenses exceed income, calculate runway based on current balance
  if (netMonthlyCashFlow <= 0) {
    const runwayMonths = currentBalance / Math.abs(monthlyExpenses)
    return {
      currentBalance,
      monthlyIncome,
      monthlyExpenses,
      runwayMonths: Math.max(0, runwayMonths),
      forecastDate: new Date(),
    }
  }

  // If income exceeds expenses, runway is effectively infinite
  // But we can calculate how long until balance reaches a threshold
  // For now, return a high number or calculate based on growth
  return {
    currentBalance,
    monthlyIncome,
    monthlyExpenses,
    runwayMonths: Infinity, // Positive cash flow
    forecastDate: new Date(),
  }
}

/**
 * Calculate monthly income from fee payments
 */
export async function calculateMonthlyIncome(
  supabase: any,
  schoolId: string,
  month: Date
): Promise<number> {
  const startOfMonth = new Date(month.getFullYear(), month.getMonth(), 1)
  const endOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0)

  const { data: payments, error } = await supabase
    .from("payments")
    .select("amount")
    .eq("status", "completed")
    .gte("paid_at", startOfMonth.toISOString())
    .lte("paid_at", endOfMonth.toISOString())
    .in(
      "invoice_id",
      supabase
        .from("invoices")
        .select("id")
        .eq("school_id", schoolId)
    )

  if (error) {
    throw new Error(`Failed to calculate monthly income: ${error.message}`)
  }

  return (
    payments?.reduce((sum: number, payment: any) => sum + Number(payment.amount), 0) || 0
  )
}

/**
 * Calculate monthly expenses (simplified - would need expense tracking)
 */
export async function calculateMonthlyExpenses(
  supabase: any,
  schoolId: string,
  month: Date
): Promise<number> {
  // This is a placeholder - would need an expenses table
  // For now, estimate based on payroll if available
  const startOfMonth = new Date(month.getFullYear(), month.getMonth(), 1)
  const endOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0)

  // Placeholder: would calculate from actual expenses table
  // For MVP, return 0 or a fixed estimate
  return 0
}

