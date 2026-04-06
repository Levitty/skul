"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext, TenantContext } from "@/lib/supabase/tenant-context"
import { canManageBranches } from "@/lib/supabase/branch-context"
import { revalidatePath } from "next/cache"

export interface BranchData {
  name: string
  address?: string
  phone?: string
  email?: string
  manager_user_id?: string
  is_active?: boolean
}

export async function createBranch(data: BranchData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Unauthorized" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context found" }
  }

  const { data: branch, error } = await supabase
    .from("school_branches")
    // @ts-ignore - Supabase strict type checking
    .insert({
      school_id: context.schoolId,
      ...data,
      is_active: data.is_active !== undefined ? data.is_active : true,
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/my-school")
  return { data: branch }
}

export async function updateBranch(branchId: string, data: Partial<BranchData>) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Unauthorized" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context found" }
  }

  // Verify branch belongs to school
  const { data: branch, error: branchError } = await supabase
    .from("school_branches")
    .select("id, school_id")
    .eq("id", branchId)
    .eq("school_id", context.schoolId)
    .single()

  if (branchError || !branch) {
    return { error: "Branch not found" }
  }

  const { data: updated, error } = await supabase
    .from("school_branches")
    // @ts-ignore - Supabase strict type checking
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", branchId)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/my-school")
  return { data: updated }
}

export async function getBranches() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Unauthorized" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context found" }
  }

  // Get branches - manager_user_id references auth.users(id), not user_profiles directly
  // So we'll fetch branches first, then get user profiles separately
  const { data: branches, error } = await supabase
    .from("school_branches")
    .select("*")
    .eq("school_id", context.schoolId)
    .order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  // Get manager profiles for branches that have managers
  // manager_user_id references auth.users(id), and user_profiles.id also references auth.users(id)
  if (branches && branches.length > 0) {
    const managerIds = branches
      .map((b: any) => b.manager_user_id)
      .filter((id: any) => id) as string[]

    if (managerIds.length > 0) {
      const { data: managers } = await supabase
        .from("user_profiles")
        .select("id, full_name, email")
        .in("id", managerIds)

      // Attach manager profiles to branches
      const managersMap = new Map((managers || []).map((m: any) => [m.id, m]))
      branches.forEach((branch: any) => {
        if (branch.manager_user_id && managersMap.has(branch.manager_user_id)) {
          branch.manager_profile = managersMap.get(branch.manager_user_id)
        } else if (branch.manager_user_id) {
          // If manager exists but no profile, create a minimal profile object
          branch.manager_profile = {
            id: branch.manager_user_id,
            full_name: null,
            email: null
          }
        }
      })
    }
  }

  return { data: branches }
}

export async function getBranch(branchId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Unauthorized" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context found" }
  }

  const { data: branch, error } = await supabase
    .from("school_branches")
    .select(`
      *,
      manager:user_profiles(id, full_name, email)
    `)
    .eq("id", branchId)
    .eq("school_id", context.schoolId)
    .single()

  if (error) {
    return { error: error.message }
  }

  return { data: branch }
}

export async function deleteBranch(branchId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Unauthorized" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context found" }
  }

  const { error } = await supabase
    .from("school_branches")
    .delete()
    .eq("id", branchId)
    .eq("school_id", context.schoolId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/my-school")
  revalidatePath("/dashboard/admin/school-setup/branches")
  return { success: true }
}

/**
 * Assign a user to a branch
 * This updates the user's branch_id in user_schools table
 */
export async function assignUserToBranch(userId: string, branchId: string | null) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Unauthorized" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context found" }
  }

  // Only school admin can assign users to branches
  if (context.role !== 'school_admin' && context.role !== 'super_admin') {
    // Branch admins can only assign within their branch
    if (context.role !== 'branch_admin') {
      return { error: "Permission denied" }
    }
    if (branchId && branchId !== context.branchId) {
      return { error: "You can only assign users to your own branch" }
    }
  }

  // Verify branch belongs to school if branchId is provided
  if (branchId) {
    const { data: branch } = await supabase
      .from("school_branches")
      .select("id")
      .eq("id", branchId)
      .eq("school_id", context.schoolId)
      .single()

    if (!branch) {
      return { error: "Branch not found" }
    }
  }

  // Update user's branch assignment
  const { error } = await supabase
    .from("user_schools")
    // @ts-ignore - Supabase strict type checking
    .update({ branch_id: branchId })
    .eq("user_id", userId)
    .eq("school_id", context.schoolId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/users")
  revalidatePath("/dashboard/admin/school-setup/branches")
  return { success: true }
}

/**
 * Get users assigned to a specific branch
 */
export async function getBranchUsers(branchId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Unauthorized" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context found" }
  }

  // @ts-ignore - user_schools table query
  const { data: users, error } = await supabase
    .from("user_schools")
    .select("user_id, role, users:user_profiles!user_schools_user_id_fkey(id, full_name, email)")
    .eq("school_id", context.schoolId)
    .eq("branch_id", branchId)

  if (error) {
    return { error: error.message }
  }

  return { data: users }
}

/**
 * Get all school users with their branch assignments
 */
export async function getSchoolUsersWithBranches() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Unauthorized" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context found" }
  }

  // @ts-ignore - user_schools table query
  const { data: users, error } = await supabase
    .from("user_schools")
    .select(`
      user_id, 
      role, 
      branch_id,
      users:user_profiles!user_schools_user_id_fkey(id, full_name, email),
      branch:school_branches!user_schools_branch_id_fkey(id, name)
    `)
    .eq("school_id", context.schoolId)

  if (error) {
    return { error: error.message }
  }

  return { data: users }
}

