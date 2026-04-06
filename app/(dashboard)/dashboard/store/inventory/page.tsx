import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { getUniformProducts, getLowStockItems } from "@/lib/actions/uniform-inventory"
import { InventoryManager } from "@/components/store/inventory-manager"

export default async function InventoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }

  // Get products and low stock items
  const [products, lowStockItems] = await Promise.all([
    getUniformProducts(),
    getLowStockItems(),
  ])

  // Get branches if user has access
  const { data: branches } = await supabase
    .from("school_branches")
    .select("id, name")
    .eq("school_id", context.schoolId)
    .eq("is_active", true)
    .order("name", { ascending: true })

  return (
    <InventoryManager
      products={products}
      lowStockItems={lowStockItems}
      branches={branches || []}
      hasAllBranchesAccess={context.hasAllBranchesAccess}
      currentBranchId={context.branchId}
    />
  )
}


