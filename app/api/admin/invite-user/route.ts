import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { getTenantContext } from "@/lib/supabase/tenant-context"

/**
 * Generate a temporary random password
 */
function generateTempPassword(length: number = 16): string {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%"
  let password = ""
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length))
  }
  return password
}

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
        { error: "Only school administrators can invite users" },
        { status: 403 }
      )
    }

    // Parse request body
    const body = await request.json()
    const {
      email,
      fullName,
      phone,
      role,
      branchId,
      customRoleId,
      sendEmail,
    } = body

    // Validate required fields
    if (!email || !fullName || !role) {
      return NextResponse.json(
        { error: "Email, full name, and role are required" },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
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

    // Check if user already exists
    const { data: existingAuth } = await serviceRoleClient.auth.admin.listUsers()
    const userExists = existingAuth?.users?.some((u) => u.email === email)

    if (userExists) {
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 409 }
      )
    }

    // Create auth user with temporary password
    const tempPassword = generateTempPassword()
    const { data: authData, error: authError } =
      await serviceRoleClient.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
      })

    if (authError || !authData.user) {
      console.error("[invite-user] Auth error:", authError)
      return NextResponse.json(
        { error: "Failed to create user account" },
        { status: 500 }
      )
    }

    const newUserId = authData.user.id

    // Create user_profiles record
    const { error: profileError } = await serviceRoleClient
      .from("user_profiles" as any)
      .insert({
        id: newUserId,
        school_id: context.schoolId,
        full_name: fullName,
        phone: phone || null,
      })

    if (profileError) {
      console.error("[invite-user] Profile error:", profileError)
      // Try to clean up the auth user
      await serviceRoleClient.auth.admin.deleteUser(newUserId)
      return NextResponse.json(
        { error: "Failed to create user profile" },
        { status: 500 }
      )
    }

    // Create user_schools record
    const { error: userSchoolError } = await serviceRoleClient
      .from("user_schools" as any)
      .insert({
        user_id: newUserId,
        school_id: context.schoolId,
        role,
        branch_id: branchId || null,
        custom_role_id: customRoleId || null,
      })

    if (userSchoolError) {
      console.error("[invite-user] User schools error:", userSchoolError)
      // Try to clean up
      await serviceRoleClient.from("user_profiles").delete().eq("id", newUserId)
      await serviceRoleClient.auth.admin.deleteUser(newUserId)
      return NextResponse.json(
        { error: "Failed to assign user to school" },
        { status: 500 }
      )
    }

    // TODO: Send invitation email if sendEmail is true
    // This would integrate with your email service (SendGrid, Resend, etc.)
    // For now, we'll just log that it would be sent
    if (sendEmail) {
      console.log(
        `[invite-user] Would send invitation email to ${email} with temporary password`
      )
      // Email service integration would go here
    }

    return NextResponse.json(
      {
        success: true,
        message: "User invited successfully",
        user: {
          id: newUserId,
          email,
          fullName,
          role,
          branchId: branchId || null,
          customRoleId: customRoleId || null,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("[invite-user] Error:", error)
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    )
  }
}
