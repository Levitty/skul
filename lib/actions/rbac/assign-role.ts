"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

export async function assignRoleToUser(userId: string, roleId: string | null) {
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

  // Verify user belongs to same school
  const { data: userSchool, error: userSchoolError } = await supabase
    .from("user_schools")
    .select("id, user_id, school_id")
    .eq("user_id", userId)
    .eq("school_id", context.schoolId)
    .single()

  if (userSchoolError || !userSchool) {
    return { error: "User not found in this school" }
  }

  // If roleId provided, verify role belongs to same school
  if (roleId) {
    const { data: role, error: roleError } = await supabase
      .from("custom_roles")
      .select("id, school_id")
      .eq("id", roleId)
      .eq("school_id", context.schoolId)
      .single()

    if (roleError || !role) {
      return { error: "Role not found" }
    }
  }

  // Update user's custom role
  const { error } = await supabase
    .from("user_schools")
    // @ts-ignore - Supabase strict type checking
    .update({ custom_role_id: roleId })
    .eq("id", (userSchool as any).id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/settings/users")
  return { success: true }
}

export async function getSchoolUsers() {
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

  const { data: users, error } = await supabase
    .from("user_schools")
    .select(`
      id,
      user_id,
      role,
      custom_role_id,
      user_profiles!inner(id, full_name, email, avatar_url),
      custom_roles(id, name)
    `)
    .eq("school_id", context.schoolId)

  if (error) {
    return { error: error.message }
  }

  return { data: users }
}

