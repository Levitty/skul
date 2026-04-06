"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { formatPhoneNumber, validatePhoneNumber } from "@/lib/utils/phone-format"
import {
  generateVerificationCode,
  sendVerificationCode,
  verifyPhoneNumber,
  checkPhoneVerificationStatus,
  storeVerificationCode,
  checkRateLimit,
} from "@/lib/services/phone-verification"

/**
 * Update phone number in user profile
 */
export async function updatePhoneNumber(phoneNumber: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  // Format and validate phone number
  const formatted = formatPhoneNumber(phoneNumber)
  const validation = validatePhoneNumber(formatted)

  if (!validation.valid) {
    return { error: validation.error }
  }

  // Update phone number in profile
  const { error } = await (supabase as any)
    .from("user_profiles")
    .update({
      phone: formatted,
      phone_verified: false,
      phone_verification_code: null,
      phone_verification_expires_at: null,
    })
    .eq("id", user.id)

  if (error) {
    return { error: error.message }
  }

  return { success: true, phone: formatted }
}

/**
 * Send phone verification code
 */
export async function sendPhoneVerificationCode(phoneNumber?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  // Check rate limit
  const rateLimit = await checkRateLimit(user.id)
  if (!rateLimit.allowed) {
    return { error: rateLimit.error }
  }

  // Get current phone number from database or use provided one
  let phoneToUse = phoneNumber
  if (!phoneToUse) {
    const status = await checkPhoneVerificationStatus(user.id)
    phoneToUse = status.phone || undefined
  }

  if (!phoneToUse) {
    return { error: "Please set your phone number first" }
  }

  // Generate verification code
  const code = await generateVerificationCode()

  // Store code in profile
  const storeResult = await storeVerificationCode(user.id, code)
  if (!storeResult.success) {
    return { error: storeResult.error }
  }

  // Send code via WhatsApp
  const sendResult = await sendVerificationCode(phoneToUse, code)
  if (!sendResult.success) {
    return { error: sendResult.error }
  }

  return { success: true, message: "Verification code sent to your WhatsApp" }
}

/**
 * Verify phone code
 */
export async function verifyPhoneCode(code: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  // Verify code
  const result = await verifyPhoneNumber(user.id, code)
  if (!result.success) {
    return { error: result.error }
  }

  return { success: true, message: "Phone number verified successfully" }
}

/**
 * Check if WhatsApp/Twilio is configured
 */
export async function checkWhatsAppConfiguration() {
  const isConfigured =
    !!process.env.TWILIO_ACCOUNT_SID &&
    !!process.env.TWILIO_AUTH_TOKEN &&
    !!process.env.TWILIO_WHATSAPP_NUMBER

  return {
    configured: isConfigured,
    missing: [
      !process.env.TWILIO_ACCOUNT_SID && "TWILIO_ACCOUNT_SID",
      !process.env.TWILIO_AUTH_TOKEN && "TWILIO_AUTH_TOKEN",
      !process.env.TWILIO_WHATSAPP_NUMBER && "TWILIO_WHATSAPP_NUMBER",
    ].filter(Boolean) as string[],
  }
}

/**
 * Get phone setup status
 */
export async function getPhoneSetupStatus() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  try {
    const status = await checkPhoneVerificationStatus(user.id)
    const config = await checkWhatsAppConfiguration()

    return {
      success: true,
      phone: status.phone,
      verified: status.verified,
      hasCode: status.hasCode,
      codeExpiresAt: status.codeExpiresAt,
      whatsappConfigured: config.configured,
      missingEnvVars: config.missing,
    }
  } catch (error: any) {
    // If migration hasn't been run, return default values
    if (error?.message?.includes("phone_verification") || error?.code === "42703") {
      const config = await checkWhatsAppConfiguration()
      return {
        success: true,
        phone: null,
        verified: false,
        hasCode: false,
        codeExpiresAt: null,
        whatsappConfigured: config.configured,
        missingEnvVars: config.missing,
      }
    }
    // Re-throw other errors
    throw error
  }
}

