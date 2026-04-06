import { createClient } from "./server"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"

export interface TenantContext {
  schoolId: string
  role: string
  branchId: string | null
  hasAllBranchesAccess: boolean
}

export async function getTenantContext(userId: string): Promise<TenantContext | null> {
  // Use service role client to bypass RLS for this critical query
  const supabase = createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
  
  // Get user's school_id, role, and branch_id from user_schools table
  const { data, error } = await supabase
    // @ts-ignore - Table name may not be in generated types
    .from("user_schools")
    .select("school_id, role, branch_id")
    .eq("user_id", userId)
    .single()

  if (error) {
    console.error("[getTenantContext] Error fetching user school:", error)
    return null
  }

  if (!data) {
    console.error("[getTenantContext] No school found for user:", userId)
    return null
  }

  const role = (data as any).role as string
  const branchId = (data as any).branch_id as string | null
  
  // Determine if user has access to all branches
  // school_admin and super_admin always have all branches access
  // Users with NULL branch_id also have all branches access
  const hasAllBranchesAccess = 
    role === 'super_admin' || 
    role === 'school_admin' || 
    branchId === null

  return {
    schoolId: (data as any).school_id,
    role,
    branchId,
    hasAllBranchesAccess,
  }
}

export async function requireTenantContext(userId: string): Promise<TenantContext> {
  const context = await getTenantContext(userId)
  if (!context) {
    // Provide a more helpful error message
    throw new Error(
      "Your account is not associated with any school. Please contact your administrator to link your account to a school, or run the setup script in Supabase SQL Editor to create your school association."
    )
  }
  return context
}

/**
 * Get the branch filter for queries
 * Returns the branch_id if user is scoped to a branch, null otherwise
 */
export function getBranchFilter(context: TenantContext): string | null {
  if (context.hasAllBranchesAccess) {
    return null // No filter needed - user can see all branches
  }
  return context.branchId
}/**
 * Check if user can access a specific branch
 */
export function canAccessBranch(context: TenantContext, targetBranchId: string | null): boolean {
  // Users with all branches access can access any branch
  if (context.hasAllBranchesAccess) {
    return true
  }
  
  // If target has no branch (NULL), it's accessible to all
  if (targetBranchId === null) {
    return true
  }
  
  // Check if user's branch matches target branch
  return context.branchId === targetBranchId
}
