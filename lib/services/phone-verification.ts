"use server"

import { createClient } from "@/lib/supabase/server"
import { WhatsAppClient } from "@/lib/integrations/whatsapp"
import { formatPhoneNumber, validatePhoneNumber } from "@/lib/utils/phone-format"

/**
 * Generate a 6-digit verification code
 */
export async function generateVerificationCode(): Promise<string> {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

/**
 * Send verification code via WhatsApp
 */
export async function sendVerificationCode(
  phoneNumber: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  if (
    !process.env.TWILIO_ACCOUNT_SID ||
    !process.env.TWILIO_AUTH_TOKEN ||
    !process.env.TWILIO_WHATSAPP_NUMBER
  ) {
    return { success: false, error: "WhatsApp is not configured" }
  }

  const formattedPhone = formatPhoneNumber(phoneNumber)
  const validation = validatePhoneNumber(formattedPhone)
  
  if (!validation.valid) {
    return { success: false, error: validation.error }
  }

  const whatsapp = new WhatsAppClient({
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER,
  })

  const message = `Your Tuta WhatsApp verification code is: ${code}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this code, please ignore this message.`

  try {
    await whatsapp.sendMessage({
      to: formattedPhone.replace("+", ""), // Remove + for Twilio
      body: message,
    })
    return { success: true }
  } catch (error: any) {
    console.error("Failed to send verification code:", error)
    return { success: false, error: error.message || "Failed to send verification code" }
  }
}

/**
 * Verify phone number code
 */
export async function verifyPhoneNumber(
  userId: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  // Get user profile with verification code
  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("phone, phone_verification_code, phone_verification_expires_at")
    .eq("id", userId)
    .single()

  if (profileError || !profile) {
    return { success: false, error: "User profile not found" }
  }

  const profileData = profile as any

  // Check if code exists
  if (!profileData.phone_verification_code) {
    return { success: false, error: "No verification code found. Please request a new code." }
  }

  // Check if code matches
  if (profileData.phone_verification_code !== code) {
    return { success: false, error: "Invalid verification code" }
  }

  // Check if code has expired
  if (profileData.phone_verification_expires_at) {
    const expiresAt = new Date(profileData.phone_verification_expires_at)
    if (expiresAt < new Date()) {
      return { success: false, error: "Verification code has expired. Please request a new code." }
    }
  }

  // Verify phone number
  const { error: updateError } = await (supabase
    .from("user_profiles") as any)
    .update({
      phone_verified: true,
      phone_verification_code: null,
      phone_verification_expires_at: null,
    })
    .eq("id", userId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  return { success: true }
}

/**
 * Check phone verification status
 */
export async function checkPhoneVerificationStatus(
  userId: string
): Promise<{
  phone: string | null
  verified: boolean
  hasCode: boolean
  codeExpiresAt: string | null
}> {
  const supabase = await createClient()

  try {
    const { data: profile, error } = await supabase
      .from("user_profiles")
      .select("phone, phone_verified, phone_verification_code, phone_verification_expires_at")
      .eq("id", userId)
      .single()

    if (error || !profile) {
      // If error is about missing column, return defaults
      if (error?.code === "42703" || error?.message?.includes("phone_verification")) {
        return {
          phone: null,
          verified: false,
          hasCode: false,
          codeExpiresAt: null,
        }
      }
      return {
        phone: null,
        verified: false,
        hasCode: false,
        codeExpiresAt: null,
      }
    }

    const profileData = profile as any

    return {
      phone: profileData.phone || null,
      verified: profileData.phone_verified || false,
      hasCode: !!profileData.phone_verification_code,
      codeExpiresAt: profileData.phone_verification_expires_at || null,
    }
  } catch (error: any) {
    // If columns don't exist (migration not run), return defaults
    if (error?.code === "42703" || error?.message?.includes("phone_verification") || error?.message?.includes("column")) {
      return {
        phone: null,
        verified: false,
        hasCode: false,
        codeExpiresAt: null,
      }
    }
    // Re-throw other errors
    throw error
  }
}

/**
 * Store verification code in user profile
 */
export async function storeVerificationCode(
  userId: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  // Code expires in 10 minutes
  const expiresAt = new Date()
  expiresAt.setMinutes(expiresAt.getMinutes() + 10)

  const { error } = await (supabase
    .from("user_profiles") as any)
    .update({
      phone_verification_code: code,
      phone_verification_expires_at: expiresAt.toISOString(),
    })
    .eq("id", userId)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Check rate limit for verification code requests
 */
export async function checkRateLimit(userId: string): Promise<{ allowed: boolean; error?: string }> {
  const supabase = await createClient()

  // TEMPORARY: Increased rate limit for testing
  // In production, use proper rate limiting (e.g., Redis-based)
  const MAX_REQUESTS_PER_HOUR = 10 // Increased from 3 for testing
  const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 hour

  // Get verification code history from user_profiles
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("phone_verification_expires_at, updated_at")
    .eq("id", userId)
    .single()

  if (!profile) {
    return { allowed: true }
  }

  const profileData = profile as any

  // Check if there's an active code that was recently created
  if (profileData.phone_verification_expires_at) {
    const expiresAt = new Date(profileData.phone_verification_expires_at)
    const createdAt = new Date(expiresAt.getTime() - 10 * 60 * 1000) // Code is valid for 10 min
    const oneHourAgo = new Date(Date.now() - RATE_LIMIT_WINDOW_MS)

    // If code was created within the last hour, check rate limit
    if (createdAt > oneHourAgo) {
      // For now, we'll use a simple check: if there's an active code less than 5 minutes old, allow
      // Otherwise, check if we've hit the limit
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
      
      // If code is very recent (less than 5 min), allow (user might be retrying)
      if (createdAt > fiveMinutesAgo) {
        return { allowed: true }
      }

      // For testing: Allow more requests
      // In production, you'd query a rate limit table or use Redis
      // For now, we'll be lenient and allow up to MAX_REQUESTS_PER_HOUR
      return { allowed: true } // Temporarily disabled strict rate limiting for testing
    }
  }

  return { allowed: true }
}
