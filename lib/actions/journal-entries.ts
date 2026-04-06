"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

export async function createJournalEntry(data: {
  description: string
  entry_date: string
  lines: Array<{
    account_id: string
    debit_amount: number
    credit_amount: number
    description?: string
  }>
}) {
  const supabase = await createClient() as any
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Not authenticated")
  }

  const context = await requireTenantContext(user.id)

  // Validate: at least 2 lines
  if (!data.lines || data.lines.length < 2) {
    throw new Error("Journal entry must have at least 2 lines")
  }

  // Validate: total debits must equal total credits
  const totalDebits = data.lines.reduce((sum, line) => sum + (line.debit_amount || 0), 0)
  const totalCredits = data.lines.reduce((sum, line) => sum + (line.credit_amount || 0), 0)
  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    throw new Error("Total debits must equal total credits")
  }

  // Validate each line has debit XOR credit
  for (const line of data.lines) {
    const hasDebit = (line.debit_amount || 0) > 0
    const hasCredit = (line.credit_amount || 0) > 0
    if (!(hasDebit !== hasCredit)) {
      throw new Error("Each line must have either debit or credit, not both or neither")
    }
  }

  // Verify all accounts belong to school
  for (const line of data.lines) {
    const { data: account } = await supabase
      .from("chart_of_accounts")
      .select("id")
      .eq("id", line.account_id)
      .eq("school_id", context.schoolId)
      .single()
    if (!account) {
      throw new Error(`Account ${line.account_id} not found or access denied`)
    }
  }

  const entryNumber = `JE-${Date.now().toString(36).toUpperCase()}`

  const entryData = {
    school_id: context.schoolId,
    entry_number: entryNumber,
    description: data.description,
    entry_date: data.entry_date,
    created_by: user.id,
  }

  // @ts-ignore - Supabase strict type checking
  const { data: journalEntry, error: entryError } = await supabase
    .from("journal_entries")
    .insert(entryData)
    .select("id")
    .single()

  if (entryError) {
    throw new Error(entryError.message)
  }

  const journalEntryId = (journalEntry as any).id

  for (const line of data.lines) {
    const lineData = {
      journal_entry_id: journalEntryId,
      account_id: line.account_id,
      debit_amount: line.debit_amount || 0,
      credit_amount: line.credit_amount || 0,
      description: line.description || null,
    }
    // @ts-ignore - Supabase strict type checking
    const { error: lineError } = await supabase
      .from("journal_entry_lines")
      .insert(lineData)

    if (lineError) {
      throw new Error(`Failed to insert journal line: ${lineError.message}`)
    }

    // Create GL entry - try RPC first, fallback to direct insert
    const glDescription = line.description || data.description
    const transactionType = "journal"

    const { error: glRpcError } = await supabase.rpc("create_gl_entry", {
      p_school_id: context.schoolId,
      p_account_id: line.account_id,
      p_transaction_date: data.entry_date,
      p_transaction_type: transactionType,
      p_reference_id: journalEntryId,
      p_reference_type: "journal_entry",
      p_description: glDescription,
      p_debit_amount: line.debit_amount || 0,
      p_credit_amount: line.credit_amount || 0,
      p_created_by: user.id,
    })

    if (glRpcError) {
      // Fallback: insert directly into general_ledger
      const { data: balanceResult } = await supabase
        .from("general_ledger")
        .select("balance")
        .eq("account_id", line.account_id)
        .eq("school_id", context.schoolId)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .single()

      const prevBalance = balanceResult ? Number((balanceResult as any).balance) : 0
      const newBalance =
        prevBalance + (line.debit_amount || 0) - (line.credit_amount || 0)

      const glData = {
        school_id: context.schoolId,
        account_id: line.account_id,
        transaction_date: data.entry_date,
        transaction_type: transactionType,
        reference_id: journalEntryId,
        reference_type: "journal_entry",
        description: glDescription,
        debit_amount: line.debit_amount || 0,
        credit_amount: line.credit_amount || 0,
        balance: newBalance,
        created_by: user.id,
      }
      // @ts-ignore - Supabase strict type checking
      const { error: glInsertError } = await supabase
        .from("general_ledger")
        .insert(glData)

      if (glInsertError) {
        throw new Error(`Failed to create GL entry: ${glInsertError.message}`)
      }
    }
  }

  revalidatePath("/dashboard/accountant/finance")
  revalidatePath("/dashboard/accountant/finance/general-ledger")
  revalidatePath("/dashboard/accountant/finance/journal-entries")

  return { success: true, entryNumber }
}

export async function createInterAccountTransfer(data: {
  from_account_id: string
  to_account_id: string
  amount: number
  description: string
  transfer_date: string
}) {
  if (!data.amount || data.amount <= 0) {
    throw new Error("Amount must be greater than 0")
  }

  return createJournalEntry({
    description: data.description,
    entry_date: data.transfer_date,
    lines: [
      {
        account_id: data.to_account_id,
        debit_amount: data.amount,
        credit_amount: 0,
        description: data.description,
      },
      {
        account_id: data.from_account_id,
        debit_amount: 0,
        credit_amount: data.amount,
        description: data.description,
      },
    ],
  })
}

export async function getJournalEntries(filters?: {
  from_date?: string
  to_date?: string
}) {
  const supabase = await createClient() as any
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Not authenticated")
  }

  const context = await requireTenantContext(user.id)

  let query = supabase
    .from("journal_entries")
    .select(
      `
      *,
      journal_entry_lines(
        *,
        chart_of_accounts(account_code, account_name)
      )
    `
    )
    .eq("school_id", context.schoolId)

  if (filters?.from_date) {
    query = query.gte("entry_date", filters.from_date)
  }
  if (filters?.to_date) {
    query = query.lte("entry_date", filters.to_date)
  }

  const { data: entries, error } = await query.order("entry_date", {
    ascending: false,
  })

  if (error) {
    throw new Error(error.message)
  }

  return entries || []
}

export async function getJournalEntry(entryId: string) {
  const supabase = await createClient() as any
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Not authenticated")
  }

  const context = await requireTenantContext(user.id)

  const { data: entry, error } = await supabase
    .from("journal_entries")
    .select(
      `
      *,
      journal_entry_lines(
        *,
        chart_of_accounts(account_code, account_name)
      )
    `
    )
    .eq("id", entryId)
    .eq("school_id", context.schoolId)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  if (!entry) {
    throw new Error("Journal entry not found")
  }

  return entry
}
