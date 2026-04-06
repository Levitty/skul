import { createClient } from "@/lib/supabase/server"
import { getTenantContext } from "@/lib/supabase/tenant-context"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import { UserDetailClient } from "@/components/admin/user-detail-client"

interface PageProps {
  params: {
    id: string
  }
}

export default async function UserDetailPage({ params }: PageProps) {
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

  // Fetch the user_schools record
  const { data: userSchool, error: userSchoolError } = await serviceRoleClient
    .from("user_schools" as any)
    .select("id, user_id, school_id, role, branch_id, custom_role_id")
    .eq("id", params.id)
    .eq("school_id", context.schoolId)
    .single()

  if (userSchoolError || !userSchool) {
    redirect("/dashboard/admin/users")
  }

  const us = userSchool as any

  // Fetch user profile
  const { data: userProfile } = await serviceRoleClient
    .from("user_profiles" as any)
    .select("id, full_name, email, phone")
    .eq("id", us.user_id)
    .single()

  const profile = (userProfile as any) || {}

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
    <UserDetailClient
      userSchoolId={us.id}
      userId={us.user_id}
      fullName={profile.full_name || ""}
      email={profile.email || ""}
      phone={profile.phone || ""}
      role={us.role || ""}
      branchId={us.branch_id || ""}
      customRoleId={us.custom_role_id || ""}
      isActive={true}
      branches={(branches as any[]) || []}
      customRoles={(customRoles as any[]) || []}
      customRoleDetails={null}
    />
  )
}
