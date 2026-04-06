"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

export async function recordExpense(formData: FormData) {
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

  const categoryId = formData.get("category_id") as string
  if (!categoryId) {
    throw new Error("Category is required")
  }

  // Get category and its account
  // @ts-ignore - expense_categories table may not be in generated types
  const { data: category } = await supabase
    .from("expense_categories")
    .select("account_id")
    .eq("id", categoryId)
    .single()

  const expenseData: any = {
    school_id: context.schoolId,
    category_id: categoryId,
    vendor_name: formData.get("vendor_name") as string || null,
    description: formData.get("description") as string,
    amount: parseFloat(formData.get("amount") as string),
    expense_date: formData.get("expense_date") as string || new Date().toISOString().split("T")[0],
    payment_method: formData.get("payment_method") as string || null,
    payment_status: formData.get("payment_status") as string || "unpaid",
    approval_status: "pending",
    invoice_number: formData.get("invoice_number") as string || null,
    receipt_url: formData.get("receipt_url") as string || null,
    created_by: user.id,
  }

  if ((category as any)?.account_id) {
    expenseData.account_id = (category as any).account_id
  }

  const { data: expense, error } = await supabase
    .from("expenses")
    // @ts-ignore - Supabase strict type checking
    .insert(expenseData)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to record expense: ${error.message}`)
  }

  // Create GL entry if account exists and payment status is paid
  if ((category as any)?.account_id && expenseData.payment_status === "paid") {
    // Get cash/AP account based on payment method
    let creditAccountCode = "2000" // Default: Accounts Payable
    if (expenseData.payment_method === "cash") {
      creditAccountCode = "1000" // Cash
    } else if (expenseData.payment_method && expenseData.payment_method !== "other") {
      creditAccountCode = "1100" // Bank
    }

    // @ts-ignore - chart_of_accounts table may not be in generated types
    const { data: creditAccount } = await supabase
      .from("chart_of_accounts")
      .select("id")
      .eq("school_id", context.schoolId)
      .eq("account_code", creditAccountCode)
      .single()

    if ((creditAccount as any)?.id) {
      // DR Expense
      // @ts-ignore - RPC function may not be in generated types
      await supabase.rpc("create_gl_entry", {
        p_school_id: context.schoolId,
        p_account_id: (category as any).account_id,
        p_transaction_date: expenseData.expense_date,
        p_transaction_type: "expense",
        p_reference_id: (expense as any).id,
        p_reference_type: "expense",
        p_description: expenseData.description,
        p_debit_amount: expenseData.amount,
        p_credit_amount: 0,
        p_created_by: user.id,
      })

      // CR Cash/AP
      // @ts-ignore - RPC function may not be in generated types
      await supabase.rpc("create_gl_entry", {
        p_school_id: context.schoolId,
        p_account_id: (creditAccount as any).id,
        p_transaction_date: expenseData.expense_date,
        p_transaction_type: "expense",
        p_reference_id: (expense as any).id,
        p_reference_type: "expense",
        p_description: expenseData.description,
        p_debit_amount: 0,
        p_credit_amount: expenseData.amount,
        p_created_by: user.id,
      })
    }
  } else if ((category as any)?.account_id && expenseData.payment_status === "unpaid") {
    // Create AP entry
    // @ts-ignore - chart_of_accounts table may not be in generated types
    const { data: apAccount } = await supabase
      .from("chart_of_accounts")
      .select("id")
      .eq("school_id", context.schoolId)
      .eq("account_code", "2000")
      .single()

    if ((apAccount as any)?.id) {
      // DR Expense
      // @ts-ignore - RPC function may not be in generated types
      await supabase.rpc("create_gl_entry", {
        p_school_id: context.schoolId,
        p_account_id: (category as any).account_id,
        p_transaction_date: expenseData.expense_date,
        p_transaction_type: "expense",
        p_reference_id: (expense as any).id,
        p_reference_type: "expense",
        p_description: expenseData.description,
        p_debit_amount: expenseData.amount,
        p_credit_amount: 0,
        p_created_by: user.id,
      })

      // CR Accounts Payable
      // @ts-ignore - RPC function may not be in generated types
      await supabase.rpc("create_gl_entry", {
        p_school_id: context.schoolId,
        p_account_id: (apAccount as any).id,
        p_transaction_date: expenseData.expense_date,
        p_transaction_type: "expense",
        p_reference_id: (expense as any).id,
        p_reference_type: "expense",
        p_description: expenseData.description,
        p_debit_amount: 0,
        p_credit_amount: expenseData.amount,
        p_created_by: user.id,
      })

      // Create AP record
      // @ts-ignore - accounts_payable table may not be in generated types
      await supabase.from("accounts_payable").insert({
        school_id: context.schoolId,
        vendor_name: expenseData.vendor_name || "Unknown",
        invoice_number: expenseData.invoice_number,
        description: expenseData.description,
        amount: expenseData.amount,
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0], // 30 days from now
        expense_id: (expense as any).id,
        created_by: user.id,
      })
    }
  }

  revalidatePath("/dashboard/accountant/finance/expenses")
  revalidatePath("/dashboard/accountant/finance")
  return expense
}

export async function getExpenses(filters?: {
  startDate?: string
  endDate?: string
  categoryId?: string
  paymentStatus?: string
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
    .from("expenses")
    // @ts-ignore - expenses table may not be in generated types
    .select(`*`)
    .eq("school_id", context.schoolId)

  if (filters?.startDate) {
    query = query.gte("expense_date", filters.startDate)
  }

  if (filters?.endDate) {
    query = query.lte("expense_date", filters.endDate)
  }

  if (filters?.categoryId) {
    query = query.eq("category_id", filters.categoryId)
  }

  if (filters?.paymentStatus) {
    query = query.eq("payment_status", filters.paymentStatus)
  }

  query = query.order("expense_date", { ascending: false })

  const { data: expenses, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  if (!expenses || expenses.length === 0) {
    return []
  }

  // Get paid amounts for all expenses
  const expenseIds = expenses.map((e: any) => e.id)
  const { data: payments } = await supabase
    .from("expense_payments")
    .select("expense_id, amount")
    .in("expense_id", expenseIds)

  // Calculate paid amount for each expense
  const expensesWithPaidAmount = expenses.map((expense: any) => {
    const paidAmount = payments
      ?.filter((p: any) => p.expense_id === expense.id)
      .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0) || 0

    return {
      ...expense,
      paid_amount: paidAmount,
    }
  })

  return expensesWithPaidAmount
}

export async function recordExpensePayment(expenseId: string, formData: FormData) {
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

  // Verify expense belongs to user's school
  const { data: expense } = await supabase
    .from("expenses")
    .select("school_id, amount, payment_status, account_id, approval_status")
    .eq("id", expenseId)
    .single()

  if (!expense || (expense as any).school_id !== context.schoolId) {
    throw new Error("Expense not found or access denied")
  }

  if ((expense as any).approval_status && (expense as any).approval_status !== "approved") {
    throw new Error("Expense must be approved before recording payment")
  }

  const paymentAmount = parseFloat(formData.get("amount") as string)
  const expenseAmount = Number((expense as any).amount)
  
  // Get existing payments
  const { data: existingPayments } = await supabase
    .from("expense_payments")
    .select("amount")
    .eq("expense_id", expenseId)

  const totalPaid = existingPayments?.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0) || 0
  const newTotal = totalPaid + paymentAmount

  if (newTotal > expenseAmount) {
    throw new Error("Payment amount exceeds expense total")
  }

  // Record payment
  const { data: payment, error: paymentError } = await supabase
    .from("expense_payments")
    // @ts-ignore - Supabase strict type checking
    .insert({
      expense_id: expenseId,
      amount: paymentAmount,
      payment_method: formData.get("payment_method") as string,
      payment_date: formData.get("payment_date") as string || new Date().toISOString().split("T")[0],
      transaction_ref: formData.get("transaction_ref") as string || null,
      notes: formData.get("notes") as string || null,
      created_by: user.id,
    })
    .select()
    .single()

  if (paymentError) {
    throw new Error(`Failed to record payment: ${paymentError.message}`)
  }

  // Update expense payment status
  let newStatus = "unpaid"
  if (newTotal >= expenseAmount) {
    newStatus = "paid"
  } else if (newTotal > 0) {
    newStatus = "partial"
  }

  await supabase
    .from("expenses")
    // @ts-ignore - Supabase strict type checking
    .update({ payment_status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", expenseId)

  // Create GL entry if expense account exists
  if ((expense as any).account_id) {
    const paymentMethod = formData.get("payment_method") as string
    let creditAccountCode = "1000" // Cash
    if (paymentMethod && paymentMethod !== "cash" && paymentMethod !== "other") {
      creditAccountCode = "1100" // Bank
    }

    const { data: creditAccount } = await supabase
      .from("chart_of_accounts")
      .select("id")
      .eq("school_id", context.schoolId)
      .eq("account_code", creditAccountCode)
      .single()

    if ((creditAccount as any)?.id) {
      // DR Expense (already done when expense was created)
      // CR Cash/Bank
      // @ts-ignore - RPC function may not be in generated types
      await supabase.rpc("create_gl_entry", {
        p_school_id: context.schoolId,
        p_account_id: (creditAccount as any).id,
        p_transaction_date: formData.get("payment_date") as string || new Date().toISOString().split("T")[0],
        p_transaction_type: "expense",
        p_reference_id: expenseId,
        p_reference_type: "expense",
        p_description: `Payment for expense - ${paymentMethod}`,
        p_debit_amount: 0,
        p_credit_amount: paymentAmount,
        p_created_by: user.id,
      })

      // DR Accounts Payable (if it was unpaid)
      if ((expense as any).payment_status === "unpaid") {
        // @ts-ignore - chart_of_accounts table may not be in generated types
        const { data: apAccount } = await supabase
          .from("chart_of_accounts")
          .select("id")
          .eq("school_id", context.schoolId)
          .eq("account_code", "2000")
          .single()

        if ((apAccount as any)?.id) {
          // @ts-ignore - RPC function may not be in generated types
          await supabase.rpc("create_gl_entry", {
            p_school_id: context.schoolId,
            p_account_id: (apAccount as any).id,
            p_transaction_date: formData.get("payment_date") as string || new Date().toISOString().split("T")[0],
            p_transaction_type: "expense",
            p_reference_id: expenseId,
            p_reference_type: "expense",
            p_description: `Payment for expense - ${paymentMethod}`,
            p_debit_amount: paymentAmount,
            p_credit_amount: 0,
            p_created_by: user.id,
          })
        }
      }
    }
  }

  revalidatePath("/dashboard/accountant/finance/expenses")
  return payment
}

export async function approveExpense(expenseId: string, comments?: string) {
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

  const { data: expense } = await supabase
    .from("expenses")
    .select("id, school_id")
    .eq("id", expenseId)
    .single()

  if (!expense || (expense as any).school_id !== context.schoolId) {
    throw new Error("Expense not found or access denied")
  }

  const { error: updateError } = await supabase
    .from("expenses")
    // @ts-ignore - Supabase strict type checking
    .update({
      approval_status: "approved",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", expenseId)

  if (updateError) {
    throw new Error(updateError.message)
  }

  await supabase
    .from("expense_approvals")
    // @ts-ignore - Supabase strict type checking
    .insert({
      expense_id: expenseId,
      approver_id: user.id,
      status: "approved",
      comments: comments || null,
    })

  revalidatePath("/dashboard/accountant/finance/expenses")
  return { success: true }
}

export async function rejectExpense(expenseId: string, comments?: string) {
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

  const { data: expense } = await supabase
    .from("expenses")
    .select("id, school_id")
    .eq("id", expenseId)
    .single()

  if (!expense || (expense as any).school_id !== context.schoolId) {
    throw new Error("Expense not found or access denied")
  }

  const { error: updateError } = await supabase
    .from("expenses")
    // @ts-ignore - Supabase strict type checking
    .update({
      approval_status: "rejected",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", expenseId)

  if (updateError) {
    throw new Error(updateError.message)
  }

  await supabase
    .from("expense_approvals")
    // @ts-ignore - Supabase strict type checking
    .insert({
      expense_id: expenseId,
      approver_id: user.id,
      status: "rejected",
      comments: comments || null,
    })

  revalidatePath("/dashboard/accountant/finance/expenses")
  return { success: true }
}

