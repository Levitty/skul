/**
 * Phone number formatting and validation utilities
 * These can be used on both client and server
 */

/**
 * Format phone number to standard format (Kenya: +254XXXXXXXXX)
 */
export function formatPhoneNumber(phone: string): string {
  // Remove all non-digit characters
  let cleaned = phone.replace(/\D/g, "")

  // Handle Kenya phone numbers
  if (cleaned.startsWith("254")) {
    return `+${cleaned}`
  } else if (cleaned.startsWith("0")) {
    // Convert 0XXXXXXXXX to +254XXXXXXXXX
    return `+254${cleaned.substring(1)}`
  } else if (cleaned.length === 9) {
    // Assume it's a Kenya number without country code
    return `+254${cleaned}`
  } else {
    // Return as is with + prefix if missing
    return cleaned.startsWith("+") ? cleaned : `+${cleaned}`
  }
}

/**
 * Validate phone number format (Kenya)
 */
export function validatePhoneNumber(phone: string): { valid: boolean; error?: string } {
  const formatted = formatPhoneNumber(phone)
  
  // Kenya phone number regex: +254 followed by 9 digits
  const kenyaPhoneRegex = /^\+254[17]\d{8}$/
  
  if (!kenyaPhoneRegex.test(formatted)) {
    return {
      valid: false,
      error: "Invalid phone number format. Please use Kenya format: +254XXXXXXXXX or 0XXXXXXXXX",
    }
  }
  
  return { valid: true }
}


