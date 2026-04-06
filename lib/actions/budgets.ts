"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

export async function createBudget(formData: FormData) {
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

  const budgetData: any = {
    school_id: context.schoolId,
    budget_name: formData.get("budget_name") as string,
    budget_type: formData.get("budget_type") as string,
    period_start: formData.get("period_start") as string,
    period_end: formData.get("period_end") as string,
    budgeted_amount: parseFloat(formData.get("budgeted_amount") as string),
    notes: formData.get("notes") as string || null,
    created_by: user.id,
  }

  const academicYearId = formData.get("academic_year_id") as string
  if (academicYearId && academicYearId !== "null") {
    budgetData.academic_year_id = academicYearId
  }

  const accountId = formData.get("account_id") as string
  if (accountId && accountId !== "null") {
    budgetData.account_id = accountId
  }

  const categoryId = formData.get("category_id") as string
  if (categoryId && categoryId !== "null") {
    budgetData.category_id = categoryId
  }

  const { data: budget, error } = await supabase
    .from("budgets")
    // @ts-ignore - Supabase strict type checking
    .insert(budgetData)
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath("/dashboard/accountant/finance/budgets")
  return budget
}

export async function getBudgets(filters?: {
  budgetType?: string
  academicYearId?: string
  startDate?: string
  endDate?: string
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
    .from("budgets")
    .select(`
      *,
      chart_of_accounts(account_code, account_name),
      expense_categories(name),
      academic_years(name)
    `)
    .eq("school_id", context.schoolId)

  if (filters?.budgetType) {
    query = query.eq("budget_type", filters.budgetType)
  }

  if (filters?.academicYearId) {
    query = query.eq("academic_year_id", filters.academicYearId)
  }

  if (filters?.startDate) {
    query = query.gte("period_start", filters.startDate)
  }

  if (filters?.endDate) {
    query = query.lte("period_end", filters.endDate)
  }

  query = query.order("period_start", { ascending: false })

  const { data: budgets, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return budgets || []
}

export async function getBudgetVariance(budgetId: string) {
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

  // Get budget
  const { data: budget } = await supabase
    .from("budgets")
    .select("*")
    .eq("id", budgetId)
    .eq("school_id", context.schoolId)
    .single()

  if (!budget) {
    throw new Error("Budget not found")
  }

  const budgetData = budget as any
  let actualAmount = 0

  if (budgetData.budget_type === "revenue") {
    // Calculate actual revenue from GL
    if (budgetData.account_id) {
      const { data: glEntries } = await supabase
        .from("general_ledger")
        .select("credit_amount")
        .eq("account_id", budgetData.account_id)
        .eq("school_id", context.schoolId)
        .gte("transaction_date", budgetData.period_start)
        .lte("transaction_date", budgetData.period_end)

      actualAmount = glEntries?.reduce((sum: number, entry: any) => sum + Number(entry.credit_amount || 0), 0) || 0
    }
  } else if (budgetData.budget_type === "expense") {
    // Calculate actual expenses
    if (budgetData.category_id) {
      const { data: expenses } = await supabase
        .from("expenses")
        .select("amount")
        .eq("category_id", budgetData.category_id)
        .eq("school_id", context.schoolId)
        .gte("expense_date", budgetData.period_start)
        .lte("expense_date", budgetData.period_end)

      actualAmount = expenses?.reduce((sum: number, exp: any) => sum + Number(exp.amount || 0), 0) || 0
    } else if (budgetData.account_id) {
      const { data: glEntries } = await supabase
        .from("general_ledger")
        .select("debit_amount")
        .eq("account_id", budgetData.account_id)
        .eq("school_id", context.schoolId)
        .gte("transaction_date", budgetData.period_start)
        .lte("transaction_date", budgetData.period_end)

      actualAmount = glEntries?.reduce((sum: number, entry: any) => sum + Number(entry.debit_amount || 0), 0) || 0
    }
  }

  const variance = actualAmount - Number(budgetData.budgeted_amount)
  const variancePercent = Number(budgetData.budgeted_amount) > 0 
    ? (variance / Number(budgetData.budgeted_amount)) * 100 
    : 0

  return {
    budget: budgetData,
    budgetedAmount: Number(budgetData.budgeted_amount),
    actualAmount,
    variance,
    variancePercent,
  }
}

export async function updateBudget(budgetId: string, formData: FormData) {
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

  // Verify budget belongs to user's school
  const { data: existing, error: existingError } = await supabase
    .from("budgets")
    .select("school_id")
    .eq("id", budgetId)
    .single()

  if (existingError || !existing || (existing as any).school_id !== context.schoolId) {
    throw new Error("Budget not found or access denied")
  }

  const updateData: any = {
    budget_name: formData.get("budget_name") as string,
    budget_type: formData.get("budget_type") as string,
    period_start: formData.get("period_start") as string,
    period_end: formData.get("period_end") as string,
    budgeted_amount: parseFloat(formData.get("budgeted_amount") as string),
    notes: formData.get("notes") as string || null,
    updated_at: new Date().toISOString(),
  }

  const academicYearId = formData.get("academic_year_id") as string
  if (academicYearId && academicYearId !== "null") {
    updateData.academic_year_id = academicYearId
  } else {
    updateData.academic_year_id = null
  }

  const accountId = formData.get("account_id") as string
  if (accountId && accountId !== "null") {
    updateData.account_id = accountId
  } else {
    updateData.account_id = null
  }

  const categoryId = formData.get("category_id") as string
  if (categoryId && categoryId !== "null") {
    updateData.category_id = categoryId
  } else {
    updateData.category_id = null
  }

  const { data: budget, error } = await supabase
    .from("budgets")
    // @ts-ignore - Supabase strict type checking
    .update(updateData)
    .eq("id", budgetId)
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath("/dashboard/accountant/finance/budgets")
  return budget
}

export async function deleteBudget(budgetId: string) {
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

  // Verify budget belongs to user's school
  const { data: existing, error: existingError } = await supabase
    .from("budgets")
    .select("school_id")
    .eq("id", budgetId)
    .single()

  if (existingError || !existing || (existing as any).school_id !== context.schoolId) {
    throw new Error("Budget not found or access denied")
  }

  const { error } = await supabase
    .from("budgets")
    .delete()
    .eq("id", budgetId)

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath("/dashboard/accountant/finance/budgets")
  return { success: true }
}



