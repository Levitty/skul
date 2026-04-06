/**
 * M-Pesa STK Push integration
 */

export interface MpesaConfig {
  consumerKey: string
  consumerSecret: string
  shortcode: string
  passkey: string
  environment: "sandbox" | "production"
}

export interface MpesaSTKPushResponse {
  MerchantRequestID: string
  CheckoutRequestID: string
  ResponseCode: string
  ResponseDescription: string
  CustomerMessage: string
}

export interface MpesaSTKCallback {
  Body: {
    stkCallback: {
      MerchantRequestID: string
      CheckoutRequestID: string
      ResultCode: number
      ResultDesc: string
      CallbackMetadata?: {
        Item: Array<{
          Name: string
          Value: string | number
        }>
      }
    }
  }
}

export class MpesaClient {
  private config: MpesaConfig
  private accessToken: string | null = null
  private tokenExpiry: number = 0

  constructor(config: MpesaConfig) {
    this.config = config
  }

  private getBaseUrl(): string {
    return this.config.environment === "sandbox"
      ? "https://sandbox.safaricom.co.ke"
      : "https://api.safaricom.co.ke"
  }

  private async getAccessToken(): Promise<string> {
    // Check if token is still valid (with 5 minute buffer)
    if (this.accessToken && Date.now() < this.tokenExpiry - 300000) {
      return this.accessToken
    }

    const credentials = Buffer.from(
      `${this.config.consumerKey}:${this.config.consumerSecret}`
    ).toString("base64")

    const response = await fetch(
      `${this.getBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`,
      {
        method: "GET",
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      }
    )

    if (!response.ok) {
      throw new Error("Failed to get M-Pesa access token")
    }

    const data = await response.json() as { access_token?: string | null; expires_in?: number | null }
    this.accessToken = data.access_token || ""
    const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600
    this.tokenExpiry = Date.now() + expiresIn * 1000

    return this.accessToken
  }

  private async generatePassword(): Promise<string> {
    const timestamp = new Date()
      .toISOString()
      .replace(/[^0-9]/g, "")
      .slice(0, -3)

    const password = Buffer.from(
      `${this.config.shortcode}${this.config.passkey}${timestamp}`
    ).toString("base64")

    return password
  }

  async initiateSTKPush(
    phoneNumber: string,
    amount: number,
    accountReference: string,
    transactionDesc: string
  ): Promise<MpesaSTKPushResponse> {
    const accessToken = await this.getAccessToken()
    const password = await this.generatePassword()
    const timestamp = new Date()
      .toISOString()
      .replace(/[^0-9]/g, "")
      .slice(0, -3)

    // Format phone number (remove + and ensure it starts with 254)
    const formattedPhone = phoneNumber.replace(/^\+/, "").replace(/^0/, "254")

    const response = await fetch(
      `${this.getBaseUrl()}/mpesa/stkpush/v1/processrequest`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          BusinessShortCode: this.config.shortcode,
          Password: password,
          Timestamp: timestamp,
          TransactionType: "CustomerPayBillOnline",
          Amount: amount,
          PartyA: formattedPhone,
          PartyB: this.config.shortcode,
          PhoneNumber: formattedPhone,
          CallBackURL: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/mpesa`,
          AccountReference: accountReference,
          TransactionDesc: transactionDesc,
        }),
      }
    )

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.errorMessage || "M-Pesa STK Push failed")
    }

    return response.json()
  }
}

