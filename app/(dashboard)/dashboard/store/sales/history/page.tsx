import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { getSales } from "@/lib/actions/uniform-sales"
import { SalesHistoryClient } from "@/components/store/sales-history-client"

export default async function SalesHistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }

  // Get sales for current month
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0]

  const sales = await getSales({
    start_date: startOfMonth,
    end_date: endOfMonth,
    branch_id: context.hasAllBranchesAccess ? undefined : context.branchId,
    limit: 100,
  })

  // Calculate totals
  const totalSales = sales.reduce((sum: number, sale: any) => sum + Number(sale.total_amount || 0), 0)
  const totalTransactions = sales.length

  return (
    <SalesHistoryClient
      sales={sales}
      totalSales={totalSales}
      totalTransactions={totalTransactions}
    />
  )
}


