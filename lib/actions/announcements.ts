"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

export async function getAnnouncements(filters?: {
  isPublished?: boolean
  priority?: string
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
    .from("announcements")
    .select("*")
    .eq("school_id", context.schoolId)
  
  if (filters?.isPublished !== undefined) {
    query = query.eq("is_published", filters.isPublished)
  }
  
  if (filters?.priority) {
    query = query.eq("priority", filters.priority)
  }
  
  const { data: announcements, error } = await query
    .order("is_pinned", { ascending: false })
    .order("publish_date", { ascending: false })
  
  if (error) {
    return { error: error.message }
  }
  
  return { data: announcements }
}

export async function createAnnouncement(formData: FormData) {
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
  const content = formData.get("content") as string
  const summary = formData.get("summary") as string || null
  const targetAudience = formData.get("target_audience") as string || "all"
  const priority = formData.get("priority") as string || "normal"
  const publishDate = formData.get("publish_date") as string || new Date().toISOString()
  const expiryDate = formData.get("expiry_date") as string || null
  const isPinned = formData.get("is_pinned") === "true"
  const isPublished = formData.get("is_published") !== "false"
  
  if (!title || !content) {
    return { error: "Title and content are required" }
  }
  
  const { data: announcement, error } = await supabase
    .from("announcements")
    // @ts-ignore
    .insert({
      school_id: context.schoolId,
      title,
      content,
      summary,
      target_audience: targetAudience,
      priority,
      publish_date: publishDate,
      expiry_date: expiryDate,
      is_pinned: isPinned,
      is_published: isPublished,
      created_by: user.id,
    } as any)
    .select()
    .single()
  
  if (error) {
    return { error: error.message }
  }

  // Send WhatsApp broadcast if published and enabled
  if (isPublished && process.env.WHATSAPP_ANNOUNCEMENTS_ENABLED === "true") {
    try {
      const { sendAnnouncement } = await import("@/lib/services/whatsapp-notifications")
      await sendAnnouncement((announcement as any).id, context.schoolId)
    } catch (error) {
      // Don't fail announcement creation if WhatsApp fails
      console.error("Failed to send WhatsApp announcement:", error)
    }
  }
  
  revalidatePath("/dashboard/admin/noticeboard")
  return { success: true, data: announcement }
}

export async function updateAnnouncement(announcementId: string, formData: FormData) {
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
  const content = formData.get("content") as string
  const summary = formData.get("summary") as string || null
  const targetAudience = formData.get("target_audience") as string || "all"
  const priority = formData.get("priority") as string || "normal"
  const publishDate = formData.get("publish_date") as string
  const expiryDate = formData.get("expiry_date") as string || null
  const isPinned = formData.get("is_pinned") === "true"
  const isPublished = formData.get("is_published") !== "false"
  
  // Check if announcement was already published before update
  const { data: oldAnnouncement } = await supabase
    .from("announcements")
    .select("is_published")
    .eq("id", announcementId)
    .single()

  const { data: announcement, error } = await supabase
    .from("announcements")
    // @ts-ignore
    .update({
      title,
      content,
      summary,
      target_audience: targetAudience,
      priority,
      publish_date: publishDate,
      expiry_date: expiryDate,
      is_pinned: isPinned,
      is_published: isPublished,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", announcementId)
    .eq("school_id", context.schoolId)
    .select()
    .single()
  
  if (error) {
    return { error: error.message }
  }

  // Send WhatsApp broadcast if newly published
  if (isPublished && process.env.WHATSAPP_ANNOUNCEMENTS_ENABLED === "true") {
    // Only send if it wasn't published before
    if (!(oldAnnouncement as any)?.is_published) {
      try {
        const { sendAnnouncement } = await import("@/lib/services/whatsapp-notifications")
        await sendAnnouncement(announcementId, context.schoolId)
      } catch (error) {
        // Don't fail announcement update if WhatsApp fails
        console.error("Failed to send WhatsApp announcement:", error)
      }
    }
  }
  
  revalidatePath("/dashboard/admin/noticeboard")
  return { success: true, data: announcement }
}

export async function deleteAnnouncement(announcementId: string) {
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
    .from("announcements")
    .delete()
    .eq("id", announcementId)
    .eq("school_id", context.schoolId)
  
  if (error) {
    return { error: error.message }
  }
  
  revalidatePath("/dashboard/admin/noticeboard")
  return { success: true }
}

