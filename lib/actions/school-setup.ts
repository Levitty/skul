"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { applyBranchFilter, requireBranchAccess, getDefaultBranchId } from "@/lib/supabase/branch-context"
import { revalidatePath } from "next/cache"

// ============ School Creation Actions ============

export async function createSchool(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const name = (formData.get("name") as string)?.trim()
  const code = (formData.get("code") as string)?.trim() || `SCHOOL-${Date.now()}`
  const address = (formData.get("address") as string)?.trim() || null
  const phone = (formData.get("phone") as string)?.trim() || null
  const email = (formData.get("email") as string)?.trim() || null
  const logoUrl = (formData.get("logo_url") as string)?.trim() || null
  
  if (!name) {
    return { error: "School name is required" }
  }
  
  // Create the school
  const { data: school, error: schoolError } = await supabase
    .from("schools")
    // @ts-ignore - schools table insert
    .insert({
      name,
      code,
      address,
      phone,
      email,
      logo_url: logoUrl,
      is_active: true,
      deployment_mode: 'shared',
    } as any)
    .select()
    .single()
  
  if (schoolError || !school) {
    return { error: schoolError?.message || "Failed to create school" }
  }
  
  // Automatically link the user to the school as school_admin
  const { error: linkError } = await supabase
    .from("user_schools")
    // @ts-ignore - user_schools table insert
    .insert({
      user_id: user.id,
      school_id: (school as any).id,
      role: 'school_admin',
    } as any)
  
  if (linkError) {
    // If linking fails, try to delete the school (cleanup)
    await supabase.from("schools").delete().eq("id", (school as any).id)
    return { error: `Failed to link your account to the school: ${linkError.message}` }
  }
  
  // Create user profile if it doesn't exist
  const { error: profileError } = await supabase
    .from("user_profiles")
    // @ts-ignore - user_profiles table insert
    .upsert({
      id: user.id,
      school_id: (school as any).id,
      full_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Admin",
    } as any, {
      onConflict: "id"
    })
  
  if (profileError) {
    console.error("Failed to create user profile:", profileError)
    // Don't fail the whole operation if profile creation fails
  }
  
  revalidatePath("/dashboard")
  revalidatePath("/dashboard/admin/school-setup")
  return { success: true, data: school }
}

// ============ School Profile Actions ============

export async function getSchoolProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }
  
  const { data: school, error } = await supabase
    .from("schools")
    .select("*")
    .eq("id", context.schoolId)
    .single()
  
  if (error) {
    return { error: error.message }
  }
  
  return { data: school }
}

export async function updateSchoolProfile(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }
  
  const name = (formData.get("name") as string)?.trim()
  const address = (formData.get("address") as string)?.trim() || null
  const phone = (formData.get("phone") as string)?.trim() || null
  const email = (formData.get("email") as string)?.trim() || null
  const logoUrl = (formData.get("logo_url") as string)?.trim() || null
  
  if (!name) {
    return { error: "School name is required" }
  }
  
  const { error } = await supabase
    .from("schools")
    // @ts-ignore - schools table update
    .update({
      name,
      address,
      phone,
      email,
      logo_url: logoUrl,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", context.schoolId)
  
  if (error) {
    return { error: error.message }
  }
  
  revalidatePath("/dashboard/admin/school-setup")
  revalidatePath("/dashboard/admin/school-setup/profile")
  return { success: true }
}

// ============ Admission Rules Actions ============

export async function getAdmissionRules() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }
  
  const { data, error } = await supabase
    .from("school_settings")
    .select("setting_value")
    .eq("school_id", context.schoolId)
    .eq("setting_key", "admission_rules")
    .single()
  
  if (error && error.code !== "PGRST116") {
    return { error: error.message }
  }
  
  return { data: (data as any)?.setting_value?.text || "" }
}

export async function updateAdmissionRules(rulesText: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }
  
  // @ts-ignore - school_settings upsert
  const { error } = await supabase
    .from("school_settings")
    .upsert(
      {
        school_id: context.schoolId,
        setting_key: "admission_rules",
        setting_value: { text: rulesText },
        description: "Admission rules and regulations displayed to parents on the public application form",
      } as any,
      { onConflict: "school_id,setting_key" }
    )
  
  if (error) {
    return { error: error.message }
  }
  
  revalidatePath("/dashboard/admin/school-setup")
  revalidatePath("/dashboard/admin/school-setup/admission-rules")
  return { success: true }
}

// ============ Classes Actions ============

