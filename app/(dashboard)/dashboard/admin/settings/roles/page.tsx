import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, Shield, Edit, Trash2, Users } from "lucide-react"

export default async function RolesPage() {
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

  // Fetch roles with permissions
  const { data: roles } = await supabase
    .from("custom_roles")
    .select(`
      *,
      role_permissions(
        id,
        permissions(id, resource, action)
      )
    `)
    .eq("school_id", context.schoolId)
    .order("created_at", { ascending: false })

  // Count users per role
  const { data: userCounts } = await supabase
    .from("user_schools")
    .select("custom_role_id")
    .eq("school_id", context.schoolId)
    .not("custom_role_id", "is", null)

  const roleUserCounts = userCounts?.reduce((acc: any, uc: any) => {
    acc[uc.custom_role_id] = (acc[uc.custom_role_id] || 0) + 1
    return acc
  }, {}) || {}

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Roles & Permissions</h1>
          <p className="text-muted-foreground">
            Manage custom roles and their permissions
          </p>
        </div>
        <Link href="/dashboard/admin/settings/roles/new">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Create Role
          </Button>
        </Link>
      </div>

      {/* System Roles Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">System Roles</CardTitle>
          <CardDescription>
            These roles are built-in and cannot be modified
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-5 h-5 text-red-500" />
                <span className="font-medium">Super Admin</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Full access to all schools and features
              </p>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-5 h-5 text-blue-500" />
                <span className="font-medium">School Admin</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Full access to their school&apos;s data and settings
              </p>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-5 h-5 text-green-500" />
                <span className="font-medium">Other System Roles</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Teacher, Parent, Student, Accountant, etc.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Custom Roles */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Custom Roles</CardTitle>
          <CardDescription>
            Create custom roles with specific permissions for your school
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!roles || roles.length === 0 ? (
            <div className="text-center py-8">
              <Shield className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-1">No custom roles yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create custom roles to assign specific permissions to users
              </p>
              <Link href="/dashboard/admin/settings/roles/new">
                <Button>Create Your First Role</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {roles.map((role: any) => (
                <div
                  key={role.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Shield className="w-5 h-5 text-primary" />
                      <span className="font-medium">{role.name}</span>
                      {role.is_system_role && (
                        <span className="text-xs bg-muted px-2 py-0.5 rounded">
                          System
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {role.description || "No description"}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>
                        {role.role_permissions?.length || 0} permissions
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {roleUserCounts[role.id] || 0} users
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link href={`/dashboard/admin/settings/roles/${role.id}/edit`}>
                      <Button variant="ghost" size="sm">
                        <Edit className="w-4 h-4" />
                      </Button>
                    </Link>
                    {!role.is_system_role && (
                      <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Links */}
      <div className="flex gap-4">
        <Link href="/dashboard/admin/settings/users">
          <Button variant="outline" className="gap-2">
            <Users className="w-4 h-4" />
            Manage Users
          </Button>
        </Link>
      </div>
    </div>
  )
}

