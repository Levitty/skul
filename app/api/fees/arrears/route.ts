import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const context = await requireTenantContext(user.id)
    if (!context) {
      return NextResponse.json({ error: "User not associated with any school" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const classId = searchParams.get("classId")
    const termId = searchParams.get("termId")
    const status = searchParams.get("status")

    // Ignore "all" values
    const actualClassId = classId && classId !== "all" ? classId : undefined
    const actualTermId = termId && termId !== "all" ? termId : undefined

    let query = supabase
      .from("invoices")
      .select(`
        *,
        students(id, first_name, last_name, admission_number, enrollments(class_id, classes(name)))
      `)
      .eq("school_id", context.schoolId)
      .in("status", ["unpaid", "partial", "overdue"])

    if (actualTermId) {
      query = query.eq("term_id", actualTermId)
    }

    if (status) {
      query = query.eq("status", status)
    }

    const { data: invoices, error } = await query

    if (error) {
      throw new Error(error.message)
    }

    // Filter by class if specified
    let filteredInvoices = invoices || []
    if (actualClassId) {
      filteredInvoices = filteredInvoices.filter((inv: any) => {
        const enrollments = inv.students?.enrollments || []
        return enrollments.some((e: any) => e.class_id === actualClassId)
      })
    }

    // Calculate outstanding amounts
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const arrears = await Promise.all(
      filteredInvoices.map(async (invoice: any) => {
        const { data: payments } = await supabase
          .from("payments")
          .select("amount")
          .eq("invoice_id", invoice.id)
          .eq("status", "completed")

        const paymentsList = payments || []
        const totalPaid = paymentsList.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0)
        const outstanding = Number(invoice.amount) - totalPaid
        const dueDate = invoice.due_date ? new Date(invoice.due_date) : null
        const daysOverdue = dueDate ? Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))) : 0
        const agingBucket =
          daysOverdue === 0 ? "Current" :
          daysOverdue <= 30 ? "0-30" :
          daysOverdue <= 60 ? "31-60" :
          daysOverdue <= 90 ? "61-90" :
          "90+"

        return {
          ...invoice,
          totalPaid,
          outstanding,
          daysOverdue,
          agingBucket,
        }
      })
    )

    const result = arrears.filter((a) => a.outstanding > 0)

    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

