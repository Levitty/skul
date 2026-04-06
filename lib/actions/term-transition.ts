"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

/**
 * Term Transition Workflow
 *
 * Handles the entire process of moving from one term to another:
 * 1. Validates the new term exists and belongs to the school
 * 2. Sets the new term as the current term (unsets the old one)
 * 3. Optionally bulk-generates invoices for all classes, with balance carry-forward
 *
 * This replaces the manual process of:
 * - Promoting students to same class
 * - Invoicing students one by one
 * - Manually tracking balances from previous terms
 */

export interface TermTransitionOptions {
  newTermId: string
  generateInvoices: boolean
  classIds?: string[] // If empty/undefined, generates for ALL classes
  includeBoarding: boolean
  includeTransport: boolean
  includeBalanceForward: boolean
}

export interface TermTransitionResult {
  success: boolean
  termActivated: boolean
  invoiceResults?: {
    totalStudents: number
    successCount: number
    errorCount: number
    errors: Array<{ studentId: string; className: string; error: string }>
  }
}

/**
 * Activate a new term — sets it as the current term and deactivates the old one.
 */
export async function activateTerm(termId: string) {
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

  // Verify the term exists and belongs to this school
  const { data: newTerm, error: termError } = await supabase
    .from("terms")
    .select("*, academic_years(id, name)")
    .eq("id", termId)
    .eq("school_id", context.schoolId)
    .single()

  if (termError || !newTerm) {
    throw new Error("Term not found or access denied")
  }

  // Deactivate all current terms for this school
  // @ts-ignore - terms table update types may not be generated
  await (supabase as any)
    .from("terms")
    .update({ is_current: false })
    .eq("school_id", context.schoolId)
    .eq("is_current", true)

  // Activate the new term
  // @ts-ignore - terms table update types may not be generated
  const { error: activateError } = await (supabase as any)
    .from("terms")
    .update({ is_current: true })
    .eq("id", termId)
    .eq("school_id", context.schoolId)

  if (activateError) {
    throw new Error(`Failed to activate term: ${activateError.message}`)
  }

  revalidatePath("/dashboard")
  return { success: true, term: newTerm }
}

/**
 * Full term transition: activate term + bulk invoice generation for selected classes.
 *
 * This is the "one-click" workflow that replaces the manual promotion + invoicing process.
 */
export async function runTermTransition(options: TermTransitionOptions): Promise<TermTransitionResult> {
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

  // Step 1: Activate the new term
  await activateTerm(options.newTermId)

  // If no invoice generation requested, we're done
  if (!options.generateInvoices) {
    return {
      success: true,
      termActivated: true,
    }
  }

  // Step 2: Get the term's academic year to find all relevant classes
  const { data: term } = await supabase
    .from("terms")
    .select("academic_year_id")
    .eq("id", options.newTermId)
    .single()

  if (!term) {
    throw new Error("Term not found")
  }

  // Step 3: Determine which classes to invoice
  let classIds = options.classIds || []

  if (classIds.length === 0) {
    // Get all classes that have active enrollments in this academic year
    const { data: activeClasses } = await supabase
      .from("enrollments")
      .select("class_id, classes!inner(id, name, school_id)")
      .eq("academic_year_id", (term as any).academic_year_id)
      .eq("status", "active")
      .eq("classes.school_id", context.schoolId)

    if (activeClasses) {
      // Deduplicate class IDs
      const seen = new Set<string>()
      classIds = activeClasses
        .map((e: any) => e.class_id)
        .filter((id: string) => {
          if (seen.has(id)) return false
          seen.add(id)
          return true
        })
    }
  }

  // Step 4: Bulk generate invoices for each class
  const { bulkGenerateInvoices } = await import("./invoices")

  const allErrors: Array<{ studentId: string; className: string; error: string }> = []
  let totalStudents = 0
  let totalSuccess = 0

  // Get class names for error reporting
  const { data: classes } = await supabase
    .from("classes")
    .select("id, name")
    .in("id", classIds)

  const classNameMap: Record<string, string> = {}
  for (const cls of classes || []) {
    classNameMap[(cls as any).id] = (cls as any).name
  }

  for (const classId of classIds) {
    try {
      const result = await bulkGenerateInvoices(classId, options.newTermId, {
        includeBoarding: options.includeBoarding,
        includeTransport: options.includeTransport,
        skipBalanceForward: !options.includeBalanceForward,
      })

      totalStudents += result.totalStudents || (result.success.length + result.errors.length)
      totalSuccess += result.success.length

      for (const err of result.errors) {
        allErrors.push({
          studentId: err.studentId,
          className: classNameMap[classId] || classId,
          error: err.error,
        })
      }
    } catch (err: any) {
      allErrors.push({
        studentId: "all",
        className: classNameMap[classId] || classId,
        error: err.message,
      })
    }
  }

  revalidatePath("/dashboard/accountant/fees")
  revalidatePath("/dashboard/accountant/finance")
  revalidatePath("/dashboard")

  return {
    success: true,
    termActivated: true,
    invoiceResults: {
      totalStudents,
      successCount: totalSuccess,
      errorCount: allErrors.length,
      errors: allErrors,
    },
  }
}

