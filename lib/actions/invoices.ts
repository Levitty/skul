"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

/**
 * Generate invoice for a student for a specific term.
 *
 * Improvements over the original:
 * 1. Transport fees now pull from the student's actual route assignment
 *    (student_transport table) instead of only checking generic fee_structures.
 * 2. Balance carry-forward: automatically includes a "Balance Brought Forward"
 *    line item for any outstanding debt or credit from previous terms/years.
 * 3. All student services (boarding, transport) and activities are auto-included
 *    based on the student's profile — no need to manually toggle each one.
 */
export async function generateStudentInvoice(
  studentId: string,
  termId: string,
  options?: {
    includeBoarding?: boolean
    includeTransport?: boolean
    activityIds?: string[]
    skipBalanceForward?: boolean
  }
) {
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

  // Verify student belongs to user's school
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("school_id, status, admission_number")
    .eq("id", studentId)
    .single()

  if (studentError || !student || (student as any).school_id !== context.schoolId) {
    throw new Error("Student not found or access denied")
  }

  if ((student as any).status !== "active") {
    throw new Error("Can only generate invoices for active students")
  }

  // Get term details
  const { data: term, error: termError } = await supabase
    .from("terms")
    .select("*, academic_years(id, name)")
    .eq("id", termId)
    .eq("school_id", context.schoolId)
    .single()

  if (termError || !term) {
    throw new Error("Term not found or access denied")
  }

  // Get student's current enrollment for this academic year
  const { data: enrollment, error: enrollmentError } = await supabase
    .from("enrollments")
    .select("class_id")
    .eq("student_id", studentId)
    .eq("academic_year_id", (term as any).academic_year_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  if (enrollmentError || !enrollment) {
    throw new Error("Student is not enrolled in the current academic year")
  }

  // Check if invoice already exists for this student + term
  const { data: existingInvoice } = await supabase
    .from("invoices")
    .select("id")
    .eq("student_id", studentId)
    .eq("term_id", termId)
    .neq("status", "cancelled")
    .single()

  if (existingInvoice) {
    throw new Error("Invoice already exists for this student and term")
  }

  // Get fee structures for this class and term
  const { data: feeStructures } = await supabase
    .from("fee_structures")
    .select("*")
    .eq("school_id", context.schoolId)
    .eq("academic_year_id", (term as any).academic_year_id)
    .eq("is_active", true)
    .or(`class_id.eq.${(enrollment as any).class_id},class_id.is.null`)
    .or(`term_id.eq.${termId},term_id.is.null`)

  // Get student services (boarding/transport flags)
  const { data: studentServices } = await supabase
    .from("student_services")
    .select("*")
    .eq("student_id", studentId)
    .single()

  // Get student activities for this term
  const { data: studentActivities } = await supabase
    .from("student_activities")
    .select("*, activities(id, name, fee_amount)")
    .eq("student_id", studentId)
    .eq("term_id", termId)
    .eq("status", "active")

  // ── Build invoice items ──────────────────────────────────────────────
  const invoiceItems: any[] = []
  let totalAmount = 0

  // 1. Class-based fees (tuition, exam, library, uniform, etc.)
  //    Excludes transport and hostel — those are handled separately below
  const feeStructuresList = feeStructures || []
  const classFees = feeStructuresList.filter(
    (fs: any) =>
      fs.class_id === (enrollment as any).class_id &&
      (fs.term_id === termId || fs.term_id === null) &&
      fs.fee_type !== "transport" &&
      fs.fee_type !== "hostel"
  )

  // Also include school-wide fees (class_id is null) that aren't transport/hostel
  const schoolWideFees = feeStructuresList.filter(
    (fs: any) =>
      fs.class_id === null &&
      (fs.term_id === termId || fs.term_id === null) &&
      fs.fee_type !== "transport" &&
      fs.fee_type !== "hostel"
  )

  for (const fee of [...classFees, ...schoolWideFees]) {
    // Avoid duplicate if a school-wide fee has same name as a class fee
    const alreadyAdded = invoiceItems.some((item) => item.fee_structure_id === (fee as any).id)
    if (alreadyAdded) continue

    invoiceItems.push({
      fee_structure_id: (fee as any).id,
      description: (fee as any).name,
      amount: (fee as any).amount,
    })
    totalAmount += Number((fee as any).amount)
  }

  // 2. Boarding fee — if student has boarding enabled
  if (options?.includeBoarding || (studentServices as any)?.boarding_enabled) {
    const boardingFee = feeStructuresList.find(
      (fs: any) => fs.fee_type === "hostel" && (fs.term_id === termId || fs.term_id === null)
    )
    if (boardingFee) {
      invoiceItems.push({
        fee_structure_id: (boardingFee as any).id,
        description: "Boarding Fee",
        amount: (boardingFee as any).amount,
      })
      totalAmount += Number((boardingFee as any).amount)
    }
  }

  // 3. Transport fee — NEW: pulls from student's actual route assignment first
  if (options?.includeTransport || (studentServices as any)?.transport_enabled) {
    let transportAdded = false

    // Try to get transport fee from student's actual route assignment
    // @ts-ignore - RPC not in generated types
    const { data: transportData } = await supabase.rpc("get_student_transport_fee", {
      p_student_id: studentId,
      p_school_id: context.schoolId,
      p_academic_year_id: (term as any).academic_year_id,
      p_term_id: termId,
    })

    if (transportData) {
      const transport = transportData as any
      invoiceItems.push({
        fee_structure_id: transport.fee_structure_id || null,
        description: transport.description || "Transport Fee",
        amount: transport.amount,
      })
      totalAmount += Number(transport.amount)
      transportAdded = true
    }

    // Fallback: if the RPC doesn't exist yet (migration not run), use the old method
    if (!transportAdded) {
      const transportFee = feeStructuresList.find(
        (fs: any) => fs.fee_type === "transport" && (fs.term_id === termId || fs.term_id === null)
      )
      if (transportFee) {
        invoiceItems.push({
          fee_structure_id: (transportFee as any).id,
          description: "Transport Fee",
          amount: (transportFee as any).amount,
        })
        totalAmount += Number((transportFee as any).amount)
      }
    }
  }

  // 4. Activity fees
  const studentActivitiesList = studentActivities || []
  const activitiesToInclude =
    options?.activityIds || studentActivitiesList.map((sa: any) => (sa as any).activity_id) || []
  for (const activityId of activitiesToInclude) {
    const activity = studentActivitiesList.find((sa: any) => (sa as any).activity_id === activityId)
    if ((activity as any)?.activities) {
      invoiceItems.push({
        fee_structure_id: null,
        description: (activity as any).activities.name,
        amount: (activity as any).activities.fee_amount,
      })
      totalAmount += Number((activity as any).activities.fee_amount)
    }
  }

  // 5. Balance brought forward from previous terms/years
  let balanceBroughtForward = 0
  if (!options?.skipBalanceForward) {
    // @ts-ignore - RPC not in generated types
    const { data: balanceData } = await supabase.rpc("get_student_balance", {
      p_student_id: studentId,
      p_school_id: context.schoolId,
      p_exclude_term_id: termId, // Exclude the current term we're generating for
    })

    if (balanceData && Number(balanceData) !== 0) {
      balanceBroughtForward = Number(balanceData)
      const isDebt = balanceBroughtForward > 0

      invoiceItems.push({
        fee_structure_id: null,
        description: isDebt
          ? "Balance Brought Forward (Outstanding)"
          : "Balance Brought Forward (Credit)",
        amount: balanceBroughtForward, // Positive = owes, negative = credit applied
      })
      totalAmount += balanceBroughtForward
    }
  }

  if (invoiceItems.length === 0) {
    throw new Error("No fee structures found for this student and term")
  }

  // Ensure total is never negative (credit exceeds new fees)
  if (totalAmount < 0) {
    totalAmount = 0
  }

  // Generate invoice reference
  const termData = term as any
  const academicYearName = termData.academic_years?.name || "AY"
  const termName = termData.name || "Term"
  const studentAdmission = (student as any).admission_number || studentId.slice(0, 8)
  const uniqueSuffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const invoiceRef = `INV-${academicYearName}-${termName}-${studentAdmission}-${uniqueSuffix}`

  // @ts-ignore - chart_of_accounts table may not be in generated types
  const { data: arAccount } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("school_id", context.schoolId)
    .eq("account_code", "1200")
    .single()

  // Prepare items JSON for atomic RPC
  const itemsJson = invoiceItems.map((item) => ({
    fee_structure_id: item.fee_structure_id || "",
    description: item.description,
    amount: item.amount,
  }))

  // @ts-ignore - RPC not in generated types
  const { data: result, error: rpcError } = await supabase.rpc("create_invoice_with_items", {
    p_school_id: context.schoolId,
    p_student_id: studentId,
    p_academic_year_id: termData.academic_year_id,
    p_term_id: termId,
    p_reference: invoiceRef,
    p_amount: totalAmount,
    p_due_date: termData.due_date,
    p_issued_date: new Date().toISOString().split("T")[0],
    p_account_id: (arAccount as any)?.id || null,
    p_items: itemsJson,
  })

  if (rpcError) {
    throw new Error(`Failed to create invoice: ${rpcError.message}`)
  }

  // Update balance_brought_forward on the invoice if applicable
  if (balanceBroughtForward !== 0 && result) {
    const invoiceId = (result as any).invoice_id
    if (invoiceId) {
      // @ts-ignore - column may not be in generated types yet
      await (supabase as any)
        .from("invoices")
        .update({ balance_brought_forward: balanceBroughtForward })
        .eq("id", invoiceId)
    }
  }

  revalidatePath("/dashboard/accountant/fees")
  revalidatePath("/dashboard/accountant/finance")
  revalidatePath(`/dashboard/admin/students/${studentId}`)

  return result
}

/**
 * Bulk generate invoices for all active students in a class for a term.
 *
 * Each student invoice automatically includes:
 * - All mandatory class fees (tuition, exam, library, etc.)
 * - Transport fee from actual route assignment (if student has transport enabled)
 * - Boarding fee (if student has boarding enabled)
 * - Active activity fees for the term
 * - Balance brought forward from previous terms/years
 */
export async function bulkGenerateInvoices(
  classId: string,
  termId: string,
  options?: {
    includeBoarding?: boolean
    includeTransport?: boolean
    skipBalanceForward?: boolean
  }
) {
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

  // Get term to find academic year
  const { data: term } = await supabase
    .from("terms")
    .select("academic_year_id")
    .eq("id", termId)
    .eq("school_id", context.schoolId)
    .single()

  if (!term) {
    throw new Error("Term not found")
  }

  // Get all active students in this class for this academic year
  const { data: enrollments, error: enrollmentsError } = await supabase
    .from("enrollments")
    .select("student_id, students!inner(id, status, school_id)")
    .eq("class_id", classId)
    .eq("academic_year_id", (term as any).academic_year_id)
    .eq("status", "active")
    .eq("students.status", "active")
    .eq("students.school_id", context.schoolId)

  if (enrollmentsError || !enrollments || enrollments.length === 0) {
    throw new Error("No active students found in this class")
  }

  const results = {
    success: [] as string[],
    errors: [] as { studentId: string; error: string }[],
    totalStudents: enrollments.length,
  }

  for (const enrollment of enrollments) {
    try {
      await generateStudentInvoice((enrollment as any).student_id, termId, {
        includeBoarding: options?.includeBoarding,
        includeTransport: options?.includeTransport,
        skipBalanceForward: options?.skipBalanceForward,
      })
      results.success.push((enrollment as any).student_id)
    } catch (err: any) {
      results.errors.push({
        studentId: (enrollment as any).student_id,
        error: err.message,
      })
    }
  }

  revalidatePath("/dashboard/accountant/fees")
  return results
}

/**
 * Get student balance summary — useful for previewing what the balance
 * carry-forward will be before generating an invoice.
 */
export async function getStudentBalanceSummary(studentId: string) {
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

  // Get all invoices with payment totals
  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, amount, status, term_id, discount_amount, terms(name), academic_years(name)")
    .eq("student_id", studentId)
    .eq("school_id", context.schoolId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: true })

  if (!invoices || invoices.length === 0) {
    return { balance: 0, invoices: [], totalInvoiced: 0, totalPaid: 0, totalCredits: 0 }
  }

  // Get all payments for these invoices
  const invoiceIds = invoices.map((inv: any) => inv.id)
  const { data: payments } = await supabase
    .from("payments")
    .select("invoice_id, amount")
    .in("invoice_id", invoiceIds)
    .eq("status", "completed")

  // Get applied credit notes
  const { data: creditNotes } = await supabase
    .from("credit_notes")
    .select("invoice_id, amount")
    .eq("student_id", studentId)
    .eq("school_id", context.schoolId)
    .eq("status", "applied")

  const paymentsByInvoice: Record<string, number> = {}
  for (const p of payments || []) {
    const pid = (p as any).invoice_id
    paymentsByInvoice[pid] = (paymentsByInvoice[pid] || 0) + Number((p as any).amount)
  }

  const creditsByInvoice: Record<string, number> = {}
  for (const c of creditNotes || []) {
    const cid = (c as any).invoice_id
    creditsByInvoice[cid] = (creditsByInvoice[cid] || 0) + Number((c as any).amount)
  }

  let totalInvoiced = 0
  let totalDiscounts = 0
  let totalPaid = 0
  let totalCredits = 0

  const invoiceSummaries = invoices.map((inv: any) => {
    const amount = Number(inv.amount || 0)
    const discount = Number(inv.discount_amount || 0)
    const paid = paymentsByInvoice[inv.id] || 0
    const credits = creditsByInvoice[inv.id] || 0
    const outstanding = amount - discount - paid - credits

    totalInvoiced += amount
    totalDiscounts += discount
    totalPaid += paid
    totalCredits += credits

    return {
      id: inv.id,
      term: inv.terms?.name || "Unknown",
      academicYear: inv.academic_years?.name || "Unknown",
      amount,
      discount,
      paid,
      credits,
      outstanding,
      status: inv.status,
    }
  })

  return {
    balance: totalInvoiced - totalDiscounts - totalPaid - totalCredits,
    invoices: invoiceSummaries,
    totalInvoiced,
    totalDiscounts,
    totalPaid,
    totalCredits,
  }
}
