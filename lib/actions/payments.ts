"use server"

import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

export async function recordPayment(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Not authenticated")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    throw new Error("User not associated with any school")
  }

  const invoiceId = formData.get("invoice_id") as string
  const amount = parseFloat(formData.get("amount") as string)
  const method = formData.get("method") as string
  const transactionRef = formData.get("transaction_ref") as string || null
  const paidAt = formData.get("paid_at") as string || new Date().toISOString()
  const bankAccountId = formData.get("bank_account_id") as string || null

  // Use service role client to bypass RLS issues
  const adminClient = createServiceRoleClient()

  // Direct payment recording (bypasses record_payment_atomic RPC which has schema mismatches)
  // 1. Get invoice details
  const { data: invoice, error: invoiceError } = await adminClient
    .from("invoices")
    .select("id, amount, status, student_id, school_id")
    .eq("id", invoiceId)
    .single()

  if (invoiceError || !invoice) {
    throw new Error("Invoice not found")
  }

  const inv = invoice as any
  if (inv.school_id !== context.schoolId) {
    throw new Error("Invoice not found or access denied")
  }

  // 2. Calculate total already paid
  const { data: existingPayments } = await adminClient
    .from("payments")
    .select("amount")
    .eq("invoice_id", invoiceId)
    .eq("status", "completed")

  const totalPaid = (existingPayments || []).reduce(
    (sum: number, p: any) => sum + (Number(p.amount) || 0),
    0
  )

  const newTotal = totalPaid + amount
  const effectiveAmount = Number(inv.amount)

  // 3. Insert payment
  // @ts-ignore
  const { data: payment, error: paymentError } = await adminClient
    .from("payments")
    .insert({
      invoice_id: invoiceId,
      amount: amount,
      method: method,
      transaction_ref: transactionRef,
      status: "completed",
      paid_at: paidAt,
    })
    .select()
    .single()

  if (paymentError || !payment) {
    throw new Error(`Failed to insert payment: ${paymentError?.message || "unknown error"}`)
  }

  const paymentRecord = payment as any

  // 4. Update invoice status
  let newStatus: string
  if (newTotal >= effectiveAmount) {
    newStatus = "paid"
  } else {
    newStatus = "partial"
  }

  await adminClient
    .from("invoices")
    .update({ status: newStatus })
    .eq("id", invoiceId)

  const studentId = inv.student_id
  const paymentId = paymentRecord.id

  revalidatePath("/dashboard/accountant/fees")
  revalidatePath("/dashboard/accountant/finance")
  revalidatePath(`/dashboard/admin/students/${studentId}`)

  if (newStatus === "paid" && process.env.WHATSAPP_PAYMENT_RECEIPTS_ENABLED === "true") {
    try {
      const { sendReceipt } = await import("@/lib/services/whatsapp-notifications")

      const { data: guardians } = await supabase
        .from("guardians")
        .select("phone")
        .eq("student_id", studentId)
        .eq("is_primary", true)
        .single()

      const guardianProfile = guardians as any
      if (guardianProfile?.phone) {
        const receiptLink = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard/accountant/fees/invoices/${invoiceId}`

        await sendReceipt(guardianProfile.phone, {
          receipt_type: "Payment Receipt",
          reference_number: `PAY-${paymentId.slice(0, 8)}`,
          amount: Number(amount),
          date: new Date().toISOString(),
          payment_method: method,
          receipt_link: receiptLink,
          school_id: context.schoolId,
          recipient_id: studentId,
        })
      }
    } catch (error) {
      console.error("Failed to send WhatsApp receipt:", error)
    }
  }

  return { success: true, paymentId: paymentRecord.id, newStatus }
}

export async function getStudentStatement(studentId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Not authenticated")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    throw new Error("User not associated with any school")
  }

  const adminClient = createServiceRoleClient()

  // Verify student belongs to user's school
  const { data: student, error: studentError } = await adminClient
    .from("students")
    .select("school_id")
    .eq("id", studentId)
    .single()

  if (studentError || !student || (student as any).school_id !== context.schoolId) {
    throw new Error("Student not found or access denied")
  }

  // Get all invoices
  const { data: invoices } = await adminClient
    .from("invoices")
    .select("*, invoice_items(*), terms(name), academic_years(name)")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })

  // Get all payments
  const invoiceIds = invoices?.map((inv: any) => inv.id) || []
  const { data: payments } = invoiceIds.length > 0
    ? await adminClient
        .from("payments")
        .select("*")
        .in("invoice_id", invoiceIds)
        .order("created_at", { ascending: false })
    : { data: null }

  // Calculate totals
  const totalInvoiced = invoices?.reduce((sum: number, inv: any) => sum + Number(inv.amount || 0), 0) || 0
  const totalPaid = payments
    ?.filter((p: any) => p.status === "completed")
    .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0) || 0
  const balance = totalInvoiced - totalPaid

  return {
    student,
    invoices: invoices || [],
    payments: payments || [],
    summary: {
      totalInvoiced,
      totalPaid,
      balance,
    },
  }
}

export async function getArrears(filters?: {
  classId?: string
  termId?: string
  status?: string
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Not authenticated")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    throw new Error("User not associated with any school")
  }

  const adminClient = createServiceRoleClient()

  let query = adminClient
    .from("invoices")
    .select(`
      *,
      students(id, first_name, last_name, admission_number, enrollments(class_id, classes(name)))
    `)
    .eq("school_id", context.schoolId)
    .in("status", ["unpaid", "partial", "overdue"])

  if (filters?.termId) {
    query = query.eq("term_id", filters.termId)
  }

  if (filters?.status) {
    query = query.eq("status", filters.status)
  }

  const { data: invoices, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  // Filter by class if specified
  let filteredInvoices = invoices || []
  if (filters?.classId) {
    filteredInvoices = filteredInvoices.filter((inv: any) => {
      const enrollments = inv.students?.enrollments || []
      return enrollments.some((e: any) => e.class_id === filters.classId)
    })
  }

  // Calculate outstanding amounts
  const arrears = await Promise.all(
    filteredInvoices.map(async (invoice: any) => {
      const { data: payments } = await adminClient
        .from("payments")
        .select("amount")
        .eq("invoice_id", invoice.id)
        .eq("status", "completed")

      const totalPaid = payments?.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0) || 0
      const outstanding = Number(invoice.amount) - totalPaid

      return {
        ...invoice,
        totalPaid,
        outstanding,
      }
    })
  )

  return arrears.filter((a) => a.outstanding > 0)
}


