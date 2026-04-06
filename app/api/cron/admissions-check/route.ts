import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { alertStuckApplications } from "@/lib/agents/admissions-watchdog"

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const supabase = await createClient()

    // Get all active schools
    const { data: schools, error: schoolsError } = await supabase
      .from("schools")
      .select("id")
      .eq("is_active", true)

    if (schoolsError || !schools) {
      return NextResponse.json({ message: "No active schools found" })
    }

    const schoolsList = schools || []
    // Get admissions officers for each school
    for (const school of schoolsList) {
      const { data: admissionsOfficers } = await supabase
        .from("user_schools")
        .select("user_id, user_profiles(phone)")
        .eq("school_id", (school as any).id)
        .eq("role", "school_admin")
        .limit(1)

      const officersList = admissionsOfficers || []
      if (officersList.length > 0) {
        const officer = officersList[0] as any
        const phone = officer.user_profiles?.phone

        if (phone) {
          try {
            await alertStuckApplications((school as any).id, phone)
          } catch (error) {
            console.error(`Failed to send alert for school ${(school as any).id}:`, error)
          }
        }
      }
    }

    return NextResponse.json({ message: "Admissions checks completed" })
  } catch (error: any) {
    console.error("Admissions watchdog cron error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to check admissions" },
      { status: 500 }
    )
  }
}

