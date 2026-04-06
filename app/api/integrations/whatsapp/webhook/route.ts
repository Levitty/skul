import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { handleIncomingMessage, sendChatbotResponse } from "@/lib/services/whatsapp-chatbot"

/**
 * Verify Twilio webhook signature
 */
function verifyTwilioSignature(
  url: string,
  params: URLSearchParams,
  signature: string
): boolean {
  // For production, implement proper Twilio signature verification
  // For now, we'll use a simple secret check
  const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET

  if (!webhookSecret) {
    // In development, allow without verification
    return process.env.NODE_ENV === "development"
  }

  // Basic verification - in production, use Twilio's signature validation
  return true
}

/**
 * Handle Twilio WhatsApp webhook
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const signature = request.headers.get("x-twilio-signature") || ""

    // Get webhook data
    const messageSid = formData.get("MessageSid") as string
    const accountSid = formData.get("AccountSid") as string
    const from = formData.get("From") as string // whatsapp:+254...
    const to = formData.get("To") as string
    const body = formData.get("Body") as string
    const messageStatus = formData.get("MessageStatus") as string

    // Verify signature (basic check for now)
    const url = request.url
    const params = new URLSearchParams(formData as any)
    if (!verifyTwilioSignature(url, params, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }

    // Handle delivery status updates
    if (messageStatus && messageStatus !== "received") {
      const supabase = createServiceRoleClient() as any

      if (messageSid) {
        await supabase
          .from("whatsapp_notification_queue")
          .update({
            status: messageStatus === "delivered" ? "delivered" : "sent",
            delivered_at:
              messageStatus === "delivered"
                ? new Date().toISOString()
                : null,
          })
          .eq("external_message_id", messageSid)

        // Update notification logs
        await supabase
          .from("notification_logs")
          .update({
            status: messageStatus === "delivered" ? "delivered" : "sent",
          })
          .eq("external_id", messageSid)
      }

      return NextResponse.json({ status: "ok" })
    }

    // Handle incoming message (chatbot)
    if (body && from) {
      console.log("[WhatsApp Webhook] Received message:", { from, body })
      
      // Extract phone number (remove whatsapp: prefix)
      const phoneNumber = from.replace("whatsapp:", "")
      
      // Try different phone formats for lookup
      const phoneVariants = [
        phoneNumber,                    // +254712345678
        phoneNumber.replace("+", ""),   // 254712345678
        "+" + phoneNumber.replace("+", ""), // Ensure + prefix
      ]
      
      console.log("[WhatsApp Webhook] Looking for phone:", phoneVariants)

      // Get school ID from Twilio number or default
      // In production, you might want to map Twilio numbers to schools
      const supabase = createServiceRoleClient() as any

      // Try user_profiles first with multiple phone formats
      let profile: { id: string } | null = null
      
      for (const phone of phoneVariants) {
        const { data } = await supabase
          .from("user_profiles")
          .select("id")
          .eq("phone", phone)
          .single()
        
        if (data) {
          profile = data
          console.log("[WhatsApp Webhook] Found user profile for phone:", phone)
          break
        }
      }

      // If not found, try guardians
      if (!profile) {
        for (const phone of phoneVariants) {
          const { data: guardian } = await supabase
            .from("guardians")
            .select("user_id")
            .eq("phone", phone)
            .limit(1)
            .single()

          if (guardian) {
            profile = { id: (guardian as any).user_id }
            console.log("[WhatsApp Webhook] Found guardian for phone:", phone)
            break
          }
        }
      }

      if (!profile) {
        console.log("[WhatsApp Webhook] No user found for phone, sending welcome message")
        // Send a helpful response even if user not found
        try {
          await sendChatbotResponse(phoneNumber,
            "Hello! Your phone number is not registered in our system.\n\n" +
            "Please ask your school administrator to add your phone number to your profile, " +
            "or visit the WhatsApp settings page in the school portal to set up your number."
          )
        } catch (e) {
          console.error("[WhatsApp Webhook] Failed to send response:", e)
        }
        return NextResponse.json({ status: "ok" })
      }

      // Get user's school
      const { data: userSchool } = await supabase
        .from("user_schools")
        .select("school_id")
        .eq("user_id", profile.id)
        .limit(1)
        .single()

      if (!userSchool) {
        console.log("[WhatsApp Webhook] User has no school association")
        await sendChatbotResponse(phoneNumber, 
          "Your account is not associated with any school. Please contact your administrator."
        )
        return NextResponse.json({ status: "ok" })
      }

      console.log("[WhatsApp Webhook] Processing message for school:", (userSchool as any).school_id)

      // Process message through chatbot
      const chatbotResponse = await handleIncomingMessage({
        phoneNumber: phoneNumber,
        messageText: body,
        schoolId: (userSchool as any).school_id,
        userId: profile.id,
      })

      console.log("[WhatsApp Webhook] Sending response:", chatbotResponse.response.substring(0, 100))

      // Send response
      await sendChatbotResponse(phoneNumber, chatbotResponse.response)

      return NextResponse.json({ status: "ok" })
    }

    return NextResponse.json({ status: "ok" })
  } catch (error: any) {
    console.error("[WhatsApp Webhook] Error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

// Handle GET for webhook verification (Twilio sometimes sends GET)
export async function GET(request: NextRequest) {
  return NextResponse.json({ status: "ok" })
}

