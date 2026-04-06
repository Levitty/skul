"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

/**
 * Apply a discount to an invoice.
 * Effective balance = amount - discount_amount - payments
 */
export async function applyInvoiceDiscount(
  invoiceId: string,
  discountAmount: number,
  reason: string
) {
  const supabase = await createClient() as any
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

  // Verify invoice exists and belongs to school
  const { data: invoice, error: fetchError } = await supabase
    .from("invoices")
    .select("id, school_id, amount, student_id")
    .eq("id", invoiceId)
    .single()

  if (fetchError || !invoice || (invoice as any).school_id !== context.schoolId) {
    throw new Error("Invoice not found or access denied")
  }

  // @ts-ignore - Supabase strict type checking
  const { error: updateError } = await supabase
    .from("invoices")
    .update({
      discount_amount: discountAmount,
      discount_reason: reason,
    })
    .eq("id", invoiceId)
    .eq("school_id", context.schoolId)

  if (updateError) {
    throw new Error(`Failed to apply discount: ${updateError.message}`)
  }

  revalidatePath("/dashboard/accountant/fees")
  revalidatePath("/dashboard/accountant/finance")
  revalidatePath(`/dashboard/admin/students/${(invoice as any).student_id}`)

  return { success: true }
}

/**
 * Create a credit note for an invoice (draft status)
 */
export async function createCreditNote(
  invoiceId: string,
  amount: number,
  reason: string,
  description?: string
) {
  const supabase = await createClient() as any
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

  // Verify invoice exists and belongs to school
  const { data: invoice, error: fetchError } = await supabase
    .from("invoices")
    .select("id, school_id, student_id, amount, status, discount_amount")
    .eq("id", invoiceId)
    .single()

  if (fetchError || !invoice || (invoice as any).school_id !== context.schoolId) {
    throw new Error("Invoice not found or access denied")
  }

  // Calculate invoice outstanding balance
  const { data: payments } = await supabase
    .from("payments")
    .select("amount")
    .eq("invoice_id", invoiceId)
    .eq("status", "completed")

  const totalPaid = payments?.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0) || 0
  const discountAmount = Number(invoice.discount_amount || 0)
  const invoiceAmount = Number(invoice.amount || 0)
  const outstandingBalance = invoiceAmount - discountAmount - totalPaid

  if (amount > outstandingBalance) {
    throw new Error(`Credit note amount (${amount}) exceeds outstanding balance (${outstandingBalance})`)
  }

  const creditNumber = `CN-${Date.now().toString(36)}`

  const creditNoteData = {
    school_id: context.schoolId,
    invoice_id: invoiceId,
    student_id: (invoice as any).student_id,
    credit_number: creditNumber,
    amount,
    reason,
    description: description || null,
    issued_by: user.id,
    status: 'draft',
  }

  // @ts-ignore - Supabase strict type checking
  const { data: creditNote, error: insertError } = await supabase
    .from("credit_notes")
    .insert(creditNoteData)
    .select()
    .single()

  if (insertError) {
    throw new Error(`Failed to create credit note: ${insertError.message}`)
  }

  revalidatePath("/dashboard/accountant/fees")
  revalidatePath("/dashboard/accountant/fees/credit-notes")
  revalidatePath(`/dashboard/admin/students/${(invoice as any).student_id}`)

  return { success: true, creditNumber, creditNoteId: creditNote.id }
}

/**
 * Approve a credit note (draft → approved)
 */