/**
 * Preview what the term transition will do before running it.
 * Returns counts of students per class and estimated balances.
 */
export async function previewTermTransition(termId: string) {
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

  // Get term details
  const { data: term } = await supabase
    .from("terms")
    .select("*, academic_years(id, name)")
    .eq("id", termId)
    .eq("school_id", context.schoolId)
    .single()

  if (!term) {
    throw new Error("Term not found")
  }

  // Get current term for comparison
  const { data: currentTerm } = await supabase
    .from("terms")
    .select("*, academic_years(id, name)")
    .eq("school_id", context.schoolId)
    .eq("is_current", true)
    .single()

  // Get all classes with student counts for this academic year
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("class_id, student_id, classes!inner(id, name)")
    .eq("academic_year_id", (term as any).academic_year_id)
    .eq("status", "active")

  // Group by class
  const classMap: Record<string, { name: string; studentCount: number; studentIds: string[] }> = {}
  for (const enrollment of enrollments || []) {
    const classId = (enrollment as any).class_id
    if (!classMap[classId]) {
      classMap[classId] = {
        name: (enrollment as any).classes?.name || "Unknown",
        studentCount: 0,
        studentIds: [],
      }
    }
    classMap[classId].studentCount++
    classMap[classId].studentIds.push((enrollment as any).student_id)
  }

  // Check which students already have invoices for this term
  const { data: existingInvoices } = await supabase
    .from("invoices")
    .select("student_id")
    .eq("term_id", termId)
    .eq("school_id", context.schoolId)
    .neq("status", "cancelled")

  const invoicedStudents = new Set((existingInvoices || []).map((inv: any) => inv.student_id))

  // Count outstanding balances
  const { data: outstandingInvoices } = await supabase
    .from("invoices")
    .select("student_id, amount, discount_amount")
    .eq("school_id", context.schoolId)
    .in("status", ["unpaid", "partial", "overdue"])

  const studentsWithBalance = new Set((outstandingInvoices || []).map((inv: any) => inv.student_id))

  const classSummaries = Object.entries(classMap).map(([classId, data]) => {
    const alreadyInvoiced = data.studentIds.filter((id) => invoicedStudents.has(id)).length
    const withBalance = data.studentIds.filter((id) => studentsWithBalance.has(id)).length

    return {
      classId,
      className: data.name,
      totalStudents: data.studentCount,
      alreadyInvoiced,
      pendingInvoice: data.studentCount - alreadyInvoiced,
      studentsWithOutstandingBalance: withBalance,
    }
  })

  return {
    term: {
      id: (term as any).id,
      name: (term as any).name,
      academicYear: (term as any).academic_years?.name,
      startDate: (term as any).start_date,
      endDate: (term as any).end_date,
      dueDate: (term as any).due_date,
    },
    currentTerm: currentTerm
      ? {
          id: (currentTerm as any).id,
          name: (currentTerm as any).name,
          academicYear: (currentTerm as any).academic_years?.name,
        }
      : null,
    classes: classSummaries.sort((a, b) => a.className.localeCompare(b.className)),
    totals: {
      totalClasses: classSummaries.length,
      totalStudents: classSummaries.reduce((sum, c) => sum + c.totalStudents, 0),
      alreadyInvoiced: classSummaries.reduce((sum, c) => sum + c.alreadyInvoiced, 0),
      pendingInvoice: classSummaries.reduce((sum, c) => sum + c.pendingInvoice, 0),
      studentsWithOutstandingBalance: classSummaries.reduce(
        (sum, c) => sum + c.studentsWithOutstandingBalance,
        0
      ),
    },
  }
}
