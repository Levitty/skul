"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

export interface TransferData {
  studentId: string
  transferType: "transfer_in" | "transfer_out"
  fromSchoolId?: string
  toSchoolId?: string
  fromClassId?: string
  toClassId: string
  transferDate: string
  reason?: string
}

export async function transferStudent(data: TransferData) {
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
    // Verify student belongs to this school
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id, school_id, status")
      .eq("id", data.studentId)
      .eq("school_id", context.schoolId)
      .single()

    if (studentError || !student) {
      return { error: "Student not found" }
    }

    // Create transfer record
    const { data: transfer, error: transferError } = await supabase
      .from("student_transfers")
      // @ts-ignore - Supabase strict type checking
      .insert({
        student_id: data.studentId,
        transfer_type: data.transferType,
        from_school_id: data.transferType === "transfer_out" ? context.schoolId : data.fromSchoolId,
        to_school_id: data.transferType === "transfer_in" ? context.schoolId : data.toSchoolId,
        from_class_id: data.fromClassId,
        to_class_id: data.toClassId,
        transfer_date: data.transferDate,
        reason: data.reason,
        status: "completed",
      })
      .select()
      .single()

    if (transferError) {
      throw new Error(transferError.message)
    }

    // Update student status if transferring out
    if (data.transferType === "transfer_out") {
      const { error: updateError } = await supabase
        .from("students")
        // @ts-ignore - Supabase strict type checking
        .update({ status: "transferred" })
        .eq("id", data.studentId)

      if (updateError) {
        console.error("Update student status error:", updateError)
      }

      // Mark enrollments as completed
      const { error: enrollmentError } = await supabase
        .from("enrollments")
        // @ts-ignore - Supabase strict type checking
        .update({ status: "withdrawn" })
        .eq("student_id", data.studentId)
        .eq("status", "active")

      if (enrollmentError) {
        console.error("Update enrollment error:", enrollmentError)
      }
    }

    // If transferring in, create enrollment
    if (data.transferType === "transfer_in") {
      // Get current academic year
      const { data: currentYear, error: yearError } = await supabase
        .from("academic_years")
        .select("id")
        .eq("school_id", context.schoolId)
        .eq("is_current", true)
        .single()

      if (!yearError && currentYear) {
        // @ts-ignore - Supabase strict type checking
        const { error: enrollmentError } = await supabase.from("enrollments").insert({
          student_id: data.studentId,
          class_id: data.toClassId,
          academic_year_id: (currentYear as any).id,
          status: "active",
        })

        if (enrollmentError) {
          console.error("Create enrollment error:", enrollmentError)
        }
      }
    }

    revalidatePath("/dashboard/admin/students")
    revalidatePath("/dashboard/admin/students/transfers")

    return { data: transfer }
  } catch (err: any) {
    console.error("Transfer student error:", err)
    return { error: err.message }
  }
}
