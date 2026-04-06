"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"
import { generateStudentInvoice } from "@/lib/actions/invoices"

/**
 * Convert an accepted application to a student, create enrollment, and optionally generate invoice
 * This is the core "Accept & Enroll & Invoice" workflow
 */
export async function acceptAndEnrollApplication(
  applicationId: string,
  options: {
    classId: string
    sectionId?: string
    generateInvoice?: boolean
    boardingEnabled?: boolean
    transportEnabled?: boolean
    transportRouteId?: string
    activities?: string[]
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

  // Verify application exists and is accepted
  const { data: application, error: appError } = await supabase
    .from("applications")
    .select("*")
    .eq("id", applicationId)
    .single()

  if (appError || !application) {
    throw new Error("Application not found or access denied")
  }

  const app = application as any

  if (app.status !== "accepted") {
    throw new Error("Application must be accepted before enrollment")
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

  // Create student record with ALL fields from application
  const studentInsertData: any = {
    school_id: context.schoolId,
    first_name: app.first_name,
    last_name: app.last_name,
    dob: app.dob,
    gender: app.gender,
    status: "active",
    // Copy additional fields from application
    email: app.email || null,
    phone: app.phone || null,
    address: app.address || null,
    extra_notes: app.medical_notes || null, // Store medical notes in extra_notes field
    previous_school_name: app.previous_school_name || null,
    previous_school_address: app.previous_school_address || null,
    previous_school_class: app.previous_school_class || null,
    previous_school_passout_year: app.previous_school_passout_year || null,
  }

  const { data: student, error: studentError } = await supabase
    .from("students")
    .insert(studentInsertData as any)
    .select()
    .single()

  if (studentError || !student) {
    throw new Error(`Failed to create student: ${studentError?.message || "Unknown error"}`)
  }

  const studentData = student as any

  try {
    // Create guardian record
    const { data: guardian, error: guardianError } = await supabase
      .from("guardians")
      .insert({
        student_id: studentData.id,
        name: app.guardian_name,
        relation: "parent",
        phone: app.guardian_phone,
        email: app.guardian_email,
        is_primary: true,
        is_billing_contact: true,
      } as any)
      .select()
      .single()

    if (guardianError || !guardian) {
      throw new Error(`Failed to create guardian: ${guardianError?.message || "Unknown error"}`)
    }

    const guardianData = guardian as any

    // Create enrollment
    const { data: enrollment, error: enrollmentError } = await supabase
      .from("enrollments")
      .insert({
        student_id: studentData.id,
        academic_year_id: (currentYear as any).id,
        class_id: options.classId,
        section_id: options.sectionId || null,
        enrollment_date: new Date().toISOString().split("T")[0],
      } as any)
      .select()
      .single()

    if (enrollmentError || !enrollment) {
      throw new Error(`Failed to create enrollment: ${enrollmentError?.message || "Unknown error"}`)
    }

    // Create student services record if boarding/transport enabled
    let studentServices = null
    if (options.boardingEnabled || options.transportEnabled) {
      const servicesData: any = {
        student_id: studentData.id,
        boarding_enabled: options.boardingEnabled || false,
        transport_enabled: options.transportEnabled || false,
      }
      if (options.transportEnabled && options.transportRouteId) {
        servicesData.transport_route_id = options.transportRouteId
      }
      const { data, error: servicesError } = await supabase
        .from("student_services")
        .insert(servicesData as any)
        .select()
        .single()

      if (servicesError) {
        throw new Error(`Failed to create student services: ${servicesError.message}`)
      }
      studentServices = data
    }

    // Create student activities if provided
    let studentActivities = null
    if (options.activities && options.activities.length > 0) {
      // Get current term for activities
      const { data: currentTerm, error: termError } = await supabase
        .from("terms")
        .select("id")
        .eq("academic_year_id", (currentYear as any).id)
        .eq("is_current", true)
        .single()

      if (!termError && currentTerm) {
        const activityInserts = options.activities.map(activityId => ({
          student_id: studentData.id,
          activity_id: activityId,
          term_id: (currentTerm as any).id,
          status: "active",
        }))

        const { data, error: activitiesError } = await supabase
          .from("student_activities")
          // @ts-ignore - Supabase strict type checking
          .insert(activityInserts)
          .select()

        if (activitiesError) {
          throw new Error(`Failed to create student activities: ${activitiesError.message}`)
        }
        studentActivities = data
      }
    }

    // Generate invoice if requested
    let invoice = null
    if (options.generateInvoice) {
      // Get current term for invoice generation
      const { data: currentTerm, error: termError } = await supabase
        .from("terms")
        .select("id")
        .eq("academic_year_id", (currentYear as any).id)
        .eq("is_current", true)
        .single()

      if (!termError && currentTerm) {
        try {
          invoice = await generateStudentInvoice(
            studentData.id,
            (currentTerm as any).id,
            {
              includeBoarding: options.boardingEnabled,
              includeTransport: options.transportEnabled,
              activityIds: options.activities,
            }
          )
        } catch (invoiceError: any) {
          throw new Error(`Failed to generate invoice: ${invoiceError.message}`)
        }
      }
    }

    // Update application status to note it's been processed
    const admissionUpdateData = {
      notes: `Enrolled as student ${studentData.admission_number || studentData.id}`,
    }
    // @ts-ignore - Supabase strict type checking
    await supabase.from("applications").update(admissionUpdateData).eq("id", applicationId)

    revalidatePath("/dashboard/admin/admissions")
    revalidatePath("/dashboard/admin/students")
    revalidatePath(`/dashboard/admin/students/${studentData.id}`)

    return {
      student: studentData,
      guardian: guardianData,
      enrollment: enrollment as any,
      invoice,
    }
  } catch (error: any) {
    // Rollback: delete student and related records if any step fails
    await supabase.from("students").delete().eq("id", studentData.id)
    throw error
  }
}


