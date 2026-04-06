/**
 * Twilio WhatsApp integration for magic links
 */

export interface TwilioConfig {
  accountSid: string
  authToken: string
  whatsappNumber: string
}

export interface WhatsAppMessage {
  to: string
  body: string
}

export class WhatsAppClient {
  private config: TwilioConfig
  private baseUrl: string

  constructor(config: TwilioConfig) {
    this.config = config
    this.baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}`
  }

  private getAuthHeader(): string {
    const credentials = Buffer.from(
      `${this.config.accountSid}:${this.config.authToken}`
    ).toString("base64")
    return `Basic ${credentials}`
  }

  async sendMessage(message: WhatsAppMessage): Promise<{ messageSid: string }> {
    const formData = new URLSearchParams()
    
    // Handle "whatsapp:" prefix - don't add if already present
    const fromNumber = this.config.whatsappNumber.startsWith("whatsapp:")
      ? this.config.whatsappNumber
      : `whatsapp:${this.config.whatsappNumber}`
    
    const toNumber = message.to.startsWith("whatsapp:")
      ? message.to
      : `whatsapp:${message.to}`
    
    formData.append("From", fromNumber)
    formData.append("To", toNumber)
    formData.append("Body", message.body)

    const response = await fetch(
      `${this.baseUrl}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: this.getAuthHeader(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      }
    )

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || "Failed to send WhatsApp message")
    }

    const result = await response.json()
    return { messageSid: result.sid }
  }

  /**
   * Send a media message (PDF, image) via WhatsApp.
   * The mediaUrl must be publicly accessible — Twilio fetches it server-side.
   */
  async sendMedia(
    to: string,
    mediaUrl: string,
    caption?: string
  ): Promise<{ messageSid: string }> {
    const formData = new URLSearchParams()

    const fromNumber = this.config.whatsappNumber.startsWith("whatsapp:")
      ? this.config.whatsappNumber
      : `whatsapp:${this.config.whatsappNumber}`

    const toNumber = to.startsWith("whatsapp:")
      ? to
      : `whatsapp:${to}`

    formData.append("From", fromNumber)
    formData.append("To", toNumber)
    formData.append("MediaUrl", mediaUrl)
    if (caption) {
      formData.append("Body", caption)
    }

    const response = await fetch(
      `${this.baseUrl}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: this.getAuthHeader(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      }
    )

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || "Failed to send WhatsApp media")
    }

    const result = await response.json()
    return { messageSid: result.sid }
  }

  async sendMagicLink(
    phoneNumber: string,
    magicLinkUrl: string,
    purpose: string
  ): Promise<void> {
    const message = `Hello! Click this link to ${purpose}: ${magicLinkUrl}\n\nThis link will expire in 24 hours.`
    await this.sendMessage({
      to: phoneNumber,
      body: message,
    })
  }
}

