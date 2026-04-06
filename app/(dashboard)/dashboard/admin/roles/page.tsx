import { createClient } from "@/lib/supabase/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { getTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import RolesPageClient from "@/components/admin/roles-page-client"

export default async function RolesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const context = await getTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }

  if (context.role !== "school_admin" && context.role !== "super_admin") {
    redirect("/dashboard")
  }

  const serviceRoleClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Fetch custom roles
  const { data: customRoles } = await serviceRoleClient
    .from("custom_roles" as any)
    .select("*")
    .eq("school_id", context.schoolId)
    .order("created_at", { ascending: false })

  // Fetch permissions
  const { data: permissions } = await serviceRoleClient
    .from("permissions" as any)
    .select("*")
    .order("resource", { ascending: true })
    .order("action", { ascending: true })

  // Fetch role_permissions
  const customRoleIds = (customRoles as any[])?.map((r: any) => r.id) || []
  let rolePermissions: any[] = []
  if (customRoleIds.length > 0) {
    const { data } = await serviceRoleClient
      .from("role_permissions" as any)
      .select("*")
      .in("custom_role_id", customRoleIds)
    rolePermissions = (data as any[]) || []
  }

  // Count users per custom role
  const { data: userCounts } = await serviceRoleClient
    .from("user_schools" as any)
    .select("custom_role_id")
    .eq("school_id", context.schoolId)
    .not("custom_role_id", "is", null)

  const roleUserCounts = ((userCounts as any[]) || []).reduce((acc: any, uc: any) => {
    acc[uc.custom_role_id] = (acc[uc.custom_role_id] || 0) + 1
    return acc
  }, {})

  const rolePermissionsMap = rolePermissions.reduce((acc: any, rp: any) => {
    if (!acc[rp.custom_role_id]) acc[rp.custom_role_id] = []
    acc[rp.custom_role_id].push(rp.permission_id)
    return acc
  }, {})

  return (
    <RolesPageClient
      customRoles={(customRoles as any[]) || []}
      permissions={(permissions as any[]) || []}
      rolePermissionsMap={rolePermissionsMap}
      roleUserCounts={roleUserCounts}
      schoolId={context.schoolId}
    />
  )
}
