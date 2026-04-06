import { createClient } from "@/lib/supabase/server"
import { getTenantContext } from "@/lib/supabase/tenant-context"

export type Resource = 
  | "students"
  | "admissions"
  | "fees"
  | "attendance"
  | "grades"
  | "timetable"
  | "financials"
  | "strategic"
  | "settings"
  | "users"
  | "roles"
  | "inventory"
  | "sales"
  | "receipts"

export type Action = 
  | "create"
  | "read"
  | "update"
  | "delete"
  | "export"
  | "promote"
  | "transfer"
  | "suspend"
  | "approve"
  | "reject"
  | "convert"
  | "generate_invoice"
  | "record_payment"
  | "view_reports"
  | "publish"
  | "assign_roles"

/**
 * Check if the current user has a specific permission
 * Returns true if user has the permission, false otherwise
 */
export async function checkPermission(
  resource: Resource,
  action: Action
): Promise<boolean> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return false
    }

    const context = await getTenantContext(user.id)
    if (!context) {
      return false
    }

    // Super admin and school admin always have all permissions
    if (context.role === "super_admin" || context.role === "school_admin") {
      return true
    }

    // Check via database function
    // @ts-ignore - Supabase RPC type inference
    const { data, error } = await supabase.rpc("user_has_permission", {
      p_resource: resource,
      p_action: action,
    })

    if (error) {
      console.error("[checkPermission] Error:", error)
      return false
    }

    return data === true
  } catch (error) {
    console.error("[checkPermission] Exception:", error)
    return false
  }
}

/**
 * Check if the current user has any of the specified permissions
 * Returns true if user has at least one permission
 */
export async function checkAnyPermission(
  permissions: Array<{ resource: Resource; action: Action }>
): Promise<boolean> {
  for (const { resource, action } of permissions) {
    if (await checkPermission(resource, action)) {
      return true
    }
  }
  return false
}

/**
 * Check if the current user has all of the specified permissions
 * Returns true only if user has all permissions
 */
export async function checkAllPermissions(
  permissions: Array<{ resource: Resource; action: Action }>
): Promise<boolean> {
  for (const { resource, action } of permissions) {
    if (!(await checkPermission(resource, action))) {
      return false
    }
  }
  return true
}

/**
 * Get all permissions for the current user
 * Returns an array of { resource, action } objects
 */
export async function getUserPermissions(): Promise<
  Array<{ resource: string; action: string }>
> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return []
    }

    const context = await getTenantContext(user.id)
    if (!context) {
      return []
    }

    // Super admin and school admin have all permissions
    if (context.role === "super_admin" || context.role === "school_admin") {
      const { data: allPerms } = await supabase.from("permissions").select("resource, action")
      return allPerms || []
    }

    // Get permissions from database function
    // @ts-ignore - Supabase RPC type inference
    const { data, error } = await supabase.rpc("get_user_permissions")

    if (error) {
      console.error("[getUserPermissions] Error:", error)
      return []
    }

    return data || []
  } catch (error) {
    console.error("[getUserPermissions] Exception:", error)
    return []
  }
}

/**
 * Require a specific permission, throws if not authorized
 */
export async function requirePermission(
  resource: Resource,
  action: Action
): Promise<void> {
  const hasPermission = await checkPermission(resource, action)
  if (!hasPermission) {
    throw new Error(`Permission denied: ${resource}:${action}`)
  }
}

