import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { processStrategicQuestion, processScenario } from "@/lib/agents/strategic-advisor"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const context = await requireTenantContext(user.id)
    if (!context) {
      return NextResponse.json({ error: "No school context" }, { status: 403 })
    }

    // Only allow school owners and admins
    if (!["super_admin", "school_admin", "school_owner"].includes(context.role)) {
      return NextResponse.json(
        { error: "Strategic Advisor is only available for school administrators" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { type, question, scenario } = body

    if (type === "scenario" && scenario) {
      const result = await processScenario(scenario, {
        question: scenario.description,
        schoolId: context.schoolId,
        userId: user.id,
      })
      return NextResponse.json(result)
    }

    if (!question) {
      return NextResponse.json({ error: "Question is required" }, { status: 400 })
    }

    const result = await processStrategicQuestion({
      question,
      schoolId: context.schoolId,
      userId: user.id,
      channel: "web",
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("[/api/strategic] Error:", error)
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    )
  }
}



