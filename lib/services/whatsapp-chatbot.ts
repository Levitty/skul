"use server"

import { createServiceRoleClient } from "@/lib/supabase/server"
import { WhatsAppClient } from "@/lib/integrations/whatsapp"
import { processStrategicQuestion, ConversationMessage } from "@/lib/agents/strategic-advisor"
import { getTemplate, renderTemplate } from "@/lib/templates/whatsapp-templates"
import { requireTenantContext } from "@/lib/supabase/tenant-context"

export interface ChatbotMessage {
  phoneNumber: string
  messageText: string
  schoolId: string
  userId?: string
}

export interface ChatbotResponse {
  response: string
  sessionId?: string
  intent?: string
}

/**
 * Classify user intent from message
 */
function classifyIntent(messageText: string): string {
  const text = messageText.toLowerCase().trim()

  // Greeting
  if (
    text.match(/^(hi|hello|hey|greetings|good morning|good afternoon|good evening)/i)
  ) {
    return "greeting"
  }

  // Help
  if (text.match(/^(help|commands|what can you do|options)/i)) {
    return "help"
  }

  // Strategic query
  if (
    text.match(
      /(collection|velocity|retention|capacity|runway|profit|revenue|expense|student|fee|payment|stock|inventory|kpi|metric|performance|analysis|what if|scenario)/
    )
  ) {
    return "strategic_query"
  }

  // Default to strategic query
  return "strategic_query"
}

/**
 * Authenticate user by phone number
 */
async function authenticateUser(
  phoneNumber: string,
  schoolId: string
): Promise<{ userId: string; role: string } | null> {
  const supabase = createServiceRoleClient()

  // Format phone number for lookup
  const formatPhoneNumber = (phone: string): string => {
    let cleaned = phone.replace(/\D/g, "")
    if (cleaned.startsWith("254")) {
      return `+${cleaned}`
    } else if (cleaned.startsWith("0")) {
      return `+254${cleaned.substring(1)}`
    } else if (cleaned.length === 9) {
      return `+254${cleaned}`
    }
    return phone.startsWith("+") ? phone : `+${phone}`
  }

  const formattedPhone = formatPhoneNumber(phoneNumber)

  // Find user by phone number in user_profiles
  // Check for verified phone numbers first
  let { data: profile } = await (supabase as any)
    .from("user_profiles")
    .select("id, phone_verified")
    .eq("phone", formattedPhone)
    .single()

  // If not found, try without formatting (in case stored differently)
  if (!profile) {
    const { data: profile2 } = await (supabase as any)
      .from("user_profiles")
      .select("id, phone_verified")
      .or(`phone.eq.${phoneNumber},phone.eq.${formattedPhone}`)
      .limit(1)
      .single()

    profile = profile2 || null
  }

  // If not found in user_profiles, try guardians
  if (!profile) {
    const { data: guardian } = await (supabase as any)
      .from("guardians")
      .select("user_id")
      .or(`phone.eq.${phoneNumber},phone.eq.${formattedPhone}`)
      .limit(1)
      .single()

    if (guardian) {
      profile = { id: (guardian as any).user_id, phone_verified: false }
    }
  }

  if (!profile) {
    return null
  }

  // Check if user is associated with school
  const { data: userSchool } = await (supabase as any)
    .from("user_schools")
    .select("user_id, role")
    .eq("user_id", (profile as any).id)
    .eq("school_id", schoolId)
    .single()

  if (!userSchool) {
    return null
  }

  // Allow access if:
  // 1. User has admin role (super_admin, school_admin, branch_admin), OR
  // 2. Phone is verified
  const hasAdminRole = ["super_admin", "school_admin", "branch_admin"].includes(
    (userSchool as any).role
  )
  const isPhoneVerified = (profile as any).phone_verified === true

  if (!hasAdminRole && !isPhoneVerified) {
    return null
  }

  return {
    userId: (userSchool as any).user_id,
    role: (userSchool as any).role,
  }
}