export async function getClasses(branchId?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }
  
  let query = supabase
    .from("classes")
    .select("*, sections(id, name, capacity)")
    .eq("school_id", context.schoolId)
  
  // Apply branch filter - either from explicit filter or user's branch scope
  if (branchId) {
    requireBranchAccess(context, branchId)
    query = query.eq("branch_id", branchId)
  } else {
    query = applyBranchFilter(query, context)
  }
  
  const { data: classes, error } = await query.order("level", { ascending: true })
  
  if (error) {
    return { error: error.message }
  }
  
  return { data: classes }
}

export async function createClass(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }
  
  const name = formData.get("name") as string
  const level = parseInt(formData.get("level") as string) || 1
  const description = formData.get("description") as string
  const branchId = formData.get("branch_id") as string || getDefaultBranchId(context)
  
  if (!name) {
    return { error: "Class name is required" }
  }
  
  // Verify branch access if branch is specified
  if (branchId) {
    requireBranchAccess(context, branchId)
  }
  
  const { data: newClass, error } = await supabase
    .from("classes")
    // @ts-ignore - classes table insert
    .insert({
      school_id: context.schoolId,
      branch_id: branchId,
      name,
      level,
      description: description || null,
    } as any)
    .select()
    .single()
  
  if (error) {
    return { error: error.message }
  }
  
  revalidatePath("/dashboard/admin/school-setup")
  revalidatePath("/dashboard/admin/school-setup/classes")
  return { success: true, data: newClass }
}

export async function updateClass(classId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }
  
  // Verify class belongs to user's school and branch
  const { data: existingClass } = await supabase
    .from("classes")
    .select("school_id, branch_id")
    .eq("id", classId)
    .single()
  
  if (!existingClass || (existingClass as any).school_id !== context.schoolId) {
    return { error: "Class not found" }
  }
  
  // Check branch access
  requireBranchAccess(context, (existingClass as any).branch_id)
  
  const name = formData.get("name") as string
  const level = parseInt(formData.get("level") as string) || 1
  const description = formData.get("description") as string
  
  const updateData: any = {
    name,
    level,
    description: description || null,
    updated_at: new Date().toISOString(),
  }
  
  // Only school admin can change branch_id
  const newBranchId = formData.get("branch_id") as string
  if (newBranchId !== undefined && context.hasAllBranchesAccess) {
    updateData.branch_id = newBranchId || null
  }
  
  const { error } = await supabase
    .from("classes")
    // @ts-ignore - classes table update
    .update(updateData)
    .eq("id", classId)
    .eq("school_id", context.schoolId)
  
  if (error) {
    return { error: error.message }
  }
  
  revalidatePath("/dashboard/admin/school-setup")
  revalidatePath("/dashboard/admin/school-setup/classes")
  return { success: true }
}

export async function deleteClass(classId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }
  
  // Verify class belongs to user's school and branch
  const { data: existingClass } = await supabase
    .from("classes")
    .select("school_id, branch_id")
    .eq("id", classId)
    .single()
  
  if (!existingClass || (existingClass as any).school_id !== context.schoolId) {
    return { error: "Class not found" }
  }
  
  // Check branch access
  requireBranchAccess(context, (existingClass as any).branch_id)
  
  const { error } = await supabase
    .from("classes")
    .delete()
    .eq("id", classId)
    .eq("school_id", context.schoolId)
  
  if (error) {
    return { error: error.message }
  }
  
  revalidatePath("/dashboard/admin/school-setup")
  revalidatePath("/dashboard/admin/school-setup/classes")
  return { success: true }
}

// ============ Sections Actions ============

export async function getSections(classId?: string, branchId?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }
  
  let query = supabase
    .from("sections")
    .select("*, classes!inner(id, name, school_id, branch_id)")
  
  if (classId) {
    query = query.eq("class_id", classId)
  }
  
  query = query.eq("classes.school_id", context.schoolId)
  
  // Apply branch filter via the class relationship
  if (branchId) {
    requireBranchAccess(context, branchId)
    query = query.eq("classes.branch_id", branchId)
  } else if (!context.hasAllBranchesAccess && context.branchId) {
    query = query.eq("classes.branch_id", context.branchId)
  }
  
  const { data: sections, error } = await query.order("name", { ascending: true })
  
  if (error) {
    return { error: error.message }
  }
  
  return { data: sections }
}

