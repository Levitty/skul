"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

// ============ Get Class Assignments ============

export async function getClassAssignments(
  filterBy?: "class" | "teacher",
  filterId?: string
) {
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
    .from("timetable_entries")
    .select(`
      id,
      class_id,
      subject,
      teacher_id,
      classes(id, name, level),
      employees(id, first_name, last_name, email, position),
      subjects(id, name, code)
    `)
    .eq("classes.school_id", context.schoolId)

  if (filterBy === "class" && filterId) {
    query = query.eq("class_id", filterId)
  } else if (filterBy === "teacher" && filterId) {
    query = query.eq("teacher_id", filterId)
  }

  const { data: assignments, error } = await query
    .order("classes(name)", { ascending: true })

  if (error) {
    return { error: error.message }
  }

  // Remove duplicates based on class_id + subject + teacher_id
  const uniqueAssignments = Array.from(
    new Map(
      (assignments || []).map(a => [
        `${a.class_id}-${a.subject}-${a.teacher_id}`,
        a
      ])
    ).values()
  )

  return { data: uniqueAssignments }
}

// ============ Get Teachers for Assignment ============

export async function getTeachersForAssignment() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const { data: teachers, error } = await supabase
    .from("employees")
    .select("id, first_name, last_name, email, position")
    .eq("school_id", context.schoolId)
    .eq("status", "active")
    .in("position", ["teacher", "Teacher"])
    .order("first_name", { ascending: true })

  if (error) {
    return { error: error.message }
  }

  return { data: teachers || [] }
}

// ============ Get Classes for Assignment ============

export async function getClassesForAssignment() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const { data: classes, error } = await supabase
    .from("classes")
    .select("id, name, level")
    .eq("school_id", context.schoolId)
    .order("level", { ascending: true })

  if (error) {
    return { error: error.message }
  }

  return { data: classes || [] }
}

// ============ Get Subjects for Class ============

export async function getSubjectsForClass(classId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  // Verify class belongs to user's school
  const { data: classData, error: classError } = await supabase
    .from("classes")
    .select("school_id")
    .eq("id", classId)
    .single()

  if (classError || !classData || (classData as any).school_id !== context.schoolId) {
    return { error: "Class not found or access denied" }
  }

  // Get class_subjects
  const { data: classSubjects, error } = await supabase
    .from("class_subjects")
    .select(`
      id,
      subject_id,
      subjects(id, name, code, description)
    `)
    .eq("class_id", classId)
    .order("subjects(name)", { ascending: true })

  if (error) {
    return { error: error.message }
  }

  return { data: classSubjects || [] }
}

// ============ Get All Subjects ============

export async function getSubjectsForAssignment() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const { data: subjects, error } = await supabase
    .from("subjects")
    .select("*")
    .eq("school_id", context.schoolId)
    .eq("is_active", true)
    .order("name", { ascending: true })

  if (error) {
    return { error: error.message }
  }

  return { data: subjects || [] }
}

// ============ Create Class Assignment ============

export async function createClassAssignment(formData: FormData) {
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
  const subject = formData.get("subject") as string
  const teacherId = (formData.get("teacher_id") as string) || null

  if (!classId || !subject) {
    return { error: "Class and Subject are required" }
  }

  // Verify class, subject, and teacher belong to user's school
  const { data: classData, error: classError } = await supabase
    .from("classes")
    .select("school_id")
    .eq("id", classId)
    .single()

  if (classError || !classData || (classData as any).school_id !== context.schoolId) {
    return { error: "Class not found or access denied" }
  }

  if (teacherId) {
    const { data: teacher, error: teacherError } = await supabase
      .from("employees")
      .select("school_id")
      .eq("id", teacherId)
      .single()

    if (teacherError || !teacher || (teacher as any).school_id !== context.schoolId) {
      return { error: "Teacher not found or access denied" }
    }
  }

  // Check for existing assignment
  const { data: existing } = await supabase
    .from("timetable_entries")
    .select("id")
    .eq("class_id", classId)
    .eq("subject", subject)
    .maybeSingle()

  if (existing) {
    return { error: "Assignment already exists for this class and subject" }
  }

  // Create timetable entry (acts as assignment)
  const { data: entry, error } = await supabase
    .from("timetable_entries")
    .insert({
      class_id: classId,
      subject: subject,
      teacher_id: teacherId,
      day_of_week: 1, // Default day
      period_id: null, // Can be null for assignment-only entries
    } as any)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/academic/class-assignments")
  return { success: true, data: entry }
}

// ============ Update Class Assignment ============

export async function updateClassAssignment(assignmentId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const teacherId = (formData.get("teacher_id") as string) || null
  const subject = formData.get("subject") as string

  // Verify assignment exists
  const { data: assignment, error: assignError } = await supabase
    .from("timetable_entries")
    .select("class_id, classes!inner(school_id)")
    .eq("id", assignmentId)
    .single()

  if (assignError || !assignment) {
    return { error: "Assignment not found" }
  }

  const assignData = assignment as any
  if (assignData.classes?.school_id !== context.schoolId) {
    return { error: "Access denied" }
  }

  // Verify teacher if provided
  if (teacherId) {
    const { data: teacher } = await supabase
      .from("employees")
      .select("school_id")
      .eq("id", teacherId)
      .single()

    if (!teacher || (teacher as any).school_id !== context.schoolId) {
      return { error: "Teacher not found or access denied" }
    }
  }

  const { data: updated, error } = await supabase
    .from("timetable_entries")
    .update({
      teacher_id: teacherId,
      subject: subject,
    } as any)
    .eq("id", assignmentId)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/academic/class-assignments")
  return { success: true, data: updated }
}

// ============ Delete Class Assignment ============

export async function deleteClassAssignment(assignmentId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  // Verify assignment exists and belongs to school
  const { data: assignment, error: assignError } = await supabase
    .from("timetable_entries")
    .select("class_id, classes!inner(school_id)")
    .eq("id", assignmentId)
    .single()

  if (assignError || !assignment) {
    return { error: "Assignment not found" }
  }

  const assignData = assignment as any
  if (assignData.classes?.school_id !== context.schoolId) {
    return { error: "Access denied" }
  }

  const { error } = await supabase
    .from("timetable_entries")
    .delete()
    .eq("id", assignmentId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/academic/class-assignments")
  return { success: true }
}

// ============ Get Dashboard Stats ============

export async function getAssignmentStats() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  // Total assignments
  const { data: allAssignments, error: error1 } = await supabase
    .from("timetable_entries")
    .select("id, teacher_id, class_id, subject, classes!inner(school_id)")
    .eq("classes.school_id", context.schoolId)

  if (error1) {
    return { error: error1.message }
  }

  const uniqueAssignments = Array.from(
    new Map(
      (allAssignments || []).map(a => [
        `${a.class_id}-${a.subject}`,
        a
      ])
    ).values()
  )

  // Teachers assigned
  const teachersSet = new Set(
    uniqueAssignments
      .filter(a => a.teacher_id)
      .map(a => a.teacher_id)
  )

  // Classes covered
  const classesSet = new Set(
    uniqueAssignments.map(a => a.class_id)
  )

  // Unassigned subjects
  const unassignedCount = uniqueAssignments.filter(a => !a.teacher_id).length

  return {
    data: {
      totalAssignments: uniqueAssignments.length,
      teachersAssigned: teachersSet.size,
      classesCovered: classesSet.size,
      unassignedSubjects: unassignedCount,
    }
  }
}
