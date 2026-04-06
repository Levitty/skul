"use server"

import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

// ============ Fetch Timetable Slots ============

export async function getTimetableSlots(
  classId: string,
  sectionId?: string,
  academicYearId?: string
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

  const adminClient = createServiceRoleClient()

  // Verify class belongs to user's school
  const { data: classData, error: classError } = await adminClient
    .from("classes")
    .select("school_id")
    .eq("id", classId)
    .single()

  if (classError || !classData || (classData as any).school_id !== context.schoolId) {
    return { error: "Class not found or access denied" }
  }

  let query = adminClient
    .from("timetable_entries")
    .select(`
      *,
      periods(id, name, start_time, end_time, order_index),
      employees(id, first_name, last_name, email),
      rooms(id, name)
    `)
    .eq("class_id", classId)

  if (sectionId) {
    query = query.eq("section_id", sectionId)
  }

  const { data: entries, error } = await query.order("day_of_week", { ascending: true })

  if (error) {
    return { error: error.message }
  }

  return { data: entries }
}

// ============ Get Available Teachers ============

export async function getAvailableTeachers() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  const { data: teachers, error } = await adminClient
    .from("employees")
    .select("id, first_name, last_name, email, position")
    .eq("school_id", context.schoolId)
    .eq("status", "active")
    .order("first_name", { ascending: true })

  if (error) {
    return { error: error.message }
  }

  return { data: teachers }
}

// ============ Get Periods ============

export async function getPeriods() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  const { data: periods, error } = await adminClient
    .from("periods")
    .select("*")
    .eq("school_id", context.schoolId)
    .order("order_index", { ascending: true })

  if (error) {
    return { error: error.message }
  }

  return { data: periods }
}

// ============ Get Rooms ============

export async function getRooms() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  const { data: rooms, error } = await adminClient
    .from("rooms")
    .select("*")
    .eq("school_id", context.schoolId)
    .order("name", { ascending: true })

  if (error) {
    return { error: error.message }
  }

  return { data: rooms }
}

// ============ Get Subjects ============

export async function getSubjects() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  const { data: subjects, error } = await adminClient
    .from("subjects")
    .select("*")
    .eq("school_id", context.schoolId)
    .order("name", { ascending: true })

  if (error) {
    return { error: error.message }
  }

  return { data: subjects }
}

// ============ Create Timetable Slot ============

export async function createTimetableSlot(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  const timetableId = formData.get("timetable_id") as string
  const classId = formData.get("class_id") as string
  const sectionId = (formData.get("section_id") as string) || null
  const periodId = formData.get("period_id") as string
  const dayOfWeek = parseInt(formData.get("day_of_week") as string)
  const subject = (formData.get("subject") as string) || ""
  const teacherId = (formData.get("teacher_id") as string) || null
  const roomId = (formData.get("room_id") as string) || null

  // Verify timetable belongs to user's school
  const { data: timetable, error: timetableError } = await adminClient
    .from("timetables")
    .select("school_id")
    .eq("id", timetableId)
    .single()

  if (timetableError || !timetable || (timetable as any).school_id !== context.schoolId) {
    return { error: "Timetable not found or access denied" }
  }

  // Verify class belongs to school
  const { data: classData, error: classError } = await adminClient
    .from("classes")
    .select("school_id")
    .eq("id", classId)
    .single()

  if (classError || !classData || (classData as any).school_id !== context.schoolId) {
    return { error: "Class not found or access denied" }
  }

  // Verify period belongs to school
  const { data: period, error: periodError } = await adminClient
    .from("periods")
    .select("school_id")
    .eq("id", periodId)
    .single()

  if (periodError || !period || (period as any).school_id !== context.schoolId) {
    return { error: "Period not found or access denied" }
  }

  if (teacherId) {
    const { data: teacher, error: teacherError } = await adminClient
      .from("employees")
      .select("school_id")
      .eq("id", teacherId)
      .single()

    if (teacherError || !teacher || (teacher as any).school_id !== context.schoolId) {
      return { error: "Teacher not found or access denied" }
    }
  }

  if (roomId) {
    const { data: room, error: roomError } = await adminClient
      .from("rooms")
      .select("school_id")
      .eq("id", roomId)
      .single()

    if (roomError || !room || (room as any).school_id !== context.schoolId) {
      return { error: "Room not found or access denied" }
    }
  }

  // Check for duplicate entry
  const { data: existing } = await adminClient
    .from("timetable_entries")
    .select("id")
    .eq("timetable_id", timetableId)
    .eq("class_id", classId)
    .eq("period_id", periodId)
    .eq("day_of_week", dayOfWeek)
    .single()

  if (existing) {
    return { error: "Timetable slot already exists for this day and period" }
  }

  const { data: entry, error } = await adminClient
    .from("timetable_entries")
    // @ts-ignore
    .insert({
      timetable_id: timetableId,
      class_id: classId,
      section_id: sectionId,
      period_id: periodId,
      day_of_week: dayOfWeek,
      subject,
      teacher_id: teacherId,
      room_id: roomId,
    } as any)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/timetable")
  return { success: true, data: entry }
}

