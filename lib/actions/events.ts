"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

export async function getEvents(filters?: {
  startDate?: string
  endDate?: string
  eventType?: string
}) {
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
    .from("events")
    .select("*")
    .eq("school_id", context.schoolId)
    .eq("is_published", true)
  
  if (filters?.startDate) {
    query = query.gte("start_date", filters.startDate)
  }
  
  if (filters?.endDate) {
    query = query.lte("start_date", filters.endDate)
  }
  
  if (filters?.eventType) {
    query = query.eq("event_type", filters.eventType)
  }
  
  const { data: events, error } = await query.order("start_date", { ascending: true })
  
  if (error) {
    return { error: error.message }
  }
  
  return { data: events }
}

export async function createEvent(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }
  
  const title = formData.get("title") as string
  const description = formData.get("description") as string || null
  const eventType = formData.get("event_type") as string || "general"
  const startDate = formData.get("start_date") as string
  const endDate = formData.get("end_date") as string || null
  const startTime = formData.get("start_time") as string || null
  const endTime = formData.get("end_time") as string || null
  const isAllDay = formData.get("is_all_day") === "true"
  const location = formData.get("location") as string || null
  const venue = formData.get("venue") as string || null
  const organizer = formData.get("organizer") as string || null
  const targetAudience = formData.get("target_audience") as string || "all"
  const color = formData.get("color") as string || "#3b82f6"
  const isPublished = formData.get("is_published") !== "false"
  
  if (!title || !startDate) {
    return { error: "Title and start date are required" }
  }
  
  const { data: event, error } = await supabase
    .from("events")
    // @ts-ignore
    .insert({
      school_id: context.schoolId,
      title,
      description,
      event_type: eventType,
      start_date: startDate,
      end_date: endDate || startDate,
      start_time: startTime,
      end_time: endTime,
      is_all_day: isAllDay,
      location,
      venue,
      organizer,
      target_audience: targetAudience,
      color,
      is_published: isPublished,
      created_by: user.id,
    } as any)
    .select()
    .single()
  
  if (error) {
    return { error: error.message }
  }
  
  revalidatePath("/dashboard/admin/events")
  return { success: true, data: event }
}

export async function updateEvent(eventId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Not authenticated" }
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }
  
  const title = formData.get("title") as string
  const description = formData.get("description") as string || null
  const eventType = formData.get("event_type") as string || "general"
  const startDate = formData.get("start_date") as string
  const endDate = formData.get("end_date") as string || null
  const startTime = formData.get("start_time") as string || null
  const endTime = formData.get("end_time") as string || null
  const isAllDay = formData.get("is_all_day") === "true"
  const location = formData.get("location") as string || null
  const venue = formData.get("venue") as string || null
  const organizer = formData.get("organizer") as string || null
  const targetAudience = formData.get("target_audience") as string || "all"
  const color = formData.get("color") as string || "#3b82f6"
  const isPublished = formData.get("is_published") !== "false"
  
  const { error } = await supabase
    .from("events")
    // @ts-ignore
    .update({
      title,
      description,
      event_type: eventType,
      start_date: startDate,
      end_date: endDate || startDate,
      start_time: startTime,
      end_time: endTime,
      is_all_day: isAllDay,
      location,
      venue,
      organizer,
      target_audience: targetAudience,
      color,
      is_published: isPublished,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", eventId)
    .eq("school_id", context.schoolId)
  
  if (error) {
    return { error: error.message }
  }
  
  revalidatePath("/dashboard/admin/events")
  return { success: true }
}

export async function deleteEvent(eventId: string) {
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
    .from("events")
    .delete()
    .eq("id", eventId)
    .eq("school_id", context.schoolId)
  
  if (error) {
    return { error: error.message }
  }
  
  revalidatePath("/dashboard/admin/events")
  return { success: true }
}


