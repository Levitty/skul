import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { RoleForm } from "@/components/rbac/role-form"

export default async function NewRolePage() {
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

  // Fetch all permissions
  const { data: permissions } = await supabase
    .from("permissions")
    .select("*")
    .order("resource", { ascending: true })
    .order("action", { ascending: true })

  // Group permissions by resource
  const groupedPermissions = permissions?.reduce((acc: any, perm: any) => {
    if (!acc[perm.resource]) {
      acc[perm.resource] = []
    }
    acc[perm.resource].push(perm)
    return acc
  }, {}) || {}

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/admin/settings/roles"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Roles
        </Link>
      </div>

      <div>
        <h1 className="text-3xl font-bold">Create Role</h1>
        <p className="text-muted-foreground">
          Create a new custom role with specific permissions
        </p>
      </div>

      <RoleForm permissions={permissions || []} groupedPermissions={groupedPermissions} />
    </div>
  )
}