// ============ Update Timetable Slot ============

export async function updateTimetableSlot(slotId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  const subject = (formData.get("subject") as string) || ""
  const teacherId = (formData.get("teacher_id") as string) || null
  const roomId = (formData.get("room_id") as string) || null

  // Verify slot belongs to a timetable in user's school
  const { data: slot, error: slotError } = await adminClient
    .from("timetable_entries")
    .select("timetable_id, timetables!inner(school_id)")
    .eq("id", slotId)
    .single()

  if (slotError || !slot) {
    return { error: "Timetable slot not found" }
  }

  const slotData = slot as any
  if (slotData.timetables?.school_id !== context.schoolId) {
    return { error: "Access denied" }
  }

  // Verify teacher and room if provided
  if (teacherId) {
    const { data: teacher } = await adminClient
      .from("employees")
      .select("school_id")
      .eq("id", teacherId)
      .single()

    if (!teacher || (teacher as any).school_id !== context.schoolId) {
      return { error: "Teacher not found or access denied" }
    }
  }

  if (roomId) {
    const { data: room } = await adminClient
      .from("rooms")
      .select("school_id")
      .eq("id", roomId)
      .single()

    if (!room || (room as any).school_id !== context.schoolId) {
      return { error: "Room not found or access denied" }
    }
  }

  const { data: updatedEntry, error } = await adminClient
    .from("timetable_entries")
    // @ts-ignore
    .update({
      subject,
      teacher_id: teacherId,
      room_id: roomId,
    } as any)
    .eq("id", slotId)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/timetable")
  return { success: true, data: updatedEntry }
}

// ============ Delete Timetable Slot ============

export async function deleteTimetableSlot(slotId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  // Verify slot belongs to a timetable in user's school
  const { data: slot, error: slotError } = await adminClient
    .from("timetable_entries")
    .select("timetable_id, timetables!inner(school_id)")
    .eq("id", slotId)
    .single()

  if (slotError || !slot) {
    return { error: "Timetable slot not found" }
  }

  const slotData = slot as any
  if (slotData.timetables?.school_id !== context.schoolId) {
    return { error: "Access denied" }
  }

  const { error } = await adminClient
    .from("timetable_entries")
    .delete()
    .eq("id", slotId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/timetable")
  return { success: true }
}

// ============ Get or Create Timetable ============

export async function getTimetable(academicYearId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  // Verify academic year belongs to school
  const { data: academicYear, error: yearError } = await adminClient
    .from("academic_years")
    .select("school_id")
    .eq("id", academicYearId)
    .single()

  if (yearError || !academicYear || (academicYear as any).school_id !== context.schoolId) {
    return { error: "Academic year not found or access denied" }
  }

  const { data: timetable, error } = await adminClient
    .from("timetables")
    .select("*")
    .eq("academic_year_id", academicYearId)
    .eq("school_id", context.schoolId)
    .single()

  if (error) {
    // If timetable doesn't exist, create one
    const { data: newTimetable, error: createError } = await adminClient
      .from("timetables")
      // @ts-ignore
      .insert({
        school_id: context.schoolId,
        academic_year_id: academicYearId,
        name: `Timetable ${academicYearId.slice(0, 8)}`,
        is_published: false,
      } as any)
      .select()
      .single()

    if (createError) {
      return { error: createError.message }
    }

    return { data: newTimetable }
  }

  return { data: timetable }
}

// ============ Publish Timetable ============

export async function publishTimetable(timetableId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  // Verify timetable belongs to school
  const { data: timetable, error: timetableError } = await adminClient
    .from("timetables")
    .select("school_id")
    .eq("id", timetableId)
    .single()

  if (timetableError || !timetable || (timetable as any).school_id !== context.schoolId) {
    return { error: "Timetable not found or access denied" }
  }

  const { data: updatedTimetable, error } = await adminClient
    .from("timetables")
    // @ts-ignore
    .update({
      is_published: true,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", timetableId)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/timetable")
  return { success: true, data: updatedTimetable }
}