/**
 * Format strategic advisor response for WhatsApp
 */
function formatStrategicResponse(response: any): string {
  let formatted = ""

  // Direct answer
  if (response.answer) {
    formatted += `📊 ${response.answer}\n\n`
  }

  // Insights
  if (response.insights && response.insights.length > 0) {
    formatted += "📈 Key Insights:\n"
    for (const insight of response.insights) {
      const emoji =
        insight.type === "success"
          ? "✅"
          : insight.type === "warning"
          ? "⚠️"
          : insight.type === "danger"
          ? "🔴"
          : "ℹ️"

      formatted += `${emoji} ${insight.title}: ${insight.value}`
      if (insight.comparison) {
        formatted += ` (${insight.comparison})`
      }
      formatted += "\n"
    }
    formatted += "\n"
  }

  // Recommendation
  if (response.recommendation) {
    formatted += `💡 Recommendation:\n${response.recommendation}\n`
  }

  // Error handling
  if (response.error) {
    formatted = `❌ Error: ${response.error}\n\nPlease try rephrasing your question or type "help" for available commands.`
  }

  return formatted.trim() || "I couldn't generate a response. Please try again."
}

/**
 * Get suggested questions for chatbot
 */
export async function getSuggestedQuestions(): Promise<string[]> {
  return [
    "What's our collection velocity?",
    "Show me low stock items",
    "What's our student retention rate?",
    "Financial runway",
    "Capacity utilization",
  ]
}

/**
 * Handle incoming WhatsApp message for chatbot
 */
