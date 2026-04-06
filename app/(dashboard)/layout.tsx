import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DashboardNav } from "@/components/dashboard/nav"
import { IntelligenceBot } from "@/components/dashboard/intelligence-bot"
import { BranchProvider } from "@/components/dashboard/branch-context"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Fetch user role and branch from user_schools
  const { data: userSchool } = await supabase
    .from("user_schools" as any)
    .select("role, branch_id, school_id")
    .eq("user_id", user.id)
    .single()

  const us = userSchool as any
  const userRole = us?.role || "teacher"
  const userBranchId = us?.branch_id || null
  const schoolId = us?.school_id || null

  // Determine if user has all-branches access
  const hasAllBranchesAccess =
    userRole === "super_admin" ||
    userRole === "school_admin" ||
    !userBranchId

  // Fetch branches for this school
  let branches: { id: string; name: string; address: string | null }[] = []
  if (schoolId) {
    const { data: branchData } = await supabase
      .from("school_branches" as any)
      .select("id, name, address")
      .eq("school_id", schoolId)
      .eq("is_active", true)
      .order("name", { ascending: true })

    branches = (branchData as any[]) || []
  }

  return (
    <BranchProvider
      branches={branches}
      userBranchId={userBranchId}
      hasAllBranchesAccess={hasAllBranchesAccess}
    >
      <div
        className="flex min-h-screen"
        style={{
          background: "linear-gradient(135deg, #f8faf9 0%, #f0f7f4 100%)",
        }}
      >
        <DashboardNav userRole={userRole} />
        <main className="flex-1 overflow-auto">
          <div className="max-w-[1280px] mx-auto px-6 py-6">{children}</div>
        </main>
        <IntelligenceBot />
      </div>
    </BranchProvider>
  )
}
