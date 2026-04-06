"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

export async function createBankAccount(formData: FormData) {
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

  // Get bank account asset account (1100)
  // @ts-ignore - chart_of_accounts table may not be in generated types
  const { data: bankAccountAsset } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("school_id", context.schoolId)
    .eq("account_code", "1100")
    .single()

  const accountData: any = {
    school_id: context.schoolId,
    account_name: formData.get("account_name") as string,
    account_number: formData.get("account_number") as string,
    bank_name: formData.get("bank_name") as string,
    account_type: formData.get("account_type") as string || null,
    opening_balance: parseFloat(formData.get("opening_balance") as string) || 0,
    current_balance: parseFloat(formData.get("opening_balance") as string) || 0,
    account_id: (bankAccountAsset as any)?.id || null,
    is_active: true,
  }

  const { data: account, error } = await supabase
    .from("bank_accounts")
    // @ts-ignore - Supabase strict type checking
    .insert(accountData)
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath("/dashboard/accountant/finance/banking")
  return account
}

export async function getBankAccounts() {
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

  const { data: accounts, error } = await supabase
    .from("bank_accounts")
    .select(`
      *,
      chart_of_accounts(account_code, account_name)
    `)
    .eq("school_id", context.schoolId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return accounts || []
}

export async function updateBankAccount(accountId: string, formData: FormData) {
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
  const { data: existing, error: existingError } = await supabase
    .from("bank_accounts")
    .select("school_id")
    .eq("id", accountId)
    .single()

  if (existingError || !existing || (existing as any).school_id !== context.schoolId) {
    throw new Error("Bank account not found or access denied")
  }

  const updateData: any = {
    account_name: formData.get("account_name") as string,
    account_number: formData.get("account_number") as string,
    bank_name: formData.get("bank_name") as string,
    account_type: formData.get("account_type") as string || null,
    updated_at: new Date().toISOString(),
  }

  const { data: account, error } = await supabase
    .from("bank_accounts")
    // @ts-ignore - Supabase strict type checking
    .update(updateData)
    .eq("id", accountId)
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath("/dashboard/accountant/finance/banking")
  return account
}

export async function deleteBankAccount(accountId: string) {
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
  const { data: existing, error: existingError } = await supabase
    .from("bank_accounts")
    .select("school_id")
    .eq("id", accountId)
    .single()

  if (existingError || !existing || (existing as any).school_id !== context.schoolId) {
    throw new Error("Bank account not found or access denied")
  }

  // Soft delete
  const { error } = await supabase
    .from("bank_accounts")
    // @ts-ignore - Supabase strict type checking
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", accountId)

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath("/dashboard/accountant/finance/banking")
  return { success: true }
}

