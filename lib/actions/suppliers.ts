"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

export async function getSuppliers() {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)

  const { data: suppliers, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("school_id", context.schoolId)
    .order("name", { ascending: true })

  if (error) {
    return { error: error.message }
  }

  return { data: suppliers || [] }
}

export async function getSupplier(supplierId: string) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)

  const { data: supplier, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("id", supplierId)
    .eq("school_id", context.schoolId)
    .single()

  if (error || !supplier) {
    return { error: "Supplier not found or access denied" }
  }

  return { data: supplier }
}

export async function createSupplier(formData: FormData) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)

  const supplierData: any = {
    school_id: context.schoolId,
    name: formData.get("name") as string,
    contact_person: (formData.get("contact_person") as string) || null,
    phone: (formData.get("phone") as string) || null,
    email: (formData.get("email") as string) || null,
    address: (formData.get("address") as string) || null,
    tax_id: (formData.get("tax_id") as string) || null,
    notes: (formData.get("notes") as string) || null,
    is_active: true,
  }

  const { data: supplier, error } = await supabase
    .from("suppliers")
    // @ts-ignore
    .insert(supplierData)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/accountant/finance/suppliers")
  return { data: supplier }
}

export async function updateSupplier(supplierId: string, formData: FormData) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)

  const { data: existing, error: existingError } = await supabase
    .from("suppliers")
    .select("school_id")
    .eq("id", supplierId)
    .single()

  if (existingError || !existing || (existing as any).school_id !== context.schoolId) {
    return { error: "Supplier not found or access denied" }
  }

  const isActiveVal = formData.get("is_active")
  const is_active = isActiveVal === "true" || isActiveVal === "1"

  const updateData: any = {
    name: formData.get("name") as string,
    contact_person: (formData.get("contact_person") as string) || null,
    phone: (formData.get("phone") as string) || null,
    email: (formData.get("email") as string) || null,
    address: (formData.get("address") as string) || null,
    tax_id: (formData.get("tax_id") as string) || null,
    notes: (formData.get("notes") as string) || null,
    is_active,
    updated_at: new Date().toISOString(),
  }

  const { data: supplier, error } = await supabase
    .from("suppliers")
    // @ts-ignore
    .update(updateData)
    .eq("id", supplierId)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/accountant/finance/suppliers")
  return { data: supplier }
}

export async function deleteSupplier(supplierId: string) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)

  const { data: existing, error: existingError } = await supabase
    .from("suppliers")
    .select("school_id")
    .eq("id", supplierId)
    .single()

  if (existingError || !existing || (existing as any).school_id !== context.schoolId) {
    return { error: "Supplier not found or access denied" }
  }

  const { error } = await supabase
    .from("suppliers")
    .delete()
    .eq("id", supplierId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/accountant/finance/suppliers")
  return { data: { success: true } }
}
