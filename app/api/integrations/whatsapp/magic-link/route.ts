import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { WhatsAppClient } from "@/lib/integrations/whatsapp"
import { randomBytes } from "node:crypto"

export async function POST(request: NextRequest) {
  try {
    const { phoneNumber, purpose, referenceId, schoolId } = await request.json()

    if (!phoneNumber || !purpose || !schoolId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Generate secure token
    const token = randomBytes(32).toString("hex")

    // Create magic link session (expires in 24 hours)
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24)

    const { data: session, error: sessionError } = await supabase
      .from("whatsapp_sessions")
      .insert({
        school_id: schoolId,
        phone_number: phoneNumber,
        token,
        purpose,
        reference_id: referenceId || null,
        expires_at: expiresAt.toISOString(),
      } as any)
      .select()
      .single()

    if (sessionError || !session) {
      throw sessionError || new Error("Failed to create session")
    }

    const sessionData = session as any

    // Generate magic link URL
    const magicLinkUrl = `${process.env.NEXT_PUBLIC_APP_URL}/magic/${token}`

    // Send WhatsApp message
    const whatsapp = new WhatsAppClient({
      accountSid: process.env.TWILIO_ACCOUNT_SID!,
      authToken: process.env.TWILIO_AUTH_TOKEN!,
      whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER!,
    })

    await whatsapp.sendMagicLink(phoneNumber, magicLinkUrl, purpose)

    return NextResponse.json({
      success: true,
      sessionId: sessionData.id,
      expiresAt: expiresAt.toISOString(),
    })
  } catch (error: any) {
    console.error("Magic link creation error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to create magic link" },
      { status: 500 }
    )
  }
}

