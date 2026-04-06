import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { updatePhoneNumber, getPhoneSetupStatus, checkWhatsAppConfiguration } from "@/lib/actions/whatsapp-setup"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const status = await getPhoneSetupStatus()
    if (status.error) {
      return NextResponse.json({ error: status.error }, { status: 400 })
    }

    return NextResponse.json({
      phone: status.phone,
      verified: status.verified,
      hasCode: status.hasCode,
      codeExpiresAt: status.codeExpiresAt,
      whatsappConfigured: status.whatsappConfigured,
      missingEnvVars: status.missingEnvVars,
    })
  } catch (error: any) {
    console.error("[/api/whatsapp/setup] Error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { phone } = body

    if (!phone) {
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 })
    }

    const result = await updatePhoneNumber(phone)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, phone: result.phone })
  } catch (error: any) {
    console.error("[/api/whatsapp/setup] Error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

