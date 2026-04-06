"use server"

import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

export interface GuardianData {
  name: string
  relation: string
  phone: string
  email?: string
  occupation?: string
  is_primary: boolean
  is_billing_contact: boolean
}

export interface EmergencyContactData {
  name: string
  relation: string
  phone: string
  email?: string
  address?: string
  is_primary: boolean
}

export interface EnhancedStudentData {
  // Personal Details
  first_name: string
  last_name: string
  middle_name?: string
  dob?: string
  gender?: string
  religion?: string
  blood_group?: string
  address?: string
  phone?: string
  email?: string
  city?: string
  country?: string
  extra_notes?: string
  dob_in_words?: string
  birth_place?: string

  // Previous School
  previous_school_name?: string
  previous_school_address?: string
  previous_school_class?: string
  previous_school_passout_year?: number

  // Admission Details
  admission_date?: string
  class_id: string
  section_id?: string

  // Subjects & Activities
  subject_ids?: string[]
  activity_ids?: string[]

  // Guardians & Emergency Contacts
  guardians: GuardianData[]
  emergency_contacts?: EmergencyContactData[]

  // Transport & Hostel
  transport_route_id?: string
  hostel_id?: string
  boarding_enabled?: boolean
  transport_enabled?: boolean

  // Fee Structure
  selected_fee_structure_ids?: string[]
  generate_invoice?: boolean
  term_id?: string

  // Login
  login_option?: "disallow" | "existing" | "new"
  new_user_email?: string
  new_user_password?: string

  // Status
  status?: "active" | "inactive"
}

export async function createStudentWithFullDetails(data: EnhancedStudentData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Unauthorized" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context found" }
  }

  try {
    const warnings: string[] = []
    // Use service role client to bypass RLS for admin operations
    const adminClient = createServiceRoleClient()

    // 1. Create the student
    const studentData: any = {
      school_id: context.schoolId,
      first_name: data.first_name,
      last_name: data.last_name,
      dob: data.dob || null,
      gender: data.gender,
      status: data.status || "active",
    }

    if (data.middle_name) studentData.middle_name = data.middle_name
    if (data.religion) studentData.religion = data.religion
    if (data.blood_group) studentData.blood_group = data.blood_group
    if (data.address) studentData.address = data.address
    if (data.phone) studentData.phone = data.phone
    if (data.email) studentData.email = data.email
    if (data.city) studentData.city = data.city
    if (data.country) studentData.country = data.country
    if (data.extra_notes) studentData.extra_notes = data.extra_notes
    if (data.dob_in_words) studentData.dob_in_words = data.dob_in_words
    if (data.birth_place) studentData.birth_place = data.birth_place
    if (data.previous_school_name) studentData.previous_school_name = data.previous_school_name
    if (data.previous_school_address) studentData.previous_school_address = data.previous_school_address
    if (data.previous_school_class) studentData.previous_school_class = data.previous_school_class
    if (data.previous_school_passout_year) studentData.previous_school_passout_year = data.previous_school_passout_year
    if (data.admission_date) studentData.admission_date = data.admission_date

    const { data: student, error: studentError } = await adminClient
      .from("students")
      // @ts-ignore - Supabase strict type checking
      .insert(studentData)
      .select()
      .single()

    if (studentError || !student) {
      if (studentError?.message?.includes("column") && studentError?.message?.includes("does not exist")) {
        throw new Error(
          `Database schema mismatch: ${studentError.message}. Please run the migration to add missing columns.`
        )
      }
      throw new Error(studentError?.message || "Failed to create student")
    }

    const studentRecord = student as any

    // 2. Create guardians (non-blocking — collect warning on failure)
    const guardiansInput =
      (data.guardians || []).filter(
        (g) => (g?.name && g.name.trim().length > 0) || (g?.phone && g.phone.trim().length > 0)
      ) || []

    if (guardiansInput.length > 0) {
      const guardiansToInsert = guardiansInput.map((g) => ({
        student_id: studentRecord.id,
        name: (g.name || "").trim(),
        relation: (g.relation || "parent").trim(),
        phone: (g.phone || "").trim(),
        email: g.email || null,
        is_primary: Boolean(g.is_primary),
        is_billing_contact: Boolean(g.is_billing_contact),
      }))

      const { error: guardianError } = await adminClient
        .from("guardians")
        // @ts-ignore - Supabase strict type checking
        .insert(guardiansToInsert)

      if (guardianError) {
        console.error("Guardian creation error:", guardianError)
        warnings.push(`Guardians could not be saved (${guardianError.code || "RLS"}). You can add them manually later.`)
      }
    }

    // 3. Emergency contacts — table may not exist yet, skip gracefully
    // TODO: Create emergency_contacts table via migration when needed

    // 4. Create enrollment (critical — but don't abort)
    const { data: currentYear, error: yearError } = await adminClient
      .from("academic_years")
      .select("id")
      .eq("school_id", context.schoolId)
      .eq("is_current", true)
      .single()

    if (!yearError && currentYear && data.class_id) {
      // @ts-ignore - Supabase strict type checking
      const { error: enrollmentError } = await adminClient.from("enrollments").insert({
        student_id: studentRecord.id,
        class_id: data.class_id,
        section_id: data.section_id || null,
        academic_year_id: (currentYear as any).id,
      })

      if (enrollmentError) {
        console.error("Enrollment creation error:", enrollmentError)
        warnings.push(`Enrollment could not be saved (${enrollmentError.code || "unknown"}). Please enroll the student manually.`)
      }
    }

    // 5. Student services — table may not exist yet, skip gracefully
    // TODO: Create student_services table via migration when needed

    // 6. Student activities — table may not exist yet, skip gracefully
    // TODO: Create student_activities table via migration when needed

    // 7. Generate invoice if requested
    if (data.generate_invoice && data.term_id && data.selected_fee_structure_ids) {
      const { data: feeStructures, error: feeError } = await adminClient
        .from("fee_structures")
        .select("id, amount")
        .in("id", data.selected_fee_structure_ids)

      const feeStructuresList = feeStructures || []
      const totalAmount =
        feeStructuresList.reduce((sum: number, f: any) => sum + (Number(f.amount) || 0), 0)

      // Get term due date
      const { data: term, error: termError } = await adminClient
        .from("terms")
        .select("due_date")
        .eq("id", data.term_id)
        .single()

      if (totalAmount > 0) {
        const invoiceRef = `INV-${Date.now().toString().slice(-6)}`
        // @ts-ignore - Supabase strict type checking
        const { error: invoiceError } = await adminClient.from("invoices").insert({
          school_id: context.schoolId,
          student_id: studentRecord.id,
          academic_year_id: (!yearError && currentYear) ? (currentYear as any).id : null,
          reference: invoiceRef,
          amount: totalAmount,
          status: "unpaid",
          due_date: (!termError && term) ? (term as any).due_date : null,
        })

        if (invoiceError) {
          console.error("Invoice creation error:", invoiceError)
          warnings.push(`Invoice could not be generated (${invoiceError.code || "unknown"}).`)
        }
      }
    }

    revalidatePath("/dashboard/admin/students")
    return { data: { student: studentRecord, warnings } }
  } catch (err: any) {
    console.error("Create student error:", err)
    return { error: err.message }
  }
}
