import { createClient } from "@/lib/supabase/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { getTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { UsersPageClient } from "@/components/admin/users-page-client"

interface UserWithProfile {
  id: string
  user_id: string
  role: string
  branch_id: string | null
  created_at: string
  full_name: string | null
  email: string | null
  phone: string | null
  avatar_url: string | null
  branch_name?: string | null
}

interface Branch {
  id: string
  name: string
}

export default async function UsersPage() {
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

  // Fetch all users in this school
  const { data: userSchools } = await serviceRoleClient
    .from("user_schools" as any)
    .select("id, user_id, role, branch_id, created_at")
    .eq("school_id", context.schoolId)

  const userIds = ((userSchools as any[]) || []).map((u: any) => u.user_id)

  // Fetch profiles
  let profiles: any[] = []
  if (userIds.length > 0) {
    const { data } = await serviceRoleClient
      .from("user_profiles" as any)
      .select("id, full_name, email, phone, avatar_url")
      .in("id", userIds)
    profiles = (data as any[]) || []
  }

  // Fetch branches
  const { data: branches } = await serviceRoleClient
    .from("school_branches" as any)
    .select("id, name")
    .eq("school_id", context.schoolId)
    .order("name", { ascending: true })

  // Merge data
  const profileMap = new Map(profiles.map((p: any) => [p.id, p]))
  const branchMap = new Map(((branches as any[]) || []).map((b: any) => [b.id, b]))

  const usersWithDetails: UserWithProfile[] = ((userSchools as any[]) || []).map((us: any) => {
    const profile = profileMap.get(us.user_id) as any
    const branch = us.branch_id ? branchMap.get(us.branch_id) as any : null

    return {
      id: us.id,
      user_id: us.user_id,
      role: us.role,
      branch_id: us.branch_id,
      created_at: us.created_at,
      full_name: profile?.full_name || null,
      email: profile?.email || null,
      phone: profile?.phone || null,
      avatar_url: profile?.avatar_url || null,
      branch_name: branch?.name || null,
    }
  })

  return (
    <UsersPageClient
      users={usersWithDetails}
      branches={(branches as any[]) || []}
      schoolId={context.schoolId}
    />
  )
}
