import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { Body } = body

    if (!Body?.stkCallback) {
      return NextResponse.json({ received: true })
    }

    const callback = Body.stkCallback

    if (callback.ResultCode !== 0) {
      return NextResponse.json({ received: true })
    }

    const supabase = await createClient()

    const metadata = callback.CallbackMetadata?.Item || []
    const mpesaAmount = metadata.find((item: any) => item.Name === "Amount")?.Value
    const mpesaReceipt = metadata.find((item: any) => item.Name === "MpesaReceiptNumber")
      ?.Value
    const phoneNumber = metadata.find((item: any) => item.Name === "PhoneNumber")?.Value

    // Idempotency: reject duplicate webhook deliveries using CheckoutRequestID
    const eventId = mpesaReceipt || callback.CheckoutRequestID
    const { error: idempotencyError } = await supabase
      .from("webhook_events")
      .insert({ event_type: "mpesa", event_id: eventId } as any)

    if (idempotencyError?.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true })
    }

    const { data: payment } = await supabase
      .from("payments")
      .select("*, invoices(*)")
      .eq("transaction_ref", callback.CheckoutRequestID)
      .single()

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 })
    }

    const paymentData = payment as any

    // A4: Verify M-Pesa amount matches initiated amount
    const initiatedAmount = Number(paymentData.amount)
    const actualAmount = Number(mpesaAmount)
    if (mpesaAmount !== undefined && actualAmount !== initiatedAmount) {
      console.warn(
        `[M-Pesa] Amount mismatch for ${callback.CheckoutRequestID}: ` +
        `initiated=${initiatedAmount}, actual=${actualAmount}`
      )
    }

    // Use the actual M-Pesa amount (what was really charged)
    const finalAmount = mpesaAmount !== undefined ? actualAmount : initiatedAmount

    const paymentUpdateData: Record<string, any> = {
      status: "completed",
      paid_at: new Date().toISOString(),
      transaction_ref: mpesaReceipt || callback.CheckoutRequestID,
      gateway_response: callback,
    }

    if (finalAmount !== initiatedAmount) {
      paymentUpdateData.amount = finalAmount
    }

    // @ts-ignore - Supabase strict type checking
    await supabase.from("payments").update(paymentUpdateData).eq("id", paymentData.id)

    const invoice = paymentData.invoices as any
    const { data: totalPaidData } = await supabase
      .from("payments")
      .select("amount")
      .eq("invoice_id", invoice.id)
      .eq("status", "completed")

    const paymentsList = totalPaidData || []
    const paidAmount = paymentsList.reduce(
      (sum: number, p: any) => sum + Number(p.amount),
      0
    )

    let invoiceStatus = "unpaid"
    if (paidAmount >= invoice.amount) {
      invoiceStatus = "paid"
    } else if (paidAmount > 0) {
      invoiceStatus = "partial"
    }

    const invoiceUpdateData = { status: invoiceStatus }
    // @ts-ignore - Supabase strict type checking
    await supabase.from("invoices").update(invoiceUpdateData).eq("id", invoice.id)

    await supabase.from("payment_reconciliations").insert({
      school_id: invoice.school_id,
      payment_id: paymentData.id,
      matched_invoice_id: invoice.id,
      status: "matched",
      reconciled_at: new Date().toISOString(),
    } as any)

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error("M-Pesa webhook error:", error)
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    )
  }
}
