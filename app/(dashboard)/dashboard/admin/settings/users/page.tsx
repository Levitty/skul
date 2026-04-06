import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Users, Shield } from "lucide-react"
import { UserRoleAssignment } from "@/components/rbac/user-role-assignment"

export default async function UsersPage() {
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

  // Fetch users in this school
  const { data: users } = await supabase
    .from("user_schools")
    .select(`
      id,
      user_id,
      role,
      custom_role_id,
      custom_roles(id, name)
    `)
    .eq("school_id", context.schoolId)

  // Fetch user profiles separately
  const usersList = users || []
  const userIds = usersList.map((u: any) => u.user_id)
  const { data: profiles, error: profilesError } = await supabase
    .from("user_profiles")
    .select("id, full_name, email, avatar_url")
    .in("id", userIds)

  const profilesList = profiles || []
  // Merge profiles with user_schools
  const usersWithProfiles = usersList.map((u: any) => ({
    ...u,
    profile: profilesList.find((p: any) => p.id === u.user_id),
  }))

  // Fetch custom roles for dropdown
  const { data: roles } = await supabase
    .from("custom_roles")
    .select("id, name")
    .eq("school_id", context.schoolId)
    .order("name", { ascending: true })

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

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground">
            Assign roles and manage user permissions
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            School Users ({usersWithProfiles.length})
          </CardTitle>
          <CardDescription>
            Assign custom roles to users in your school
          </CardDescription>
        </CardHeader>
        <CardContent>
          {usersWithProfiles.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-1">No users found</h3>
              <p className="text-sm text-muted-foreground">
                Users will appear here when they join your school
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {usersWithProfiles.map((u: any) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-medium">
                      {u.profile?.full_name?.[0]?.toUpperCase() || u.profile?.email?.[0]?.toUpperCase() || "?"}
                    </div>
                    <div>
                      <p className="font-medium">
                        {u.profile?.full_name || "Unnamed User"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {u.profile?.email || "No email"}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded capitalize">
                          {u.role}
                        </span>
                        {u.custom_roles && (
                          <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded flex items-center gap-1">
                            <Shield className="w-3 h-3" />
                            {u.custom_roles.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <UserRoleAssignment
                    userId={u.user_id}
                    currentRoleId={u.custom_role_id}
                    roles={roles || []}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

