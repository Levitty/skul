import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  sendPhoneVerificationCode,
  verifyPhoneCode,
  getPhoneSetupStatus,
} from "@/lib/actions/whatsapp-setup"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { action, code, phone } = body

    if (action === "send_code") {
      const result = await sendPhoneVerificationCode(phone)
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }
      return NextResponse.json({ success: true, message: result.message })
    }

    if (action === "verify_code") {
      if (!code) {
        return NextResponse.json({ error: "Verification code is required" }, { status: 400 })
      }
      const result = await verifyPhoneCode(code)
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }
      return NextResponse.json({ success: true, message: result.message })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error: any) {
    console.error("[/api/whatsapp/verify-phone] Error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

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
    })
  } catch (error: any) {
    console.error("[/api/whatsapp/verify-phone] Error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

