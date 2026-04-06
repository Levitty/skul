"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

export async function getExpenseCategories() {
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

  const { data: categories, error } = await supabase
    .from("expense_categories")
    .select(`
      *,
      chart_of_accounts(account_code, account_name)
    `)
    .eq("school_id", context.schoolId)
    .eq("is_active", true)
    .order("name", { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return categories || []
}

export async function createExpenseCategory(formData: FormData) {
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

  const categoryData: any = {
    school_id: context.schoolId,
    name: formData.get("name") as string,
    code: formData.get("code") as string || null,
    description: formData.get("description") as string || null,
    is_active: true,
  }

  const accountId = formData.get("account_id") as string
  if (accountId && accountId !== "null") {
    categoryData.account_id = accountId
  }

  const parentCategoryId = formData.get("parent_category_id") as string
  if (parentCategoryId && parentCategoryId !== "null") {
    categoryData.parent_category_id = parentCategoryId
  }

  const { data: category, error } = await supabase
    .from("expense_categories")
    // @ts-ignore - Supabase strict type checking
    .insert(categoryData)
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath("/dashboard/accountant/finance/expenses/categories")
  return category
}

export async function updateExpenseCategory(categoryId: string, formData: FormData) {
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

  // Verify category belongs to user's school
  const { data: existing, error: existingError } = await supabase
    .from("expense_categories")
    .select("school_id")
    .eq("id", categoryId)
    .single()

  if (existingError || !existing || (existing as any).school_id !== context.schoolId) {
    throw new Error("Category not found or access denied")
  }

  const updateData: any = {
    name: formData.get("name") as string,
    code: formData.get("code") as string || null,
    description: formData.get("description") as string || null,
    updated_at: new Date().toISOString(),
  }

  const accountId = formData.get("account_id") as string
  if (accountId && accountId !== "null") {
    updateData.account_id = accountId
  } else {
    updateData.account_id = null
  }

  const parentCategoryId = formData.get("parent_category_id") as string
  if (parentCategoryId && parentCategoryId !== "null") {
    updateData.parent_category_id = parentCategoryId
  } else {
    updateData.parent_category_id = null
  }

  const { data: category, error } = await supabase
    .from("expense_categories")
    // @ts-ignore - Supabase strict type checking
    .update(updateData)
    .eq("id", categoryId)
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath("/dashboard/accountant/finance/expenses/categories")
  return category
}

export async function deleteExpenseCategory(categoryId: string) {
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

  // Verify category belongs to user's school
  const { data: existing, error: existingError } = await supabase
    .from("expense_categories")
    .select("school_id")
    .eq("id", categoryId)
    .single()

  if (existingError || !existing || (existing as any).school_id !== context.schoolId) {
    throw new Error("Category not found or access denied")
  }

  // Soft delete
  const { error } = await supabase
    .from("expense_categories")
    // @ts-ignore - Supabase strict type checking
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", categoryId)

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath("/dashboard/accountant/finance/expenses/categories")
  return { success: true }
}



