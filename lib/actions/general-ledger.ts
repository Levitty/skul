"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"

export async function getGeneralLedger(filters?: {
  accountId?: string
  startDate?: string
  endDate?: string
  transactionType?: string
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
    .from("general_ledger")
    .select(`
      *,
      chart_of_accounts(account_code, account_name, account_type)
    `)
    .eq("school_id", context.schoolId)

  if (filters?.accountId) {
    query = query.eq("account_id", filters.accountId)
  }

  if (filters?.startDate) {
    query = query.gte("transaction_date", filters.startDate)
  }

  if (filters?.endDate) {
    query = query.lte("transaction_date", filters.endDate)
  }

  if (filters?.transactionType) {
    query = query.eq("transaction_type", filters.transactionType)
  }

  query = query.order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })

  const { data: entries, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return entries || []
}

export async function getAccountBalance(accountId: string) {
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

  // Verify account belongs to user's school
  const { data: account } = await supabase
    .from("chart_of_accounts")
    .select("school_id")
    .eq("id", accountId)
    .single()

  if (!account || (account as any).school_id !== context.schoolId) {
    throw new Error("Account not found or access denied")
  }

  // Get latest balance from GL
  const { data: latestEntry } = await supabase
    .from("general_ledger")
    .select("balance")
    .eq("account_id", accountId)
    .eq("school_id", context.schoolId)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  return latestEntry ? Number((latestEntry as any).balance) : 0
}

export async function getTrialBalance(startDate?: string, endDate?: string) {
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
    .from("general_ledger")
    .select(`
      account_id,
      chart_of_accounts(account_code, account_name, account_type)
    `)
    .eq("school_id", context.schoolId)

  if (startDate) {
    query = query.gte("transaction_date", startDate)
  }

  if (endDate) {
    query = query.lte("transaction_date", endDate)
  }

  const { data: entries, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  // Group by account and calculate totals
  const trialBalance: Record<string, any> = {}
  
  entries?.forEach((entry: any) => {
    const accountId = entry.account_id
    if (!trialBalance[accountId]) {
      trialBalance[accountId] = {
        account_id: accountId,
        account_code: entry.chart_of_accounts?.account_code,
        account_name: entry.chart_of_accounts?.account_name,
        account_type: entry.chart_of_accounts?.account_type,
        debit_total: 0,
        credit_total: 0,
      }
    }
    
    const debit = Number(entry.debit_amount) || 0
    const credit = Number(entry.credit_amount) || 0
    trialBalance[accountId].debit_total += debit
    trialBalance[accountId].credit_total += credit
  })

  return Object.values(trialBalance)
}



