import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { getChatbotSession } from "@/lib/services/whatsapp-chatbot"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const context = await requireTenantContext(user.id)
    if (!context) {
      return NextResponse.json({ error: "No school context" }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const phoneNumber = searchParams.get("phone_number")

    if (!phoneNumber) {
      return NextResponse.json({ error: "Phone number required" }, { status: 400 })
    }

    const session = await getChatbotSession(phoneNumber, context.schoolId)

    return NextResponse.json({ data: session })
  } catch (error: any) {
    console.error("[/api/whatsapp/chatbot] Error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}


