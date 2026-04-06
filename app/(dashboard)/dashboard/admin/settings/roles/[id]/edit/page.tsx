import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { RoleForm } from "@/components/rbac/role-form"

export default async function EditRolePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
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

  // Fetch the role
  const { data: role, error } = await supabase
    .from("custom_roles")
    .select(`
      *,
      role_permissions(
        id,
        permission_id,
        permissions(id, resource, action, description)
      )
    `)
    .eq("id", id)
    .eq("school_id", context.schoolId)
    .single()

  if (error || !role) {
    notFound()
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

  const roleData = role as any
  // Get current permission IDs
  const rolePermissionsList = roleData.role_permissions || []
  const currentPermissionIds = rolePermissionsList.map(
    (rp: any) => rp.permission_id
  )

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
        <h1 className="text-3xl font-bold">Edit Role</h1>
        <p className="text-muted-foreground">
          Modify role settings and permissions
        </p>
      </div>

      <RoleForm
        role={role}
        permissions={permissions || []}
        groupedPermissions={groupedPermissions}
        currentPermissionIds={currentPermissionIds}
      />
    </div>
  )
}

