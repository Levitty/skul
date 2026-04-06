"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

export interface RoleData {
  name: string
  description?: string
  permission_ids?: string[]
}

export async function createRole(data: RoleData) {
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

  // Create role
  const { data: role, error } = await supabase
    .from("custom_roles")
    // @ts-ignore - Supabase strict type checking
    .insert({
      school_id: context.schoolId,
      name: data.name,
      description: data.description,
      created_by: user.id,
    })
    .select()
    .single()

  if (error || !role) {
    return { error: error?.message || "Failed to create role" }
  }

  const roleData = role as any

  // Assign permissions if provided
  if (data.permission_ids && data.permission_ids.length > 0) {
    const permissionInserts = data.permission_ids.map((permissionId) => ({
      role_id: roleData.id,
      permission_id: permissionId,
    }))

    const { error: permError } = await supabase
      .from("role_permissions")
      // @ts-ignore - Supabase strict type checking
      .insert(permissionInserts)

    if (permError) {
      // Rollback role creation
      await supabase.from("custom_roles").delete().eq("id", roleData.id)
      return { error: permError.message }
    }
  }

  revalidatePath("/dashboard/admin/settings/roles")
  return { data: roleData }
}

export async function updateRole(roleId: string, data: Partial<RoleData>) {
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

  // Verify role belongs to school
  const { data: existingRole, error: roleError } = await supabase
    .from("custom_roles")
    .select("id, school_id, is_system_role")
    .eq("id", roleId)
    .eq("school_id", context.schoolId)
    .single()

  if (roleError || !existingRole) {
    return { error: "Role not found" }
  }

  const existingRoleData = existingRole as any
  if (existingRoleData.is_system_role) {
    return { error: "Cannot modify system roles" }
  }

  // Update role
  const { data: role, error } = await supabase
    .from("custom_roles")
    // @ts-ignore - Supabase strict type checking
    .update({
      name: data.name,
      description: data.description,
      updated_at: new Date().toISOString(),
    })
    .eq("id", roleId)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  // Update permissions if provided
  if (data.permission_ids !== undefined) {
    // Delete existing permissions
    await supabase.from("role_permissions").delete().eq("role_id", roleId)

    // Insert new permissions
    if (data.permission_ids.length > 0) {
      const permissionInserts = data.permission_ids.map((permissionId) => ({
        role_id: roleId,
        permission_id: permissionId,
      }))

      const { error: permError } = await supabase
        .from("role_permissions")
        // @ts-ignore - Supabase strict type checking
        .insert(permissionInserts)

      if (permError) {
        return { error: permError.message }
      }
    }
  }

  revalidatePath("/dashboard/admin/settings/roles")
  revalidatePath(`/dashboard/admin/settings/roles/${roleId}/edit`)
  return { data: role }
}

export async function deleteRole(roleId: string) {
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

  // Verify role belongs to school and is not a system role
  const { data: existingRole, error: roleError } = await supabase
    .from("custom_roles")
    .select("id, school_id, is_system_role")
    .eq("id", roleId)
    .eq("school_id", context.schoolId)
    .single()

  if (roleError || !existingRole) {
    return { error: "Role not found" }
  }

  const existingRoleData = existingRole as any
  if (existingRoleData.is_system_role) {
    return { error: "Cannot delete system roles" }
  }

  // Delete role (cascade will delete permissions)
  const { error } = await supabase.from("custom_roles").delete().eq("id", roleId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/settings/roles")
  return { success: true }
}

export async function getRoles() {
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

  const { data: roles, error } = await supabase
    .from("custom_roles")
    .select(`
      *,
      role_permissions(
        id,
        permissions(id, resource, action, description)
      )
    `)
    .eq("school_id", context.schoolId)
    .order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return { data: roles }
}

export async function getRole(roleId: string) {
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

  const { data: role, error } = await supabase
    .from("custom_roles")
    .select(`
      *,
      role_permissions(
        id,
        permissions(id, resource, action, description)
      )
    `)
    .eq("id", roleId)
    .eq("school_id", context.schoolId)
    .single()

  if (error) {
    return { error: error.message }
  }

  return { data: role }
}

export async function getPermissions() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Unauthorized" }
  }

  const { data: permissions, error } = await supabase
    .from("permissions")
    .select("*")
    .order("resource", { ascending: true })
    .order("action", { ascending: true })

  if (error) {
    return { error: error.message }
  }

  // Group by resource
  const permissionsList = permissions || []
  const grouped = permissionsList.reduce((acc: any, perm: any) => {
    if (!acc[perm.resource]) {
      acc[perm.resource] = []
    }
    acc[perm.resource].push(perm)
    return acc
  }, {})

  return { data: permissions, grouped }
}

