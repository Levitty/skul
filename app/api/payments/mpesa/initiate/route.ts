import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { MpesaClient } from "@/lib/integrations/mpesa"

export async function POST(request: NextRequest) {
  try {
    const { invoiceId, phoneNumber } = await request.json()

    if (!invoiceId || !phoneNumber) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Get invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .single()

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      )
    }

    const invoiceData = invoice as any

    // Create payment record
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert({
        invoice_id: invoiceId,
        amount: invoiceData.amount,
        method: "mpesa",
        status: "pending",
        transaction_ref: `STK-${Date.now()}`,
      } as any)
      .select()
      .single()

    if (paymentError || !payment) {
      throw paymentError || new Error("Failed to create payment")
    }

    const paymentData = payment as any

    // Initialize M-Pesa STK Push
    const mpesa = new MpesaClient({
      consumerKey: process.env.MPESA_CONSUMER_KEY!,
      consumerSecret: process.env.MPESA_CONSUMER_SECRET!,
      shortcode: process.env.MPESA_SHORTCODE!,
      passkey: process.env.MPESA_PASSKEY!,
      environment: (process.env.MPESA_ENVIRONMENT as "sandbox" | "production") || "sandbox",
    })

    const stkResponse = await mpesa.initiateSTKPush(
      phoneNumber,
      Math.round(invoiceData.amount),
      invoiceData.reference,
      `Payment for ${invoiceData.reference}`
    )

    // Update payment with CheckoutRequestID
    const updateData = {
      transaction_ref: stkResponse.CheckoutRequestID,
      gateway_response: stkResponse,
    }
    // @ts-ignore - Supabase strict type checking
    await supabase.from("payments").update(updateData).eq("id", paymentData.id)

    return NextResponse.json({
      success: true,
      checkoutRequestId: stkResponse.CheckoutRequestID,
      message: stkResponse.CustomerMessage,
    })
  } catch (error: any) {
    console.error("M-Pesa initiation error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to initiate payment" },
      { status: 500 }
    )
  }
}

