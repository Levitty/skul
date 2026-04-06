"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

export async function recordOtherIncome(formData: FormData) {
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

  // Get revenue account based on income type
  const incomeType = formData.get("income_type") as string
  let accountCode = "4900" // Default: Other Income
  
  switch (incomeType) {
    case "uniform_sale":
      accountCode = "4600"
      break
    case "donation":
      accountCode = "4900"
      break
    case "book_sales":
      accountCode = "4900"
      break
    case "event_revenue":
      accountCode = "4700"
      break
    case "rental_income":
      accountCode = "4900"
      break
    case "interest_income":
      accountCode = "4900"
      break
    case "government_grant":
      accountCode = "4900"
      break
    case "trip_payment":
      accountCode = "4700"
      break
    case "club_fee":
      accountCode = "4800"
      break
  }

  // Get account ID
  // @ts-ignore - chart_of_accounts table may not be in generated types
  const { data: account } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("school_id", context.schoolId)
    .eq("account_code", accountCode)
    .single()

  const incomeData: any = {
    school_id: context.schoolId,
    income_type: incomeType,
    description: formData.get("description") as string,
    amount: parseFloat(formData.get("amount") as string),
    payment_method: formData.get("payment_method") as string,
    transaction_ref: formData.get("transaction_ref") as string || null,
    received_date: formData.get("received_date") as string || new Date().toISOString().split("T")[0],
    account_id: (account as any)?.id || null,
    created_by: user.id,
  }

  const studentId = formData.get("student_id") as string
  if (studentId && studentId !== "null") {
    incomeData.student_id = studentId
  }

  const { data: income, error } = await supabase
    .from("other_income")
    // @ts-ignore - Supabase strict type checking
    .insert(incomeData)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to record income: ${error.message}`)
  }

  // Create GL entry if account exists
  if ((account as any)?.id) {
    // Get cash/bank account
    // @ts-ignore - chart_of_accounts table may not be in generated types
    const { data: cashAccount } = await supabase
      .from("chart_of_accounts")
      .select("id")
      .eq("school_id", context.schoolId)
      .eq("account_code", incomeData.payment_method === "cash" ? "1000" : "1100")
      .single()

    if ((cashAccount as any)?.id) {
      // DR Cash/Bank
      // @ts-ignore - RPC function may not be in generated types
      await supabase.rpc("create_gl_entry", {
        p_school_id: context.schoolId,
        p_account_id: (cashAccount as any).id,
        p_transaction_date: incomeData.received_date,
        p_transaction_type: "other_income",
        p_reference_id: (income as any).id,
        p_reference_type: "other_income",
        p_description: incomeData.description,
        p_debit_amount: incomeData.amount,
        p_credit_amount: 0,
        p_created_by: user.id,
      })

      // CR Revenue
      // @ts-ignore - RPC function may not be in generated types
      await supabase.rpc("create_gl_entry", {
        p_school_id: context.schoolId,
        p_account_id: (account as any).id,
        p_transaction_date: incomeData.received_date,
        p_transaction_type: "other_income",
        p_reference_id: (income as any).id,
        p_reference_type: "other_income",
        p_description: incomeData.description,
        p_debit_amount: 0,
        p_credit_amount: incomeData.amount,
        p_created_by: user.id,
      })
    }
  }

  revalidatePath("/dashboard/accountant/finance/other-income")
  revalidatePath("/dashboard/accountant/finance")
  return income
}

export async function getOtherIncome(filters?: {
  startDate?: string
  endDate?: string
  incomeType?: string
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
    .from("other_income")
    // @ts-ignore - other_income table may not be in generated types
    .select(`*`)
    .eq("school_id", context.schoolId)

  if (filters?.startDate) {
    query = query.gte("received_date", filters.startDate)
  }

  if (filters?.endDate) {
    query = query.lte("received_date", filters.endDate)
  }

  if (filters?.incomeType) {
    query = query.eq("income_type", filters.incomeType)
  }

  query = query.order("received_date", { ascending: false })

  const { data: income, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return income || []
}

export async function updateOtherIncome(incomeId: string, formData: FormData) {
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

  // Verify income belongs to user's school
  const { data: existing } = await supabase
    .from("other_income")
    .select("school_id")
    .eq("id", incomeId)
    .single()

  if (!existing || (existing as any).school_id !== context.schoolId) {
    throw new Error("Income record not found or access denied")
  }

  const updateData: any = {
    description: formData.get("description") as string,
    amount: parseFloat(formData.get("amount") as string),
    payment_method: formData.get("payment_method") as string || "cash",
    transaction_ref: formData.get("transaction_ref") as string || null,
    received_date: formData.get("received_date") as string,
    updated_at: new Date().toISOString(),
  }

  const { data: updated, error } = await supabase
    .from("other_income")
    // @ts-ignore - Supabase strict type checking
    .update(updateData)
    .eq("id", incomeId)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update income: ${error.message}`)
  }

  revalidatePath("/dashboard/accountant/finance/other-income")
  revalidatePath("/dashboard/accountant/finance")
  return updated
}

export async function deleteOtherIncome(incomeId: string) {
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

  // Verify income belongs to user's school
  const { data: existing, error: existingError } = await supabase
    .from("other_income")
    .select("school_id")
    .eq("id", incomeId)
    .single()

  if (existingError || !existing || (existing as any).school_id !== context.schoolId) {
    throw new Error("Income record not found or access denied")
  }

  const { error } = await supabase
    .from("other_income")
    .delete()
    .eq("id", incomeId)

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath("/dashboard/accountant/finance/other-income")
  revalidatePath("/dashboard/accountant/finance")
  return { success: true }
}

