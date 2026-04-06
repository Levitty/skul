import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { SuppliersClient } from "@/components/finance/suppliers-client"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default async function SuppliersPage() {
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

  const { data: suppliers, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("school_id", context.schoolId)
    .order("name", { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent mb-2">
            Suppliers
          </h1>
          <p className="text-lg text-muted-foreground">
            Manage suppliers and vendor contacts
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/accountant/finance">Back to Finance</Link>
        </Button>
      </div>

      <SuppliersClient suppliers={suppliers || []} />
    </div>
  )
}
