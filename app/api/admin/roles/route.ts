import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { getTenantContext } from "@/lib/supabase/tenant-context"

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get tenant context and verify admin role
    const context = await getTenantContext(user.id)
    if (
      !context ||
      (context.role !== "school_admin" && context.role !== "super_admin")
    ) {
      return NextResponse.json(
        { error: "Only school administrators can create roles" },
        { status: 403 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { name, description, permission_ids } = body

    // Validate required fields
    if (!name || !Array.isArray(permission_ids)) {
      return NextResponse.json(
        { error: "Name and permission_ids array are required" },
        { status: 400 }
      )
    }

    // Create service role client for admin operations
    const serviceRoleClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Create custom_role record
    const { data: newRole, error: roleError } = await serviceRoleClient
      .from("custom_roles" as any)
      .insert({
        school_id: context.schoolId,
        name: name.trim(),
        description: description?.trim() || null,
        is_system_role: false,
      })
      .select()
      .single()

    if (roleError || !newRole) {
      console.error("[roles] Role creation error:", roleError)
      return NextResponse.json(
        { error: "Failed to create role" },
        { status: 500 }
      )
    }

    // Create role_permissions records
    if (permission_ids.length > 0) {
      const rolePermissionsData = permission_ids.map((permissionId: string) => ({
        custom_role_id: newRole.id,
        permission_id: permissionId,
      }))

      const { error: permError } = await serviceRoleClient
        .from("role_permissions" as any)
        .insert(rolePermissionsData)

      if (permError) {
        console.error("[roles] Permission assignment error:", permError)
        // Clean up the role we just created
        await serviceRoleClient
          .from("custom_roles" as any)
          .delete()
          .eq("id", newRole.id)

        return NextResponse.json(
          { error: "Failed to assign permissions to role" },
          { status: 500 }
        )
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: "Role created successfully",
        role: newRole,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("[roles] Error:", error)
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get tenant context and verify admin role
    const context = await getTenantContext(user.id)
    if (
      !context ||
      (context.role !== "school_admin" && context.role !== "super_admin")
    ) {
      return NextResponse.json(
        { error: "Only school administrators can update roles" },
        { status: 403 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { id, name, description, permission_ids } = body

    // Validate required fields
    if (!id || !name || !Array.isArray(permission_ids)) {
      return NextResponse.json(
        { error: "ID, name, and permission_ids array are required" },
        { status: 400 }
      )
    }

    // Create service role client for admin operations
    const serviceRoleClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Verify role belongs to this school
    const { data: existingRole, error: fetchError } = await serviceRoleClient
      .from("custom_roles" as any)
      .select("*")
      .eq("id", id)
      .eq("school_id", context.schoolId)
      .single()

    if (fetchError || !existingRole) {
      return NextResponse.json(
        { error: "Role not found" },
        { status: 404 }
      )
    }

    // Update custom_role record
    const { error: updateError } = await serviceRoleClient
      .from("custom_roles" as any)
      .update({
        name: name.trim(),
        description: description?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)

    if (updateError) {
      console.error("[roles] Update error:", updateError)
      return NextResponse.json(
        { error: "Failed to update role" },
        { status: 500 }
      )
    }

    // Delete existing role_permissions
    const { error: deletePermsError } = await serviceRoleClient
      .from("role_permissions" as any)
      .delete()
      .eq("custom_role_id", id)

    if (deletePermsError) {
      console.error("[roles] Delete permissions error:", deletePermsError)
      return NextResponse.json(
        { error: "Failed to update permissions" },
        { status: 500 }
      )
    }

    // Create new role_permissions records
    if (permission_ids.length > 0) {
      const rolePermissionsData = permission_ids.map((permissionId: string) => ({
        custom_role_id: id,
        permission_id: permissionId,
      }))

      const { error: insertPermsError } = await serviceRoleClient
        .from("role_permissions" as any)
        .insert(rolePermissionsData)

      if (insertPermsError) {
        console.error("[roles] Insert permissions error:", insertPermsError)
        return NextResponse.json(
          { error: "Failed to assign permissions to role" },
          { status: 500 }
        )
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: "Role updated successfully",
      },
      { status: 200 }
    )
  } catch (error) {
    console.error("[roles] Error:", error)
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get tenant context and verify admin role
    const context = await getTenantContext(user.id)
    if (
      !context ||
      (context.role !== "school_admin" && context.role !== "super_admin")
    ) {
      return NextResponse.json(
        { error: "Only school administrators can delete roles" },
        { status: 403 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { id } = body

    // Validate required fields
    if (!id) {
      return NextResponse.json(
        { error: "Role ID is required" },
        { status: 400 }
      )
    }

    // Create service role client for admin operations
    const serviceRoleClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Verify role belongs to this school
    const { data: existingRole, error: fetchError } = await serviceRoleClient
      .from("custom_roles" as any)
      .select("*")
      .eq("id", id)
      .eq("school_id", context.schoolId)
      .single()

    if (fetchError || !existingRole) {
      return NextResponse.json(
        { error: "Role not found" },
        { status: 404 }
      )
    }

    // Check if any users are assigned to this role
    const { data: usersWithRole, error: checkError } = await serviceRoleClient
      .from("user_schools" as any)
      .select("id")
      .eq("custom_role_id", id)
      .eq("school_id", context.schoolId)

    if (checkError) {
      console.error("[roles] Check error:", checkError)
      return NextResponse.json(
        { error: "Failed to verify role usage" },
        { status: 500 }
      )
    }

    if (usersWithRole && usersWithRole.length > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete role with ${usersWithRole.length} assigned user${usersWithRole.length !== 1 ? "s" : ""}. Please reassign them first.`,
        },
        { status: 409 }
      )
    }

    // Delete role_permissions first
    const { error: deletePermsError } = await serviceRoleClient
      .from("role_permissions" as any)
      .delete()
      .eq("custom_role_id", id)

    if (deletePermsError) {
      console.error("[roles] Delete permissions error:", deletePermsError)
      return NextResponse.json(
        { error: "Failed to delete role permissions" },
        { status: 500 }
      )
    }

    // Delete custom_role
    const { error: deleteRoleError } = await serviceRoleClient
      .from("custom_roles" as any)
      .delete()
      .eq("id", id)

    if (deleteRoleError) {
      console.error("[roles] Delete role error:", deleteRoleError)
      return NextResponse.json(
        { error: "Failed to delete role" },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        message: "Role deleted successfully",
      },
      { status: 200 }
    )
  } catch (error) {
    console.error("[roles] Error:", error)
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    )
  }
}