export async function handleIncomingMessage(
  message: ChatbotMessage
): Promise<ChatbotResponse> {
  const supabase = createServiceRoleClient()

  // Authenticate user
  const auth = await authenticateUser(message.phoneNumber, message.schoolId)

  // Get or create session (even for unauthorized users, to track attempts)
  let { data: session } = await (supabase as any)
    .from("whatsapp_chatbot_sessions")
    .select("*")
    .eq("school_id", message.schoolId)
    .eq("phone_number", message.phoneNumber)
    .single()

  if (!auth) {
    // Provide helpful error message
    const errorMessage = `❌ Access Denied

To use the WhatsApp chatbot, you need to:
1. Have your phone number configured in your profile
2. Verify your phone number via WhatsApp
3. Have admin access to your school

Please visit the WhatsApp dashboard in your school management system to set up your phone number.`

    // Log unauthorized attempt if session exists
    if (session) {
      await (supabase as any).from("whatsapp_chatbot_messages").insert({
        session_id: (session as any).id,
        message_type: "incoming",
        message_text: message.messageText,
        intent: "unauthorized",
      })

      await (supabase as any).from("whatsapp_chatbot_messages").insert({
        session_id: (session as any).id,
        message_type: "outgoing",
        message_text: errorMessage,
        intent: "unauthorized",
      })
    }
    
    return {
      response: errorMessage,
      intent: "unauthorized",
      sessionId: session?.id,
    }
  }

  // Get or create session for authenticated users (reuse existing session variable)
  if (!session) {
    const { data: existingSession } = await (supabase as any)
      .from("whatsapp_chatbot_sessions")
      .select("*")
      .eq("school_id", message.schoolId)
      .eq("phone_number", message.phoneNumber)
      .single()

    session = existingSession
  }

  if (!session) {
    const { data: newSession, error: sessionError } = await (supabase as any)
      .from("whatsapp_chatbot_sessions")
      .insert({
        school_id: message.schoolId,
        user_id: auth.userId,
        phone_number: message.phoneNumber,
        session_state: "active",
      })
      .select()
      .single()

    if (sessionError) {
      console.error("[WhatsApp Chatbot] Session creation error:", sessionError)
    }
    session = newSession
  } else {
    // Update last interaction
    await (supabase as any)
      .from("whatsapp_chatbot_sessions")
      .update({
        last_interaction_at: new Date().toISOString(),
        session_state: "active",
      })
      .eq("id", (session as any).id)
  }

  // Classify intent
  const intent = classifyIntent(message.messageText)

  // Handle case where session could not be created
  if (!session) {
    console.error("[WhatsApp Chatbot] Could not create or find session")
    return {
      response: "Sorry, there was a technical issue. Please try again later.",
      intent: "error",
    }
  }

  // Log incoming message
  await (supabase as any).from("whatsapp_chatbot_messages").insert({
    session_id: (session as any).id,
    message_type: "incoming",
    message_text: message.messageText,
    intent: intent,
  })

  let responseText = ""
  let responseData: any = null

  // Handle different intents
  switch (intent) {
    case "greeting":
      responseText = getTemplate("chatbot_greeting")
      break

    case "help":
      responseText = getTemplate("chatbot_help")
      break

    case "strategic_query":
      try {
        // Load conversation history for context-aware follow-ups
        const conversationHistory: ConversationMessage[] = []
        const { data: recentMessages } = await (supabase as any)
          .from("whatsapp_chatbot_messages")
          .select("message_type, message_text")
          .eq("session_id", (session as any).id)
          .order("created_at", { ascending: false })
          .limit(10)

        if (recentMessages && recentMessages.length > 0) {
          const reversed = [...recentMessages].reverse()
          for (const msg of reversed) {
            conversationHistory.push({
              role: (msg as any).message_type === "incoming" ? "user" : "assistant",
              content: (msg as any).message_text,
            })
          }
        }

        const advisorResponse = await processStrategicQuestion({
          question: message.messageText,
          schoolId: message.schoolId,
          userId: auth.userId,
          conversationHistory,
          channel: "whatsapp",
        })

        responseData = advisorResponse
        responseText = formatStrategicResponse(advisorResponse)
      } catch (error: any) {
        console.error("[WhatsApp Chatbot] Strategic query error:", error)
        responseText = "❌ Sorry, I couldn't process your question right now. Please try again or type \"help\" for available commands."
      }
      break

    default:
      responseText = getTemplate("chatbot_error")
  }

  // Log outgoing message
  await (supabase as any).from("whatsapp_chatbot_messages").insert({
    session_id: (session as any).id,
    message_type: "outgoing",
    message_text: responseText,
    intent: intent,
    response_data: responseData,
  })

  return {
    response: responseText,
    sessionId: session.id,
    intent: intent,
  }
}

/**
 * Send chatbot response via WhatsApp
 */
export async function sendChatbotResponse(
  phoneNumber: string,
  response: string
): Promise<void> {
  if (
    !process.env.TWILIO_ACCOUNT_SID ||
    !process.env.TWILIO_AUTH_TOKEN ||
    !process.env.TWILIO_WHATSAPP_NUMBER
  ) {
    throw new Error("WhatsApp is not configured")
  }

  const whatsapp = new WhatsAppClient({
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER,
  })

  // Format phone number
  let formattedPhone = phoneNumber.replace(/\D/g, "")
  if (!formattedPhone.startsWith("254")) {
    if (formattedPhone.startsWith("0")) {
      formattedPhone = "254" + formattedPhone.substring(1)
    } else {
      formattedPhone = "254" + formattedPhone
    }
  }

  await whatsapp.sendMessage({
    to: formattedPhone,
    body: response,
  })
}

/**
 * Get chatbot session
 */
export async function getChatbotSession(
  phoneNumber: string,
  schoolId: string
) {
  const supabase = createServiceRoleClient()

  const { data: session } = await (supabase as any)
    .from("whatsapp_chatbot_sessions")
    .select(`
      *,
      whatsapp_chatbot_messages(*)
    `)
    .eq("school_id", schoolId)
    .eq("phone_number", phoneNumber)
    .order("whatsapp_chatbot_messages(created_at)", { ascending: false })
    .single()

  return session
}

