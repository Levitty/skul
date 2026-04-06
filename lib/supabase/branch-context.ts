import { createClient } from "./server"
import { TenantContext } from "./tenant-context"

/**
 * Branch context utilities for managing branch-level access control
 */

/**
 * Get all branches for the current school
 * School admins see all branches, branch users see only their branch
 */
export async function getAccessibleBranches(context: TenantContext) {
  const supabase = await createClient()
  
  let query = supabase
    .from("school_branches")
    .select("id, name, address, phone, email, is_active, manager_user_id")
    .eq("school_id", context.schoolId)
    .eq("is_active", true)
    .order("name", { ascending: true })
  
  // If user is scoped to a branch, only return that branch
  if (!context.hasAllBranchesAccess && context.branchId) {
    query = query.eq("id", context.branchId)
  }
  
  const { data, error } = await query
  
  if (error) {
    console.error("[getAccessibleBranches] Error:", error)
    return []
  }
  
  return data || []
}

/**
 * Apply branch filter to a Supabase query builder
 * This modifies the query to filter by branch_id if the user is branch-scoped
 * 
 * @param query - The Supabase query builder
 * @param context - The tenant context
 * @param branchIdColumn - The column name for branch_id (default: "branch_id")
 * @returns The modified query
 */
export function applyBranchFilter<T>(
  query: T,
  context: TenantContext,
  branchIdColumn: string = "branch_id"
): T {
  if (!context.hasAllBranchesAccess && context.branchId) {
    // @ts-ignore - Dynamic column filtering
    return query.eq(branchIdColumn, context.branchId)
  }
  return query
}

/**
 * Build a branch filter condition for raw SQL or complex queries
 * Returns a condition string and parameters
 */
export function buildBranchCondition(
  context: TenantContext,
  branchIdColumn: string = "branch_id"
): { condition: string; branchId: string | null } {
  if (!context.hasAllBranchesAccess && context.branchId) {
    return {
      condition: `${branchIdColumn} = $branchId`,
      branchId: context.branchId
    }
  }
  return {
    condition: "TRUE", // No filter needed
    branchId: null
  }
}

/**
 * Validate that the user can access a specific branch
 * Throws an error if access is denied
 */
export function requireBranchAccess(
  context: TenantContext,
  targetBranchId: string | null
): void {
  // Users with all branches access can access any branch
  if (context.hasAllBranchesAccess) {
    return
  }
  
  // If target has no branch (NULL), it's accessible to all
  if (targetBranchId === null) {
    return
  }
  
  // Check if user's branch matches target branch
  if (context.branchId !== targetBranchId) {
    throw new Error("Access denied: You don't have permission to access this branch's data")
  }
}

/**
 * Get the default branch_id to use when creating new records
 * For branch-scoped users, this is their branch
 * For school admins, this returns null (they should explicitly select)
 */
export function getDefaultBranchId(context: TenantContext): string | null {
  if (context.hasAllBranchesAccess) {
    return null // School admin should explicitly select a branch
  }
  return context.branchId
}

/**
 * Check if user is a branch admin
 */
export function isBranchAdmin(context: TenantContext): boolean {
  return context.role === 'branch_admin'
}

/**
 * Check if user can manage branches (create/edit/delete)
 */
export function canManageBranches(context: TenantContext): boolean {
  return context.role === 'super_admin' || context.role === 'school_admin'
}

/**
 * Check if user can assign users to branches
 */
export function canAssignUsersToBranches(context: TenantContext): boolean {
  return context.role === 'super_admin' || 
         context.role === 'school_admin' || 
         context.role === 'branch_admin'
}


