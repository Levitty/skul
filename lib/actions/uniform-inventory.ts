"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

export interface UniformProductData {
  name: string
  description?: string
  category?: "uniform" | "accessory" | "sportswear" | "other"
  base_price: number
  cost_price?: number
  image_url?: string
  branch_id?: string | null
}

export interface VariantData {
  size: "XS" | "S" | "M" | "L" | "XL" | "XXL" | "XXXL"
  color: string
  sku?: string
  stock_quantity?: number
  reorder_level?: number
  price?: number
}

export interface StockAdjustmentData {
  variant_id: string
  adjustment_type: "purchase" | "sale" | "return" | "damaged" | "adjustment"
  quantity: number
  reason?: string
}

/**
 * Create a new uniform product
 */
export async function createUniformProduct(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error("Not authenticated")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    throw new Error("No school context")
  }

  const productData: any = {
    school_id: context.schoolId,
    name: formData.get("name") as string,
    description: formData.get("description") as string || null,
    category: (formData.get("category") as string) || "uniform",
    base_price: parseFloat(formData.get("base_price") as string),
    cost_price: formData.get("cost_price") ? parseFloat(formData.get("cost_price") as string) : null,
    image_url: formData.get("image_url") as string || null,
    branch_id: formData.get("branch_id") as string || null,
  }

  const { data: product, error } = await supabase
    .from("uniform_products")
    .insert(productData)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create product: ${error.message}`)
  }

  revalidatePath("/dashboard/store/inventory")
  return { data: product, error: null }
}

/**
 * Update uniform product
 */
export async function updateUniformProduct(productId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error("Not authenticated")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    throw new Error("No school context")
  }

  const updateData: any = {
    name: formData.get("name") as string,
    description: formData.get("description") as string || null,
    category: formData.get("category") as string || "uniform",
    base_price: parseFloat(formData.get("base_price") as string),
    cost_price: formData.get("cost_price") ? parseFloat(formData.get("cost_price") as string) : null,
    image_url: formData.get("image_url") as string || null,
    branch_id: (formData.get("branch_id") as string) && formData.get("branch_id") !== "all" ? formData.get("branch_id") as string : null,
    updated_at: new Date().toISOString(),
  }

  // @ts-ignore - uniform_products table may not be in generated types
  const { data: product, error } = await supabase
    // @ts-ignore
    .from("uniform_products")
    // @ts-ignore
    .update(updateData)
    .eq("id", productId)
    .eq("school_id", context.schoolId)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update product: ${error.message}`)
  }

  revalidatePath("/dashboard/store/inventory")
  return { data: product, error: null }
}

/**
 * Delete (soft delete) uniform product
 */
export async function deleteUniformProduct(productId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error("Not authenticated")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    throw new Error("No school context")
  }

  // @ts-ignore - uniform_products table may not be in generated types
  const { error } = await supabase
    // @ts-ignore
    .from("uniform_products")
    // @ts-ignore
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", productId)
    .eq("school_id", context.schoolId)

  if (error) {
    throw new Error(`Failed to delete product: ${error.message}`)
  }

  revalidatePath("/dashboard/store/inventory")
  return { error: null }
}

/**
 * Get all uniform products with variants
 */
