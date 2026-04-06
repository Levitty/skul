"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

export async function createEnrollment(studentId: string, formData: FormData) {
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
    .select("school_id")
    .eq("id", studentId)
    .single()

  if (studentError || !student || (student as any).school_id !== context.schoolId) {
    throw new Error("Student not found or access denied")
  }

  const academicYearId = formData.get("academic_year_id") as string
  const classId = formData.get("class_id") as string
  const sectionId = formData.get("section_id") as string || null

  // Verify academic year and class belong to school
  const { data: academicYear, error: yearError } = await supabase
    .from("academic_years")
    .select("school_id")
    .eq("id", academicYearId)
    .single()

  const { data: classData, error: classError } = await supabase
    .from("classes")
    .select("school_id")
    .eq("id", classId)
    .single()

  if (yearError || !academicYear || (academicYear as any).school_id !== context.schoolId) {
    throw new Error("Academic year not found or access denied")
  }

  if (classError || !classData || (classData as any).school_id !== context.schoolId) {
    throw new Error("Class not found or access denied")
  }

  // Check if enrollment already exists for this student + academic year
  const { data: existing, error: existingError } = await supabase
    .from("enrollments")
    .select("id")
    .eq("student_id", studentId)
    .eq("academic_year_id", academicYearId)
    .single()

  if (!existingError && existing) {
    // Update existing enrollment
    const { data: enrollment, error } = await supabase
      .from("enrollments")
      // @ts-ignore - Supabase strict type checking
      .update({
        class_id: classId,
        section_id: sectionId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", (existing as any).id)
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    revalidatePath(`/dashboard/admin/students/${studentId}`)
    return enrollment
  } else {
    // Create new enrollment
    const { data: enrollment, error } = await supabase
      .from("enrollments")
      // @ts-ignore - Supabase strict type checking
      .insert({
        student_id: studentId,
        academic_year_id: academicYearId,
        class_id: classId,
        section_id: sectionId,
        enrollment_date: formData.get("enrollment_date") as string || new Date().toISOString().split("T")[0],
      })
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    revalidatePath(`/dashboard/admin/students/${studentId}`)
    return enrollment
  }
}

export async function deleteEnrollment(enrollmentId: string, studentId: string) {
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

  // Verify enrollment belongs to a student in user's school
  const { data: enrollment, error: enrollmentError } = await supabase
    .from("enrollments")
    .select("student_id, students!inner(school_id)")
    .eq("id", enrollmentId)
    .single()

  if (enrollmentError || !enrollment) {
    throw new Error("Enrollment not found or access denied")
  }

  const enrollmentData = enrollment as any
  if (enrollmentData.students?.school_id !== context.schoolId) {
    throw new Error("Enrollment not found or access denied")
  }

  const { error } = await supabase
    .from("enrollments")
    .delete()
    .eq("id", enrollmentId)

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath(`/dashboard/admin/students/${studentId}`)
  return { success: true }
}

export async function getEnrollments(studentId: string) {
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
    .select("school_id")
    .eq("id", studentId)
    .single()

  if (studentError || !student || (student as any).school_id !== context.schoolId) {
    throw new Error("Student not found or access denied")
  }

  const { data: enrollments, error } = await supabase
    .from("enrollments")
    .select(`
      *,
      classes(name, level),
      academic_years(name, start_date, end_date),
      sections(name)
    `)
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return enrollments || []
}


