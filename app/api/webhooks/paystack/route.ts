import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { PaystackClient } from "@/lib/integrations/paystack"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { event, data } = body

    if (event !== "charge.success") {
      return NextResponse.json({ received: true })
    }

    const reference = data.reference

    const paystack = new PaystackClient(process.env.PAYSTACK_SECRET_KEY!)
    const verification = await paystack.verifyTransaction(reference)

    if (!verification.status || verification.data.status !== "success") {
      return NextResponse.json({ error: "Transaction verification failed" }, { status: 400 })
    }

    const supabase = await createClient()

    // Idempotency: reject duplicate webhook deliveries
    const { error: idempotencyError } = await supabase
      .from("webhook_events")
      .insert({ event_type: "paystack", event_id: reference } as any)

    if (idempotencyError?.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true })
    }

    const { data: payment } = await supabase
      .from("payments")
      .select("*, invoices(*)")
      .eq("transaction_ref", reference)
      .single()

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 })
    }

    const paymentData = payment as any

    const paymentUpdateData = {
      status: "completed",
      paid_at: new Date().toISOString(),
      gateway_response: verification.data,
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
    console.error("Paystack webhook error:", error)
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    )
  }
}
