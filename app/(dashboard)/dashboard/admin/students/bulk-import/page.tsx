import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { BulkImportClient } from "./bulk-import-client"

export default async function BulkImportPage() {
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

  if (!["school_admin", "branch_admin", "super_admin"].includes(context.role)) {
    redirect("/dashboard")
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <Link
          href="/dashboard/admin/students"
          className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Students
        </Link>
        <div className="space-y-1">
          <h1 className="text-4xl font-bold tracking-tight">Bulk Import Students</h1>
          <p className="text-lg text-muted-foreground">
            Upload a CSV file to import multiple students and their guardians at once
          </p>
        </div>
      </div>

      <BulkImportClient />
    </div>
  )
}
