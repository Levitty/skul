"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

export async function recordBankTransaction(formData: FormData) {
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

  const bankAccountId = formData.get("bank_account_id") as string
  if (!bankAccountId) {
    throw new Error("Bank account is required")
  }

  // Verify bank account belongs to school
  const { data: bankAccount } = await supabase
    .from("bank_accounts")
    .select("school_id, current_balance")
    .eq("id", bankAccountId)
    .single()

  if (!bankAccount || (bankAccount as any).school_id !== context.schoolId) {
    throw new Error("Bank account not found or access denied")
  }

  const transactionType = formData.get("transaction_type") as string
  const amount = parseFloat(formData.get("amount") as string)
  const currentBalance = Number((bankAccount as any).current_balance || 0)
  
  let balanceAfter = currentBalance
  if (transactionType === "deposit") {
    balanceAfter = currentBalance + amount
  } else if (transactionType === "withdrawal" || transactionType === "fee") {
    balanceAfter = currentBalance - amount
  }

  const transactionData: any = {
    bank_account_id: bankAccountId,
    transaction_date: formData.get("transaction_date") as string || new Date().toISOString().split("T")[0],
    transaction_type: transactionType,
    description: formData.get("description") as string,
    amount: amount,
    balance_after: balanceAfter,
    reference_number: formData.get("reference_number") as string || null,
    notes: formData.get("notes") as string || null,
  }

  const { data: transaction, error } = await supabase
    .from("bank_transactions")
    // @ts-ignore - Supabase strict type checking
    .insert(transactionData)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to record transaction: ${error.message}`)
  }

  // Update bank account balance
  await supabase
    .from("bank_accounts")
    // @ts-ignore - Supabase strict type checking
    .update({ current_balance: balanceAfter, updated_at: new Date().toISOString() })
    .eq("id", bankAccountId)

  revalidatePath("/dashboard/accountant/finance/bank-reconciliation")
  return transaction
}

export async function getBankTransactions(bankAccountId: string, filters?: {
  startDate?: string
  endDate?: string
  isReconciled?: boolean
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

  // Verify bank account belongs to school
  const { data: bankAccount } = await supabase
    .from("bank_accounts")
    .select("school_id")
    .eq("id", bankAccountId)
    .single()

  if (!bankAccount || (bankAccount as any).school_id !== context.schoolId) {
    throw new Error("Bank account not found or access denied")
  }

  let query = supabase
    .from("bank_transactions")
    .select(`
      *,
      payments(id, amount, method, transaction_ref, paid_at),
      expenses(id, description, amount),
      other_income(id, description, amount)
    `)
    .eq("bank_account_id", bankAccountId)

  if (filters?.startDate) {
    query = query.gte("transaction_date", filters.startDate)
  }

  if (filters?.endDate) {
    query = query.lte("transaction_date", filters.endDate)
  }

  if (filters?.isReconciled !== undefined) {
    query = query.eq("is_reconciled", filters.isReconciled)
  }

  query = query.order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })

  const { data: transactions, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return transactions || []
}

export async function matchBankTransaction(
  transactionId: string,
  matchType: "payment" | "expense" | "other_income",
  matchId: string
) {
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

  // Get transaction
  const { data: transaction } = await supabase
    .from("bank_transactions")
    .select("*, bank_accounts!inner(school_id)")
    .eq("id", transactionId)
    .single()

  if (!transaction || (transaction as any).bank_accounts.school_id !== context.schoolId) {
    throw new Error("Transaction not found or access denied")
  }

  const updateData: any = {
    is_reconciled: true,
    reconciled_at: new Date().toISOString(),
  }

  if (matchType === "payment") {
    updateData.matched_payment_id = matchId
  } else if (matchType === "expense") {
    updateData.matched_expense_id = matchId
  } else if (matchType === "other_income") {
    updateData.matched_other_income_id = matchId
  }

  const { data: updatedTransaction, error } = await supabase
    .from("bank_transactions")
    // @ts-ignore - Supabase strict type checking
    .update(updateData)
    .eq("id", transactionId)
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath("/dashboard/accountant/finance/bank-reconciliation")
  return updatedTransaction
}

export async function getUnmatchedPayments(bankAccountId: string, startDate?: string, endDate?: string) {
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

  // Get bank account
  const { data: bankAccount } = await supabase
    .from("bank_accounts")
    .select("school_id, account_type")
    .eq("id", bankAccountId)
    .single()

  if (!bankAccount || (bankAccount as any).school_id !== context.schoolId) {
    throw new Error("Bank account not found or access denied")
  }

  // Get payments that haven't been matched
  let paymentsQuery = supabase
    .from("payments")
    .select(`
      *,
      invoices(id, reference, students(first_name, last_name, admission_number))
    `)
    .eq("school_id", context.schoolId)
    .eq("status", "completed")
    .is("bank_account_id", null) // Payments not linked to bank account

  if ((bankAccount as any).account_type === "mpesa" || (bankAccount as any).account_type === "paystack") {
    paymentsQuery = paymentsQuery.in("method", ["mpesa", "paystack"])
  }

  if (startDate) {
    paymentsQuery = paymentsQuery.gte("paid_at", startDate)
  }

  if (endDate) {
    paymentsQuery = paymentsQuery.lte("paid_at", endDate)
  }

  paymentsQuery = paymentsQuery.order("paid_at", { ascending: false })

  const { data: payments, error } = await paymentsQuery

  if (error) {
    throw new Error(error.message)
  }

  // Filter out payments that are already matched
  const { data: matchedTransactions } = await supabase
    .from("bank_transactions")
    .select("matched_payment_id")
    .eq("bank_account_id", bankAccountId)
    .not("matched_payment_id", "is", null)

  const matchedPaymentIds = new Set(
    matchedTransactions?.map((t: any) => t.matched_payment_id) || []
  )

  return (payments || []).filter((p: any) => !matchedPaymentIds.has(p.id))
}

export async function getReconciliationSummary(bankAccountId: string) {
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

  // Get bank account
  const { data: bankAccount } = await supabase
    .from("bank_accounts")
    .select("current_balance, school_id")
    .eq("id", bankAccountId)
    .single()

  if (!bankAccount || (bankAccount as any).school_id !== context.schoolId) {
    throw new Error("Bank account not found or access denied")
  }

  // Get all transactions
  const { data: transactions } = await supabase
    .from("bank_transactions")
    .select("amount, transaction_type, is_reconciled")
    .eq("bank_account_id", bankAccountId)

  const transactionsList = transactions || []
  const reconciledCount = transactionsList.filter((t: any) => t.is_reconciled).length
  const unreconciledCount = transactionsList.length - reconciledCount

  // Calculate statement balance (from transactions)
  const lastTransaction = transactionsList
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
  const statementBalance = lastTransaction ? Number((lastTransaction as any).balance_after) : Number((bankAccount as any).current_balance)

  return {
    bankAccountBalance: Number((bankAccount as any).current_balance),
    statementBalance,
    totalTransactions: transactionsList.length,
    reconciledCount,
    unreconciledCount,
    difference: Number((bankAccount as any).current_balance) - statementBalance,
  }
}

