import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      school_code,
      first_name,
      last_name,
      date_of_birth,
      gender,
      previous_school,
      medical_notes,
      applied_class_id,
      guardian_name,
      guardian_phone,
      guardian_email,
      guardian_relationship,
      guardian_id_number,
      guardian_occupation,
      guardian_address,
    } = body

    if (!school_code || !first_name || !last_name || !guardian_name || !guardian_phone) {
      return NextResponse.json(
        { error: "Missing required fields: school_code, first_name, last_name, guardian_name, guardian_phone" },
        { status: 400 }
      )
    }

    const supabase = createServiceRoleClient() as any

    const { data: school, error: schoolError } = await supabase
      .from("schools")
      .select("id, name, is_active")
      .eq("code", school_code)
      .single()

    if (schoolError || !school) {
      return NextResponse.json({ error: "School not found" }, { status: 404 })
    }

    if (!(school as any).is_active) {
      return NextResponse.json({ error: "This school is not currently accepting applications" }, { status: 403 })
    }

    const schoolId = (school as any).id

    // Rate limit: prevent duplicate submissions from same phone in last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { data: recentApps } = await supabase
      .from("applications")
      .select("id")
      .eq("guardian_phone", guardian_phone)
      .eq("school_id", schoolId)
      .gte("created_at", fiveMinutesAgo)
      .limit(1)

    if (recentApps && recentApps.length > 0) {
      return NextResponse.json(
        { error: "An application was recently submitted with this phone number. Please wait a few minutes before trying again." },
        { status: 429 }
      )
    }

    // Build notes from extra guardian/student fields
    const notesParts: string[] = []
    if (previous_school) notesParts.push(`Previous school: ${previous_school}`)
    if (medical_notes) notesParts.push(`Medical notes: ${medical_notes}`)
    if (guardian_relationship) notesParts.push(`Relationship: ${guardian_relationship}`)
    if (guardian_id_number) notesParts.push(`Guardian ID: ${guardian_id_number}`)
    if (guardian_occupation) notesParts.push(`Occupation: ${guardian_occupation}`)
    if (guardian_address) notesParts.push(`Address: ${guardian_address}`)

    const applicationData: Record<string, any> = {
      school_id: schoolId,
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      dob: date_of_birth || null,
      gender: gender || null,
      guardian_name: guardian_name.trim(),
      guardian_phone: guardian_phone.trim(),
      guardian_email: guardian_email?.trim() || null,
      applied_class_id: applied_class_id || null,
      status: "pending",
      notes: notesParts.length > 0 ? notesParts.join("\n") : null,
    }

    const { data: application, error: insertError } = await supabase
      .from("applications")
      .insert(applicationData)
      .select()
      .single()

    if (insertError) {
      console.error("Public admission insert error:", insertError)
      return NextResponse.json(
        { error: "Failed to submit application. Please try again." },
        { status: 500 }
      )
    }

    // Generate a human-friendly reference from the row ID
    const appRef = `APP-${((application as any).id as string).slice(0, 8).toUpperCase()}`

    return NextResponse.json({
      success: true,
      applicationNumber: appRef,
      message: "Application submitted successfully",
    })
  } catch (error) {
    console.error("Public admission error:", error)
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    )
  }
}
