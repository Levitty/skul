"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

export async function getChartOfAccounts() {
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
    .from("chart_of_accounts")
    .select("*")
    .eq("school_id", context.schoolId)
    .eq("is_active", true)
    .order("account_code", { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return accounts || []
}

export async function createAccount(formData: FormData) {
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

  const accountData = {
    school_id: context.schoolId,
    account_code: formData.get("account_code") as string,
    account_name: formData.get("account_name") as string,
    account_type: formData.get("account_type") as string,
    parent_account_id: formData.get("parent_account_id") || null,
    description: formData.get("description") as string || null,
    is_active: true,
  }

  const { data: account, error } = await supabase
    .from("chart_of_accounts")
    // @ts-ignore - Supabase strict type checking
    .insert(accountData)
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath("/dashboard/accountant/finance/chart-of-accounts")
  return account
}

export async function updateAccount(accountId: string, formData: FormData) {
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
    .from("chart_of_accounts")
    .select("school_id")
    .eq("id", accountId)
    .single()

  if (existingError || !existing || (existing as any).school_id !== context.schoolId) {
    throw new Error("Account not found or access denied")
  }

  const updateData: any = {
    account_code: formData.get("account_code") as string,
    account_name: formData.get("account_name") as string,
    account_type: formData.get("account_type") as string,
    updated_at: new Date().toISOString(),
  }

  const parentAccountId = formData.get("parent_account_id") as string
  if (parentAccountId && parentAccountId !== "null") {
    updateData.parent_account_id = parentAccountId
  } else {
    updateData.parent_account_id = null
  }

  const description = formData.get("description") as string
  if (description) updateData.description = description

  const { data: account, error } = await supabase
    .from("chart_of_accounts")
    // @ts-ignore - Supabase strict type checking
    .update(updateData)
    .eq("id", accountId)
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath("/dashboard/accountant/finance/chart-of-accounts")
  return account
}

export async function deleteAccount(accountId: string) {
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
    .from("chart_of_accounts")
    .select("school_id")
    .eq("id", accountId)
    .single()

  if (existingError || !existing || (existing as any).school_id !== context.schoolId) {
    throw new Error("Account not found or access denied")
  }

  // Soft delete by setting is_active to false
  const { error } = await supabase
    .from("chart_of_accounts")
    // @ts-ignore - Supabase strict type checking
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", accountId)

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath("/dashboard/accountant/finance/chart-of-accounts")
  return { success: true }
}

export async function seedDefaultAccounts() {
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

  // Check if accounts already exist
  const { data: existing } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("school_id", context.schoolId)
    .limit(1)

  if (existing && existing.length > 0) {
    throw new Error("Chart of accounts already exists for this school")
  }

  // Call the database function to seed accounts
  // @ts-ignore - RPC function may not be in generated types
  const { error } = await supabase.rpc("seed_default_chart_of_accounts", {
    p_school_id: context.schoolId,
  })

  if (error) {
    throw new Error(`Failed to seed accounts: ${error.message}`)
  }

  revalidatePath("/dashboard/accountant/finance/chart-of-accounts")
  return { success: true }
}

