/**
 * Paystack payment gateway integration
 */

export interface PaystackConfig {
  publicKey: string
  secretKey: string
}

export interface PaystackInitializeResponse {
  status: boolean
  message: string
  data: {
    authorization_url: string
    access_code: string
    reference: string
  }
}

export interface PaystackVerifyResponse {
  status: boolean
  message: string
  data: {
    amount: number
    currency: string
    transaction_date: string
    status: string
    reference: string
    customer: {
      email: string
    }
  }
}

export class PaystackClient {
  private secretKey: string
  private baseUrl = "https://api.paystack.co"

  constructor(secretKey: string) {
    this.secretKey = secretKey
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || "Paystack API error")
    }

    return response.json()
  }

  async initializeTransaction(
    email: string,
    amount: number, // in kobo (smallest currency unit)
    reference: string,
    metadata?: Record<string, any>
  ): Promise<PaystackInitializeResponse> {
    return this.request<PaystackInitializeResponse>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email,
        amount,
        reference,
        metadata,
      }),
    })
  }

  async verifyTransaction(
    reference: string
  ): Promise<PaystackVerifyResponse> {
    return this.request<PaystackVerifyResponse>(
      `/transaction/verify/${reference}`
    )
  }
}