export async function createSection(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }
  
  const classId = formData.get("class_id") as string
  const name = formData.get("name") as string
  const capacity = parseInt(formData.get("capacity") as string) || null
  
  if (!classId || !name) {
    return { error: "Class and section name are required" }
  }
  
  // Verify class belongs to this school and branch
  const { data: classData } = await supabase
    .from("classes")
    .select("id, branch_id")
    .eq("id", classId)
    .eq("school_id", context.schoolId)
    .single()
  
  if (!classData) {
    return { error: "Class not found" }
  }
  
  // Check branch access
  requireBranchAccess(context, (classData as any).branch_id)
  
  const { data: newSection, error } = await supabase
    .from("sections")
    // @ts-ignore - sections table insert
    .insert({
      class_id: classId,
      name,
      capacity,
    } as any)
    .select()
    .single()
  
  if (error) {
    console.error("Error creating section:", error)
    // Provide more helpful error messages
    if (error.code === "23505") { // Unique constraint violation
      return { error: `A section named "${name}" already exists for this class. Please use a different name.` }
    }
    if (error.message?.includes("policy") || error.message?.includes("RLS")) {
      return { error: "Permission denied. Please ensure you have admin access and the class belongs to your school." }
    }
    return { error: error.message || "Failed to create section. Please try again." }
  }
  
  revalidatePath("/dashboard/admin/school-setup")
  revalidatePath("/dashboard/admin/school-setup/sections")
  revalidatePath("/dashboard/admin/school-setup/classes")
  return { success: true, data: newSection }
}

export async function updateSection(sectionId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }
  
  const name = formData.get("name") as string
  const capacity = parseInt(formData.get("capacity") as string) || null
  
  // Verify section belongs to a class in this school and branch
  const { data: section } = await supabase
    .from("sections")
    .select("id, classes!inner(school_id, branch_id)")
    .eq("id", sectionId)
    .single()
  
  if (!section || (section as any).classes?.school_id !== context.schoolId) {
    return { error: "Section not found" }
  }
  
  // Check branch access
  requireBranchAccess(context, (section as any).classes?.branch_id)
  
  const { error } = await supabase
    .from("sections")
    // @ts-ignore - sections table update
    .update({
      name,
      capacity,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", sectionId)
  
  if (error) {
    return { error: error.message }
  }
  
  revalidatePath("/dashboard/admin/school-setup")
  revalidatePath("/dashboard/admin/school-setup/sections")
  revalidatePath("/dashboard/admin/school-setup/classes")
  return { success: true }
}

export async function deleteSection(sectionId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }
  
  // Verify section belongs to a class in this school and branch
  const { data: section } = await supabase
    .from("sections")
    .select("id, classes!inner(school_id, branch_id)")
    .eq("id", sectionId)
    .single()
  
  if (!section || (section as any).classes?.school_id !== context.schoolId) {
    return { error: "Section not found" }
  }
  
  // Check branch access
  requireBranchAccess(context, (section as any).classes?.branch_id)
  
  const { error } = await supabase
    .from("sections")
    .delete()
    .eq("id", sectionId)
  
  if (error) {
    return { error: error.message }
  }
  
  revalidatePath("/dashboard/admin/school-setup")
  revalidatePath("/dashboard/admin/school-setup/sections")
  revalidatePath("/dashboard/admin/school-setup/classes")
  return { success: true }
}

// ============ Academic Years Actions ============

export async function getAcademicYears() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }
  
  const { data: academicYears, error } = await supabase
    .from("academic_years")
    .select("*, terms(id, name, start_date, end_date, is_current)")
    .eq("school_id", context.schoolId)
    .order("start_date", { ascending: false })
  
  if (error) {
    return { error: error.message }
  }
  
  return { data: academicYears }
}

export async function createAcademicYear(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }
  
  const name = formData.get("name") as string
  const startDate = formData.get("start_date") as string
  const endDate = formData.get("end_date") as string
  const isCurrent = formData.get("is_current") === "true"
  
  if (!name || !startDate || !endDate) {
    return { error: "Name, start date, and end date are required" }
  }
  
  // If setting as current, unset other current years
  if (isCurrent) {
    await supabase
      .from("academic_years")
      // @ts-ignore - academic_years table update
      .update({ is_current: false } as any)
      .eq("school_id", context.schoolId)
      .eq("is_current", true)
  }
  
  const { data: newYear, error } = await supabase
    .from("academic_years")
    // @ts-ignore - academic_years table insert
    .insert({
      school_id: context.schoolId,
      name,
      start_date: startDate,
      end_date: endDate,
      is_current: isCurrent,
    } as any)
    .select()
    .single()
  
  if (error) {
    return { error: error.message }
  }
  
  revalidatePath("/dashboard/admin/school-setup")
  revalidatePath("/dashboard/admin/school-setup/academic-years")
  return { success: true, data: newYear }
}