export async function getUniformProducts(filters?: {
  branch_id?: string | null
  category?: string
  include_inactive?: boolean
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
    .from("uniform_products")
    .select(`
      *,
      uniform_variants (
        id,
        size,
        color,
        sku,
        stock_quantity,
        reorder_level,
        price,
        is_active
      )
    `)
    .eq("school_id", context.schoolId)
    .order("name", { ascending: true })

  if (filters?.branch_id !== undefined) {
    if (filters.branch_id === null) {
      query = query.is("branch_id", null)
    } else {
      query = query.eq("branch_id", filters.branch_id)
    }
  }

  if (filters?.category) {
    query = query.eq("category", filters.category)
  }

  if (!filters?.include_inactive) {
    query = query.eq("is_active", true)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch products: ${error.message}`)
  }

  return data || []
}

/**
 * Get single uniform product with variants
 */
export async function getUniformProduct(productId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error("Not authenticated")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    throw new Error("No school context")
  }

  const { data: product, error } = await supabase
    .from("uniform_products")
    .select(`
      *,
      uniform_variants (
        id,
        size,
        color,
        sku,
        stock_quantity,
        reorder_level,
        price,
        is_active
      )
    `)
    .eq("id", productId)
    .eq("school_id", context.schoolId)
    .single()

  if (error) {
    throw new Error(`Failed to fetch product: ${error.message}`)
  }

  return product
}

/**
 * Create product variant
 */
export async function createVariant(productId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error("Not authenticated")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    throw new Error("No school context")
  }

  // Verify product belongs to school
  const { data: product } = await supabase
    .from("uniform_products")
    .select("id, base_price")
    .eq("id", productId)
    .eq("school_id", context.schoolId)
    .single()

  if (!product) {
    throw new Error("Product not found")
  }

  const size = formData.get("size") as string
  const color = formData.get("color") as string

  // Check if variant already exists
  const { data: existingVariant } = await supabase
    .from("uniform_variants")
    .select("id")
    .eq("product_id", productId)
    .eq("size", size)
    .eq("color", color)
    .single()

  if (existingVariant) {
    throw new Error(`A variant with size "${size}" and color "${color}" already exists for this product. Please choose a different combination.`)
  }

  const variantData: any = {
    product_id: productId,
    size: size,
    color: color,
    sku: formData.get("sku") as string || null,
    stock_quantity: formData.get("stock_quantity") ? parseInt(formData.get("stock_quantity") as string) : 0,
    reorder_level: formData.get("reorder_level") ? parseInt(formData.get("reorder_level") as string) : 10,
    price: formData.get("price") ? parseFloat(formData.get("price") as string) : (product as any).base_price,
  }

  // @ts-ignore - uniform_variants table may not be in generated types
  const { data: variant, error } = await supabase
    .from("uniform_variants")
    .insert(variantData)
    .select()
    .single()

  if (error) {
    if (error.code === "23505") { // Unique constraint violation
      throw new Error(`A variant with size "${size}" and color "${color}" already exists for this product. Please choose a different combination.`)
    }
    throw new Error(`Failed to create variant: ${error.message}`)
  }

  revalidatePath("/dashboard/store/inventory")
  return { data: variant, error: null }
}

/**
 * Update variant
 */
export async function updateVariant(variantId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error("Not authenticated")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    throw new Error("No school context")
  }

  const updateData: any = {
    sku: formData.get("sku") as string || null,
    stock_quantity: formData.get("stock_quantity") ? parseInt(formData.get("stock_quantity") as string) : 0,
    reorder_level: formData.get("reorder_level") ? parseInt(formData.get("reorder_level") as string) : 10,
    price: formData.get("price") ? parseFloat(formData.get("price") as string) : null,
    is_active: formData.get("is_active") === "true",
    updated_at: new Date().toISOString(),
  }

  // @ts-ignore - uniform_variants table may not be in generated types
  const { data: variant, error } = await supabase
    // @ts-ignore
    .from("uniform_variants")
    // @ts-ignore
    .update(updateData)
    .eq("id", variantId)
    .select(`
      *,
      uniform_products!inner(school_id)
    `)
    .eq("uniform_products.school_id", context.schoolId)
    .single()

  if (error) {
    throw new Error(`Failed to update variant: ${error.message}`)
  }

  revalidatePath("/dashboard/store/inventory")
  return { data: variant, error: null }
}

/**
 * Adjust stock manually
 */
export async function adjustStock(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error("Not authenticated")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    throw new Error("No school context")
  }

  const variantId = formData.get("variant_id") as string
  const adjustmentType = formData.get("adjustment_type") as string
  const quantity = parseInt(formData.get("quantity") as string)
  const reason = formData.get("reason") as string || null

  // Get current stock
  const { data: variant } = await supabase
    .from("uniform_variants")
    .select("stock_quantity, uniform_products!inner(school_id)")
    .eq("id", variantId)
    .eq("uniform_products.school_id", context.schoolId)
    .single()

  if (!variant) {
    throw new Error("Variant not found")
  }

  const previousQty = (variant as any).stock_quantity
  let newQty = previousQty

  // Calculate new quantity based on adjustment type
  if (adjustmentType === "purchase" || adjustmentType === "return") {
    newQty = previousQty + quantity
  } else if (adjustmentType === "sale" || adjustmentType === "damaged") {
    newQty = previousQty - quantity
  } else if (adjustmentType === "adjustment") {
    newQty = quantity // Direct set
  }

  if (newQty < 0) {
    throw new Error("Stock cannot be negative")
  }

  // Update stock
  // @ts-ignore - uniform_variants table may not be in generated types
  const { error: updateError } = await supabase
    // @ts-ignore
    .from("uniform_variants")
    // @ts-ignore
    .update({
      stock_quantity: newQty,
      updated_at: new Date().toISOString(),
    })
    .eq("id", variantId)

  if (updateError) {
    throw new Error(`Failed to update stock: ${updateError.message}`)
  }

  // Record adjustment
  // @ts-ignore - stock_adjustments table may not be in generated types
  const { error: adjError } = await supabase
    // @ts-ignore
    .from("stock_adjustments")
    // @ts-ignore
    .insert({
      variant_id: variantId,
      adjustment_type: adjustmentType,
      quantity: adjustmentType === "adjustment" ? newQty - previousQty : quantity,
      previous_quantity: previousQty,
      new_quantity: newQty,
      reason: reason,
      adjusted_by: user.id,
    })

  if (adjError) {
    throw new Error(`Failed to record adjustment: ${adjError.message}`)
  }

  revalidatePath("/dashboard/store/inventory")
  return { error: null }
}

/**
 * Get low stock items (below reorder level)
 */
export async function getLowStockItems() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error("Not authenticated")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    throw new Error("No school context")
  }

  const { data, error } = await supabase
    .from("uniform_variants")
    .select(`
      *,
      uniform_products!inner(
        id,
        name,
        school_id
      )
    `)
    .eq("uniform_products.school_id", context.schoolId)
    .eq("is_active", true)

  if (error) {
    throw new Error(`Failed to fetch low stock items: ${error.message}`)
  }

  // Filter variants where stock_quantity <= reorder_level
  const lowStockItems = (data || []).filter((variant: any) => 
    variant.stock_quantity <= variant.reorder_level
  )

  return lowStockItems
}

