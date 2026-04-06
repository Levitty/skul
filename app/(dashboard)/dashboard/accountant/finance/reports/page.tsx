import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getGeneralLedger, getTrialBalance } from "@/lib/actions/general-ledger"
import Link from "next/link"
import { FinancialReportsClient } from "@/components/finance/financial-reports-client"

export default async function FinancialReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ startDate?: string; endDate?: string; report?: string }>
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
  const startDate = params.startDate || new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0]
  const endDate = params.endDate || new Date().toISOString().split("T")[0]
  const reportType = params.report || "pl"

  // Get all GL entries for the period
  const glEntries = await getGeneralLedger({
    startDate,
    endDate,
  })

  // Get trial balance
  const trialBalance = await getTrialBalance(startDate, endDate)

  // Get accounts for categorization
  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name, account_type")
    .eq("school_id", context.schoolId)
    .eq("is_active", true)
    .order("account_code", { ascending: true })

  // Get invoices and payments for cash flow
  const { data: invoices } = await supabase
    .from("invoices")
    .select("amount, issued_date, status")
    .eq("school_id", context.schoolId)
    .gte("issued_date", startDate)
    .lte("issued_date", endDate)

  const { data: payments } = await supabase
    .from("payments")
    .select("amount, paid_at, method")
    .eq("school_id", context.schoolId)
    .eq("status", "completed")
    .gte("paid_at", startDate)
    .lte("paid_at", endDate)

  const { data: expenses } = await supabase
    .from("expenses")
    .select("amount, expense_date, payment_status")
    .eq("school_id", context.schoolId)
    .gte("expense_date", startDate)
    .lte("expense_date", endDate)

  const { data: otherIncome } = await supabase
    .from("other_income")
    .select("amount, received_date, income_type")
    .eq("school_id", context.schoolId)
    .gte("received_date", startDate)
    .lte("received_date", endDate)

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent mb-2">
            Financial Reports
          </h1>
          <p className="text-lg text-muted-foreground">
            Comprehensive financial reporting and analysis
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/accountant/finance">Back to Finance</Link>
        </Button>
      </div>

      <FinancialReportsClient
        reportType={reportType}
        startDate={startDate}
        endDate={endDate}
        glEntries={glEntries}
        trialBalance={trialBalance}
        accounts={accounts || []}
        invoices={invoices || []}
        payments={payments || []}
        expenses={expenses || []}
        otherIncome={otherIncome || []}
      />
    </div>
  )
}