export async function approveCreditNote(creditNoteId: string) {
  const supabase = await createClient() as any
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

  // Verify credit note exists and belongs to school
  const { data: creditNote, error: fetchError } = await supabase
    .from("credit_notes")
    .select("id, school_id, status")
    .eq("id", creditNoteId)
    .single()

  if (fetchError || !creditNote || (creditNote as any).school_id !== context.schoolId) {
    throw new Error("Credit note not found or access denied")
  }

  if ((creditNote as any).status !== 'draft') {
    throw new Error(`Cannot approve credit note with status: ${(creditNote as any).status}`)
  }

  // @ts-ignore - Supabase strict type checking
  const { error: updateError } = await supabase
    .from("credit_notes")
    .update({
      status: 'approved',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", creditNoteId)
    .eq("school_id", context.schoolId)

  if (updateError) {
    throw new Error(`Failed to approve credit note: ${updateError.message}`)
  }

  revalidatePath("/dashboard/accountant/fees/credit-notes")

  return { success: true }
}

/**
 * Apply a credit note to an invoice (approved → applied)
 * Reduces the invoice's outstanding balance
 */
export async function applyCreditNote(creditNoteId: string) {
  const supabase = await createClient() as any
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

  // Verify credit note exists and belongs to school
  const { data: creditNote, error: fetchError } = await supabase
    .from("credit_notes")
    .select("id, school_id, status, invoice_id, amount")
    .eq("id", creditNoteId)
    .single()

  if (fetchError || !creditNote || (creditNote as any).school_id !== context.schoolId) {
    throw new Error("Credit note not found or access denied")
  }

  if ((creditNote as any).status !== 'approved') {
    throw new Error(`Cannot apply credit note with status: ${(creditNote as any).status}`)
  }

  // @ts-ignore - Supabase strict type checking
  const { error: updateError } = await supabase
    .from("credit_notes")
    .update({
      status: 'applied',
      applied_at: new Date().toISOString(),
    })
    .eq("id", creditNoteId)
    .eq("school_id", context.schoolId)

  if (updateError) {
    throw new Error(`Failed to apply credit note: ${updateError.message}`)
  }

  revalidatePath("/dashboard/accountant/fees/credit-notes")
  revalidatePath(`/dashboard/accountant/fees/invoices/${(creditNote as any).invoice_id}`)

  return { success: true }
}

/**
 * Void a credit note (can be done from draft or approved status)
 */
export async function voidCreditNote(creditNoteId: string) {
  const supabase = await createClient() as any
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

  // Verify credit note exists and belongs to school
  const { data: creditNote, error: fetchError } = await supabase
    .from("credit_notes")
    .select("id, school_id, status")
    .eq("id", creditNoteId)
    .single()

  if (fetchError || !creditNote || (creditNote as any).school_id !== context.schoolId) {
    throw new Error("Credit note not found or access denied")
  }

  if ((creditNote as any).status === 'applied' || (creditNote as any).status === 'voided') {
    throw new Error(`Cannot void credit note with status: ${(creditNote as any).status}`)
  }

  // @ts-ignore - Supabase strict type checking
  const { error: updateError } = await supabase
    .from("credit_notes")
    .update({
      status: 'voided',
    })
    .eq("id", creditNoteId)
    .eq("school_id", context.schoolId)

  if (updateError) {
    throw new Error(`Failed to void credit note: ${updateError.message}`)
  }

  revalidatePath("/dashboard/accountant/fees/credit-notes")

  return { success: true }
}

/**
 * Fetch credit notes for the school with optional filters
 */
export async function getCreditNotes(
  filters?: {
    studentId?: string
    status?: string
    startDate?: string
    endDate?: string
  }
) {
  const supabase = await createClient() as any
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

  let query = supabase
    .from("credit_notes")
    .select(`
      *,
      invoices(id, reference, amount),
      students(id, first_name, last_name, admission_number)
    `)
    .eq("school_id", context.schoolId)
    .order("issued_at", { ascending: false })

  if (filters?.studentId) {
    query = query.eq("student_id", filters.studentId)
  }

  if (filters?.status) {
    query = query.eq("status", filters.status)
  }

  if (filters?.startDate) {
    query = query.gte("issued_at", filters.startDate)
  }

  if (filters?.endDate) {
    query = query.lte("issued_at", filters.endDate)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch credit notes: ${error.message}`)
  }

  return data || []
}

/**
 * Fetch all credit notes for a specific invoice
 */
export async function getInvoiceCreditNotes(invoiceId: string) {
  const supabase = await createClient() as any
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

  const { data, error } = await supabase
    .from("credit_notes")
    .select(`
      *,
      invoices(id, reference, amount),
      students(id, first_name, last_name, admission_number)
    `)
    .eq("invoice_id", invoiceId)
    .eq("school_id", context.schoolId)
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch credit notes: ${error.message}`)
  }

  return data || []
}
