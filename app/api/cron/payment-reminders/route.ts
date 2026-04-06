import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sendPaymentReminder } from "@/lib/services/whatsapp-notifications"

export async function GET(request: NextRequest) {
  // Verify cron secret (for security)
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Check if payment reminders are enabled
  if (process.env.WHATSAPP_PAYMENT_REMINDERS_ENABLED !== "true") {
    return NextResponse.json({ message: "Payment reminders are disabled" })
  }

  try {
    const supabase = await createClient()

    // Get all active schools
    const { data: schools } = await supabase
      .from("schools")
      .select("id")
      .eq("is_active", true)

    if (!schools || schools.length === 0) {
      return NextResponse.json({ message: "No active schools found" })
    }

    let totalReminders = 0
    let successCount = 0
    let errorCount = 0

    // Process each school
    for (const school of schools) {
      // Find invoices with outstanding balances due within 7 days
      const sevenDaysFromNow = new Date()
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)

      const { data: invoices } = await supabase
        .from("invoices")
        .select(`
          id,
          student_id,
          amount,
          status,
          due_date,
          students!inner(
            id,
            school_id,
            status
          )
        `)
        .eq("students.school_id", (school as any).id)
        .eq("students.status", "active")
        .in("status", ["unpaid", "partial", "overdue"])
        .lte("due_date", sevenDaysFromNow.toISOString().split("T")[0])
        .gte("due_date", new Date().toISOString().split("T")[0]) // Not past due (or include overdue if needed)

      if (!invoices || invoices.length === 0) {
        continue
      }

      // Send reminder for each invoice
      for (const invoice of (invoices as any[])) {
        totalReminders++
        try {
          await sendPaymentReminder(
            (invoice as any).students.id,
            invoice.id
          )
          successCount++
        } catch (error: any) {
          console.error(
            `Failed to send reminder for invoice ${invoice.id}:`,
            error.message
          )
          errorCount++
        }
      }
    }

    return NextResponse.json({
      message: "Payment reminders processed",
      total: totalReminders,
      success: successCount,
      errors: errorCount,
    })
  } catch (error: any) {
    console.error("Payment reminders cron error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to process payment reminders" },
      { status: 500 }
    )
  }
}


