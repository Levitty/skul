import { createClient } from "@/lib/supabase/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { getTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { InviteUserClient } from "@/components/admin/invite-user-client"

export default async function InviteUserPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const context = await getTenantContext(user.id)
  if (!context || (context.role !== "school_admin" && context.role !== "super_admin")) {
    redirect("/dashboard")
  }

  const serviceRoleClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Fetch branches
  const { data: branches } = await serviceRoleClient
    .from("school_branches" as any)
    .select("id, name")
    .eq("school_id", context.schoolId)
    .order("name", { ascending: true })

  // Fetch custom roles
  const { data: customRoles } = await serviceRoleClient
    .from("custom_roles" as any)
    .select("id, name")
    .eq("school_id", context.schoolId)
    .order("name", { ascending: true })

  return (
    <InviteUserClient
      branches={(branches as any[]) || []}
      customRoles={(customRoles as any[]) || []}
      userRole={context.role}
    />
  )
}
