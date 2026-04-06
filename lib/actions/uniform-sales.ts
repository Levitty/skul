"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

export interface SaleItemData {
  variant_id: string
  quantity: number
  unit_price: number
}

export interface SaleData {
  student_id?: string | null
  customer_name?: string
  customer_phone?: string
  items: SaleItemData[]
  payment_method: string
  transaction_ref?: string
  sale_date?: string
  notes?: string
  branch_id?: string | null
}

/**
 * Create a new sale
 */
export async function createSale(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error("Not authenticated")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    throw new Error("No school context")
  }

  // Parse sale items from form data
  const itemsJson = formData.get("items") as string
  const items: SaleItemData[] = JSON.parse(itemsJson || "[]")

  if (items.length === 0) {
    throw new Error("Sale must have at least one item")
  }

  // Validate stock availability
  for (const item of items) {
    const { data: variant } = await supabase
      .from("uniform_variants")
      .select("stock_quantity, uniform_products!inner(school_id)")
      .eq("id", item.variant_id)
      .eq("uniform_products.school_id", context.schoolId)
      .single()

    if (!variant) {
      throw new Error(`Variant ${item.variant_id} not found`)
    }

    if ((variant as any).stock_quantity < item.quantity) {
      throw new Error(`Insufficient stock for variant ${item.variant_id}`)
    }
  }

  // Calculate total amount
  const totalAmount = items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0)

  // Generate sale number
  let saleNumber: string
  try {
    // @ts-ignore
    const { data: saleNumberData, error: rpcError } = await supabase.rpc("generate_sale_number", {
      p_school_id: context.schoolId,
    })
    
    if (rpcError || !saleNumberData) {
      // Fallback if RPC fails
      const dateStr = new Date().toISOString().split("T")[0].replace(/-/g, "")
      const seq = Date.now().toString().slice(-4)
      saleNumber = `SALE-${dateStr}-${seq}`
    } else {
      saleNumber = saleNumberData
    }
  } catch (error) {
    // Fallback if RPC fails
    const dateStr = new Date().toISOString().split("T")[0].replace(/-/g, "")
    const seq = Date.now().toString().slice(-4)
    saleNumber = `SALE-${dateStr}-${seq}`
  }

  // Create sale
  const saleData: any = {
    school_id: context.schoolId,
    branch_id: formData.get("branch_id") as string || null,
    sale_number: saleNumber,
    student_id: formData.get("student_id") as string || null,
    customer_name: formData.get("customer_name") as string || null,
    customer_phone: formData.get("customer_phone") as string || null,
    total_amount: totalAmount,
    payment_method: formData.get("payment_method") as string,
    transaction_ref: formData.get("transaction_ref") as string || null,
    sale_date: formData.get("sale_date") as string || new Date().toISOString().split("T")[0],
    sold_by: user.id,
    notes: formData.get("notes") as string || null,
  }

  const { data: sale, error: saleError } = await supabase
    .from("uniform_sales")
    .insert(saleData)
    .select()
    .single()

  if (saleError) {
    if (saleError.message.toLowerCase().includes("chart_of_accounts")) {
      throw new Error(
        "Finance tables missing (chart_of_accounts). Please apply migration 017_fix_uniform_sale_other_income.sql or the finance module migration before recording sales."
      )
    }
    throw new Error(`Failed to create sale: ${saleError.message}`)
  }

  // Create sale items (this will trigger stock update)
  const saleItems = items.map(item => ({
    sale_id: (sale as any).id,
    variant_id: item.variant_id,
    quantity: item.quantity,
    unit_price: item.unit_price,
    total_price: item.unit_price * item.quantity,
  }))

  const { error: itemsError } = await (supabase as any)
    .from("uniform_sale_items")
    .insert(saleItems)

  if (itemsError) {
    // Rollback sale
    await supabase.from("uniform_sales").delete().eq("id", (sale as any).id)
    throw new Error(`Failed to create sale items: ${itemsError.message}`)
  }

  revalidatePath("/dashboard/store/sales")
  revalidatePath("/dashboard/store/sales/history")
  revalidatePath("/dashboard/accountant/finance")

  // Send WhatsApp receipt if enabled
  if (process.env.WHATSAPP_PAYMENT_RECEIPTS_ENABLED === "true") {
    try {
      const { sendUniformSaleReceipt } = await import("@/lib/services/whatsapp-notifications")
      await sendUniformSaleReceipt((sale as any).id, context.schoolId)
    } catch (error) {
      // Don't fail sale if WhatsApp fails
      console.error("Failed to send WhatsApp receipt:", error)
    }
  }
  
  return { data: sale, error: null }
}