export async function updateAcademicYear(yearId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }
  
  const name = formData.get("name") as string
  const startDate = formData.get("start_date") as string
  const endDate = formData.get("end_date") as string
  const isCurrent = formData.get("is_current") === "true"
  
  // If setting as current, unset other current years
  if (isCurrent) {
    await supabase
      .from("academic_years")
      // @ts-ignore - academic_years table update
      .update({ is_current: false } as any)
      .eq("school_id", context.schoolId)
      .eq("is_current", true)
      .neq("id", yearId)
  }
  
  const { error } = await supabase
    .from("academic_years")
    // @ts-ignore - academic_years table update
    .update({
      name,
      start_date: startDate,
      end_date: endDate,
      is_current: isCurrent,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", yearId)
    .eq("school_id", context.schoolId)
  
  if (error) {
    return { error: error.message }
  }
  
  revalidatePath("/dashboard/admin/school-setup")
  revalidatePath("/dashboard/admin/school-setup/academic-years")
  return { success: true }
}

export async function deleteAcademicYear(yearId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }
  
  const { error } = await supabase
    .from("academic_years")
    .delete()
    .eq("id", yearId)
    .eq("school_id", context.schoolId)
  
  if (error) {
    return { error: error.message }
  }
  
  revalidatePath("/dashboard/admin/school-setup")
  revalidatePath("/dashboard/admin/school-setup/academic-years")
  return { success: true }
}

// ============ Terms Actions ============

export async function createTerm(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }
  
  const academicYearId = formData.get("academic_year_id") as string
  const name = formData.get("name") as string
  const startDate = formData.get("start_date") as string
  const endDate = formData.get("end_date") as string
  const dueDate = formData.get("due_date") as string
  const isCurrent = formData.get("is_current") === "true"
  
  if (!academicYearId || !name || !startDate || !endDate) {
    return { error: "Academic year, name, start date, and end date are required" }
  }
  
  // Verify academic year belongs to school
  const { data: year } = await supabase
    .from("academic_years")
    .select("id")
    .eq("id", academicYearId)
    .eq("school_id", context.schoolId)
    .single()
  
  if (!year) {
    return { error: "Academic year not found" }
  }
  
  // Check if term with same name already exists for this academic year
  const { data: existingTerm } = await supabase
    .from("terms")
    .select("id, name")
    .eq("school_id", context.schoolId)
    .eq("academic_year_id", academicYearId)
    .eq("name", name)
    .single()

  if (existingTerm) {
    return { error: `A term named "${name}" already exists for this academic year. Please use a different name.` }
  }

  // If setting as current, unset other current terms
  if (isCurrent) {
    await supabase
      .from("terms")
      // @ts-ignore - terms table update
      .update({ is_current: false } as any)
      .eq("school_id", context.schoolId)
      .eq("is_current", true)
  }
  
  const { data: newTerm, error } = await supabase
    .from("terms")
    // @ts-ignore - terms table insert
    .insert({
      school_id: context.schoolId,
      academic_year_id: academicYearId,
      name,
      start_date: startDate,
      end_date: endDate,
      due_date: dueDate || endDate,
      is_current: isCurrent,
    } as any)
    .select()
    .single()
  
  if (error) {
    if (error.code === "23505") { // Unique constraint violation
      return { error: `A term named "${name}" already exists for this academic year. Please use a different name.` }
    }
    return { error: error.message }
  }
  
  revalidatePath("/dashboard/admin/school-setup")
  revalidatePath("/dashboard/admin/school-setup/academic-years")
  return { success: true, data: newTerm }
}

export async function updateTerm(termId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }
  
  const name = formData.get("name") as string
  const startDate = formData.get("start_date") as string
  const endDate = formData.get("end_date") as string
  const dueDate = formData.get("due_date") as string
  const isCurrent = formData.get("is_current") === "true"
  
  // If setting as current, unset other current terms
  if (isCurrent) {
    await supabase
      .from("terms")
      // @ts-ignore - terms table update
      .update({ is_current: false } as any)
      .eq("school_id", context.schoolId)
      .eq("is_current", true)
      .neq("id", termId)
  }
  
  const { error } = await supabase
    .from("terms")
    // @ts-ignore - terms table update
    .update({
      name,
      start_date: startDate,
      end_date: endDate,
      due_date: dueDate || endDate,
      is_current: isCurrent,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", termId)
    .eq("school_id", context.schoolId)
  
  if (error) {
    return { error: error.message }
  }
  
  revalidatePath("/dashboard/admin/school-setup")
  revalidatePath("/dashboard/admin/school-setup/academic-years")
  return { success: true }
}

export async function deleteTerm(termId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }
  
  const { error } = await supabase
    .from("terms")
    .delete()
    .eq("id", termId)
    .eq("school_id", context.schoolId)
  
  if (error) {
    return { error: error.message }
  }
  
  revalidatePath("/dashboard/admin/school-setup")
  revalidatePath("/dashboard/admin/school-setup/academic-years")
  return { success: true }
}
