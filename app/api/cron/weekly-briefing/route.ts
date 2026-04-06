import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sendMondayBriefing } from "@/lib/agents/monday-briefing"

export async function GET(request: NextRequest) {
  // Verify cron secret (for security)
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
    // Get principals/owners for each school
    for (const school of schoolsList) {
      const { data: principals } = await supabase
        .from("user_schools")
        .select("user_id, user_profiles(phone)")
        .eq("school_id", (school as any).id)
        .eq("role", "school_admin")
        .limit(1)

      const principalsList = principals || []
      if (principalsList.length > 0) {
        const principal = principalsList[0] as any
        const phone = principal.user_profiles?.phone

        if (phone) {
          try {
            await sendMondayBriefing((school as any).id, phone)
          } catch (error) {
            console.error(`Failed to send briefing for school ${(school as any).id}:`, error)
          }
        }
      }
    }

    return NextResponse.json({ message: "Briefings sent successfully" })
  } catch (error: any) {
    console.error("Weekly briefing cron error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to send briefings" },
      { status: 500 }
    )
  }
}