/**
 * Get all sales with filters
 */
export async function getSales(filters?: {
  start_date?: string
  end_date?: string
  student_id?: string
  branch_id?: string | null
  limit?: number
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error("Not authenticated")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    throw new Error("No school context")
  }

  let query = supabase
    .from("uniform_sales")
    .select(`
      *,
      students(id, first_name, last_name, admission_number),
      profiles:sold_by(id, full_name)
    `)
    .eq("school_id", context.schoolId)
    .order("sale_date", { ascending: false })
    .order("created_at", { ascending: false })

  if (filters?.start_date) {
    query = query.gte("sale_date", filters.start_date)
  }

  if (filters?.end_date) {
    query = query.lte("sale_date", filters.end_date)
  }

  if (filters?.student_id) {
    query = query.eq("student_id", filters.student_id)
  }

  if (filters?.branch_id !== undefined) {
    if (filters.branch_id === null) {
      query = query.is("branch_id", null)
    } else {
      query = query.eq("branch_id", filters.branch_id)
    }
  }

  if (filters?.limit) {
    query = query.limit(filters.limit)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch sales: ${error.message}`)
  }

  return data || []
}

/**
 * Get single sale with items
 */
export async function getSale(saleId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error("Not authenticated")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    throw new Error("No school context")
  }

  // Get sale
  const { data: sale, error: saleError } = await supabase
    .from("uniform_sales")
    .select(`
      *,
      students(id, first_name, last_name, admission_number),
      profiles:sold_by(id, full_name),
      other_income(id)
    `)
    .eq("id", saleId)
    .eq("school_id", context.schoolId)
    .single()

  if (saleError || !sale) {
    throw new Error(`Sale not found: ${saleError?.message || "Unknown error"}`)
  }

  // Get sale items with variant and product details
  const { data: items, error: itemsError } = await supabase
    .from("uniform_sale_items")
    .select(`
      *,
      uniform_variants(
        id,
        size,
        color,
        uniform_products(
          id,
          name
        )
      )
    `)
    .eq("sale_id", saleId)
    .order("created_at", { ascending: true })

  if (itemsError) {
    throw new Error(`Failed to fetch sale items: ${itemsError.message}`)
  }

  return {
    ...(sale as any),
    items: items || [],
  }
}

/**
 * Generate receipt data for a sale
 */
export async function generateReceipt(saleId: string) {
  const sale = await getSale(saleId)

  // Get school details
  const supabase = await createClient()
  const { data: school } = await supabase
    .from("schools")
    .select("id, name, address, phone, email, logo_url")
    .eq("id", (sale as any).school_id)
    .single()

  return {
    sale,
    school: school || null,
    receipt_number: `REC-${(sale as any).sale_number}`,
  }
}

/**
 * Cancel a sale (restore stock)
 */
export async function cancelSale(saleId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error("Not authenticated")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    throw new Error("No school context")
  }

  // Verify sale belongs to school
  const { data: sale } = await supabase
    .from("uniform_sales")
    .select("id, other_income_id")
    .eq("id", saleId)
    .eq("school_id", context.schoolId)
    .single()

  if (!sale) {
    throw new Error("Sale not found")
  }

  // Delete sale (trigger will restore stock)
  const { error } = await supabase
    .from("uniform_sales")
    .delete()
    .eq("id", saleId)

  if (error) {
    throw new Error(`Failed to cancel sale: ${error.message}`)
  }

  // Delete associated other_income entry if exists
  if ((sale as any).other_income_id) {
    await supabase
      .from("other_income")
      .delete()
      .eq("id", (sale as any).other_income_id)
  }

  revalidatePath("/dashboard/store/sales/history")
  revalidatePath("/dashboard/accountant/finance")
  
  return { error: null }
}

