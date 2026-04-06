"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

export interface PromoteData {
  studentIds: string[]
  fromAcademicYearId: string
  toAcademicYearId: string
  fromClassId: string
  toClassId: string
  toSectionId?: string
}

export async function promoteStudents(data: PromoteData) {
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

  const results: Array<{ studentId: string; success: boolean; error?: string }> = []

  for (const studentId of data.studentIds) {
    try {
      // Verify student belongs to this school
      const { data: student, error: studentError } = await supabase
        .from("students")
        .select("id, school_id")
        .eq("id", studentId)
        .eq("school_id", context.schoolId)
        .single()

      if (studentError || !student) {
        results.push({ studentId, success: false, error: "Student not found" })
        continue
      }

      // Mark old enrollment as completed
      const { error: updateError } = await supabase
        .from("enrollments")
        // @ts-ignore - Supabase strict type checking
        .update({ status: "completed" })
        .eq("student_id", studentId)
        .eq("academic_year_id", data.fromAcademicYearId)
        .eq("class_id", data.fromClassId)

      if (updateError) {
        console.error("Update enrollment error:", updateError)
      }

      // Create new enrollment
      // @ts-ignore - Supabase strict type checking
      const { error: enrollError } = await supabase.from("enrollments").insert({
        student_id: studentId,
        class_id: data.toClassId,
        section_id: data.toSectionId || null,
        academic_year_id: data.toAcademicYearId,
        status: "active",
      })

      if (enrollError) {
        results.push({ studentId, success: false, error: enrollError.message })
        continue
      }

      results.push({ studentId, success: true })
    } catch (err: any) {
      results.push({ studentId, success: false, error: err.message })
    }
  }

  revalidatePath("/dashboard/admin/students")
  revalidatePath("/dashboard/admin/students/promote")

  return { results }
}
