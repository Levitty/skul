import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { getTenantContext } from "@/lib/supabase/tenant-context"

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const context = await getTenantContext(user.id)
    if (!context || (context.role !== "school_admin" && context.role !== "super_admin")) {
      return NextResponse.json({ error: "Only school administrators can update users" }, { status: 403 })
    }

    const body = await request.json()
    const { userSchoolId, fullName, phone, role, branchId, customRoleId } = body

    if (!userSchoolId || !fullName || !role) {
      return NextResponse.json({ error: "User school ID, full name, and role are required" }, { status: 400 })
    }

    const serviceRoleClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Verify user exists and belongs to this school
    const { data: userSchool, error: fetchError } = await serviceRoleClient
      .from("user_schools" as any)
      .select("user_id, school_id")
      .eq("id", userSchoolId)
      .single()

    if (fetchError || !userSchool) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const us = userSchool as any
    if (us.school_id !== context.schoolId) {
      return NextResponse.json({ error: "You do not have permission to update this user" }, { status: 403 })
    }

    // Update profile
    await serviceRoleClient
      .from("user_profiles" as any)
      .update({ full_name: fullName, phone: phone || null } as any)
      .eq("id", us.user_id)

    // Update user_schools
    await serviceRoleClient
      .from("user_schools" as any)
      .update({ role, branch_id: branchId || null, custom_role_id: customRoleId || null } as any)
      .eq("id", userSchoolId)

    return NextResponse.json({ success: true, message: "User updated successfully" })
  } catch (error) {
    console.error("[update-user] Error:", error)
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const context = await getTenantContext(user.id)
    if (!context || (context.role !== "school_admin" && context.role !== "super_admin")) {
      return NextResponse.json({ error: "Only school administrators can manage account status" }, { status: 403 })
    }

    const body = await request.json()
    const { userSchoolId, action } = body

    if (!userSchoolId || !action || !["deactivate", "reactivate"].includes(action)) {
      return NextResponse.json({ error: "User school ID and valid action required" }, { status: 400 })
    }

    const serviceRoleClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: userSchool, error: fetchError } = await serviceRoleClient
      .from("user_schools" as any)
      .select("user_id, school_id")
      .eq("id", userSchoolId)
      .single()

    if (fetchError || !userSchool) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const us = userSchool as any
    if (us.school_id !== context.schoolId) {
      return NextResponse.json({ error: "You do not have permission to manage this user" }, { status: 403 })
    }

    if (action === "deactivate") {
      await serviceRoleClient.auth.admin.updateUserById(us.user_id, { ban_duration: "87600h" })
    } else {
      await serviceRoleClient.auth.admin.updateUserById(us.user_id, { ban_duration: "none" })
    }

    return NextResponse.json({
      success: true,
      message: `User ${action === "deactivate" ? "deactivated" : "reactivated"} successfully`,
    })
  } catch (error) {
    console.error("[update-user] Error:", error)
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 })
  }
}
