"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

export async function createFeeStructure(formData: FormData) {
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

  // Get current academic year
  const { data: currentYear, error: yearError } = await supabase
    .from("academic_years")
    .select("id")
    .eq("school_id", context.schoolId)
    .eq("is_current", true)
    .single()

  if (yearError || !currentYear) {
    throw new Error("No current academic year found")
  }

  const classId = formData.get("class_id") as string

  const feeData: Record<string, any> = {
    school_id: context.schoolId,
    academic_year_id: (currentYear as any).id,
    class_id: (classId && classId !== "all") ? classId : null,
    name: formData.get("name") as string,
    amount: parseFloat(formData.get("amount") as string),
    fee_type: formData.get("fee_type") as string,
    is_active: true,
  }

  const { data: feeStructure, error } = await supabase
    .from("fee_structures")
    // @ts-ignore - Supabase strict type checking
    .insert(feeData)
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath("/dashboard/accountant/fees")
  return feeStructure
}

export async function updateFeeStructure(feeStructureId: string, formData: FormData) {
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

  // Verify fee structure belongs to user's school
  const { data: existing, error: existingError } = await supabase
    .from("fee_structures")
    .select("school_id")
    .eq("id", feeStructureId)
    .single()

  if (existingError || !existing || (existing as any).school_id !== context.schoolId) {
    throw new Error("Fee structure not found or access denied")
  }

  const updateData: any = {
    name: formData.get("name") as string,
    amount: parseFloat(formData.get("amount") as string),
    fee_type: formData.get("fee_type") as string,
    updated_at: new Date().toISOString(),
  }

  const classId = formData.get("class_id") as string
  updateData.class_id = (classId && classId !== "all") ? classId : null

  const { data: feeStructure, error } = await supabase
    .from("fee_structures")
    // @ts-ignore - Supabase strict type checking
    .update(updateData)
    .eq("id", feeStructureId)
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath("/dashboard/accountant/fees")
  return feeStructure
}

export async function deleteFeeStructure(feeStructureId: string) {
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

  // Verify fee structure belongs to user's school
  const { data: existing, error: existingError } = await supabase
    .from("fee_structures")
    .select("school_id")
    .eq("id", feeStructureId)
    .single()

  if (existingError || !existing || (existing as any).school_id !== context.schoolId) {
    throw new Error("Fee structure not found or access denied")
  }

  const { error } = await supabase
    .from("fee_structures")
    .delete()
    .eq("id", feeStructureId)

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath("/dashboard/accountant/fees")
  return { success: true }
}

export async function getFeeStructures(filters?: {
  classId?: string
  termId?: string
  feeType?: string
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
    .from("fee_structures")
    .select("*, classes(name)")
    .eq("school_id", context.schoolId)

  if (filters?.classId) {
    query = query.eq("class_id", filters.classId)
  }

  if (filters?.termId) {
    query = query.eq("term_id", filters.termId)
  }

  if (filters?.feeType) {
    query = query.eq("fee_type", filters.feeType)
  }

  query = query.order("created_at", { ascending: false })

  const { data: feeStructures, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return feeStructures || []
}

