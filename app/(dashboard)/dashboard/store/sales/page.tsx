import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { getUniformProducts } from "@/lib/actions/uniform-inventory"
import { SalesForm } from "@/components/store/sales-form"

export default async function SalesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }

  // Get products with variants for sale form
  const products = await getUniformProducts()

  // Get students for dropdown
  const { data: students } = await supabase
    .from("students")
    .select("id, first_name, last_name, admission_number")
    .eq("school_id", context.schoolId)
    .eq("status", "active")
    .order("first_name", { ascending: true })
    .limit(200)

  // Get branches
  const { data: branches } = await supabase
    .from("school_branches")
    .select("id, name")
    .eq("school_id", context.schoolId)
    .eq("is_active", true)
    .order("name", { ascending: true })

  return (
    <SalesForm
      products={products}
      students={students || []}
      branches={branches || []}
      hasAllBranchesAccess={context.hasAllBranchesAccess}
      currentBranchId={context.branchId}
    />
  )
}


