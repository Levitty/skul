"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

export async function getAccountsPayable(filters?: {
  status?: string
  vendorName?: string
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

  let query = supabase
    .from("accounts_payable")
    .select("*")
    .eq("school_id", context.schoolId)

  if (filters?.status) {
    query = query.eq("status", filters.status)
  }

  if (filters?.vendorName) {
    query = query.ilike("vendor_name", `%${filters.vendorName}%`)
  }

  // Update status to overdue if due date has passed
  const today = new Date().toISOString().split("T")[0]
  query = query.order("due_date", { ascending: true })

  const { data: payables, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  // Update overdue status
  const payablesList = payables || []
  for (const payable of payablesList) {
    const payableData = payable as any
    if (payableData.status !== "paid" && payableData.due_date < today) {
      await supabase
        .from("accounts_payable")
        // @ts-ignore - Supabase strict type checking
        .update({ status: "overdue", updated_at: new Date().toISOString() })
        .eq("id", payableData.id)
    }
  }

  // Re-fetch to get updated statuses
  const { data: updatedPayables } = await query
  return updatedPayables || []
}

export async function createAccountsPayable(formData: FormData) {
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

  const apData: any = {
    school_id: context.schoolId,
    vendor_name: formData.get("vendor_name") as string,
    invoice_number: formData.get("invoice_number") as string || null,
    description: formData.get("description") as string,
    amount: parseFloat(formData.get("amount") as string),
    due_date: formData.get("due_date") as string,
    created_by: user.id,
  }

  const expenseId = formData.get("expense_id") as string
  if (expenseId && expenseId !== "null") {
    apData.expense_id = expenseId
  }

  const { data: ap, error } = await supabase
    .from("accounts_payable")
    // @ts-ignore - Supabase strict type checking
    .insert(apData)
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath("/dashboard/accountant/finance/accounts-payable")
  return ap
}

export async function payAccountsPayable(apId: string, formData: FormData) {
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

  // Get AP record
  const { data: ap } = await supabase
    .from("accounts_payable")
    .select("*")
    .eq("id", apId)
    .eq("school_id", context.schoolId)
    .single()

  if (!ap) {
    throw new Error("Accounts payable record not found")
  }

  const apData = ap as any
  const paymentAmount = parseFloat(formData.get("amount") as string)
  const newPaidAmount = Number(apData.paid_amount || 0) + paymentAmount
  const totalAmount = Number(apData.amount)

  if (newPaidAmount > totalAmount) {
    throw new Error("Payment amount exceeds total amount")
  }

  let newStatus = "unpaid"
  if (newPaidAmount >= totalAmount) {
    newStatus = "paid"
  } else if (newPaidAmount > 0) {
    newStatus = "partial"
  }

  // Update AP record
  await supabase
    .from("accounts_payable")
    // @ts-ignore - Supabase strict type checking
    .update({
      paid_amount: newPaidAmount,
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", apId)

  // If linked to expense, record payment
  if (apData.expense_id) {
    // @ts-ignore - expense_payments table may not be in generated types
    await supabase.from("expense_payments").insert({
      expense_id: apData.expense_id,
      amount: paymentAmount,
      payment_method: formData.get("payment_method") as string,
      payment_date: formData.get("payment_date") as string || new Date().toISOString().split("T")[0],
      transaction_ref: formData.get("transaction_ref") as string || null,
      notes: formData.get("notes") as string || null,
      created_by: user.id,
    })

    // Update expense payment status
    const { data: expense } = await supabase
      .from("expenses")
      .select("amount, account_id")
      .eq("id", apData.expense_id)
      .single()

    if (expense) {
      const { data: expensePayments } = await supabase
        .from("expense_payments")
        .select("amount")
        .eq("expense_id", apData.expense_id)

      const totalExpensePaid = expensePayments?.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0) || 0
      const expenseAmount = Number((expense as any).amount)
      
      let expenseStatus = "unpaid"
      if (totalExpensePaid >= expenseAmount) {
        expenseStatus = "paid"
      } else if (totalExpensePaid > 0) {
        expenseStatus = "partial"
      }

      await supabase
        .from("expenses")
        // @ts-ignore - Supabase strict type checking
        .update({ payment_status: expenseStatus, updated_at: new Date().toISOString() })
        .eq("id", apData.expense_id)

      // Create GL entry
      if ((expense as any).account_id) {
        const paymentMethod = formData.get("payment_method") as string
        let creditAccountCode = "1000" // Cash
        if (paymentMethod && paymentMethod !== "cash" && paymentMethod !== "other") {
          creditAccountCode = "1100" // Bank
        }

        // @ts-ignore - chart_of_accounts table may not be in generated types
        const { data: creditAccount } = await supabase
          .from("chart_of_accounts")
          .select("id")
          .eq("school_id", context.schoolId)
          .eq("account_code", creditAccountCode)
          .single()

        // @ts-ignore - chart_of_accounts table may not be in generated types
        const { data: apAccount } = await supabase
          .from("chart_of_accounts")
          .select("id")
          .eq("school_id", context.schoolId)
          .eq("account_code", "2000")
          .single()

        if ((creditAccount as any)?.id && (apAccount as any)?.id) {
          // DR Accounts Payable
          // @ts-ignore - RPC function may not be in generated types
          await supabase.rpc("create_gl_entry", {
            p_school_id: context.schoolId,
            p_account_id: (apAccount as any).id,
            p_transaction_date: formData.get("payment_date") as string || new Date().toISOString().split("T")[0],
            p_transaction_type: "expense",
            p_reference_id: apId,
            p_reference_type: "expense",
            p_description: `Payment to ${apData.vendor_name}`,
            p_debit_amount: paymentAmount,
            p_credit_amount: 0,
            p_created_by: user.id,
          })

          // CR Cash/Bank
          // @ts-ignore - RPC function may not be in generated types
          await supabase.rpc("create_gl_entry", {
            p_school_id: context.schoolId,
            p_account_id: (creditAccount as any).id,
            p_transaction_date: formData.get("payment_date") as string || new Date().toISOString().split("T")[0],
            p_transaction_type: "expense",
            p_reference_id: apId,
            p_reference_type: "expense",
            p_description: `Payment to ${apData.vendor_name}`,
            p_debit_amount: 0,
            p_credit_amount: paymentAmount,
            p_created_by: user.id,
          })
        }
      }
    }
  }

  revalidatePath("/dashboard/accountant/finance/accounts-payable")
  revalidatePath("/dashboard/accountant/finance/expenses")
  return { success: true }
}

