"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

// ── Templates ──

export async function getTemplates() {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)

  const { data, error } = await supabase
    .from("message_templates")
    .select("*")
    .eq("school_id", context.schoolId)
    .order("name")

  if (error) {
    return { error: error.message }
  }

  return { data }
}

export async function createTemplate(data: {
  name: string
  channel: string
  subject?: string
  body: string
  variables?: string
}) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)

  const { data: template, error } = await supabase
    .from("message_templates")
    // @ts-ignore
    .insert({
      school_id: context.schoolId,
      name: data.name,
      channel: data.channel,
      subject: data.subject || null,
      body: data.body,
      variables: data.variables || null,
    } as any)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/communications")
  return { success: true, data: template }
}

export async function updateTemplate(
  id: string,
  data: { name?: string; channel?: string; subject?: string; body?: string; variables?: string }
) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)

  const { data: template, error } = await supabase
    .from("message_templates")
    // @ts-ignore
    .update(data as any)
    .eq("id", id)
    .eq("school_id", context.schoolId)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/communications")
  return { success: true, data: template }
}

export async function deleteTemplate(id: string) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)

  const { error } = await supabase
    .from("message_templates")
    .delete()
    .eq("id", id)
    .eq("school_id", context.schoolId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/communications")
  return { success: true }
}

// ── Campaigns ──

export async function getCampaigns(filters?: { status?: string }) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)

  let query = supabase
    .from("message_campaigns")
    .select("*")
    .eq("school_id", context.schoolId)

  if (filters?.status) {
    query = query.eq("status", filters.status)
  }

  const { data, error } = await query.order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return { data }
}

export async function getCampaign(id: string) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)

  const { data: campaign, error: campaignError } = await supabase
    .from("message_campaigns")
    .select("*")
    .eq("id", id)
    .eq("school_id", context.schoolId)
    .single()

  if (campaignError) {
    return { error: campaignError.message }
  }

  const { data: logs, error: logsError } = await supabase
    .from("message_logs")
    .select("*")
    .eq("campaign_id", id)
    .order("created_at", { ascending: false })

  if (logsError) {
    return { error: logsError.message }
  }

  return { data: { ...(campaign as any), message_logs: logs } }
}

export async function createCampaign(data: {
  name: string
  channel: string
  subject?: string
  body: string
  recipient_type: string
  recipient_filter?: Record<string, any>
  template_id?: string
  scheduled_at?: string
}) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)

  const { data: campaign, error } = await supabase
    .from("message_campaigns")
    // @ts-ignore
    .insert({
      school_id: context.schoolId,
      name: data.name,
      channel: data.channel,
      subject: data.subject || null,
      body: data.body,
      recipient_type: data.recipient_type,
      recipient_filter: data.recipient_filter || null,
      template_id: data.template_id || null,
      scheduled_at: data.scheduled_at || null,
      status: data.scheduled_at ? "scheduled" : "draft",
      created_by: user.id,
      total_recipients: 0,
      sent_count: 0,
      failed_count: 0,
    } as any)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/communications")
  return { success: true, data: campaign }
}

export async function updateCampaign(
  id: string,
  data: Record<string, any>
) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)

  const { data: campaign, error } = await supabase
    .from("message_campaigns")
    // @ts-ignore
    .update(data as any)
    .eq("id", id)
    .eq("school_id", context.schoolId)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/communications")
  return { success: true, data: campaign }
}

export async function sendCampaign(campaignId: string) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)

  const { data: campaign, error: fetchError } = await supabase
    .from("message_campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("school_id", context.schoolId)
    .single()

  if (fetchError || !campaign) {
    return { error: fetchError?.message || "Campaign not found" }
  }

  await (supabase as any)
    .from("message_campaigns")
    .update({ status: "sending" })
    .eq("id", campaignId)

  let recipients: { name: string; phone?: string; email?: string }[] = []

  try {
    const recipientType = (campaign as any).recipient_type
    const recipientFilter = (campaign as any).recipient_filter as Record<string, any> | null

    if (recipientType === "all_parents") {
      const { data: students } = await supabase
        .from("students")
        .select("first_name, last_name, guardians(name, phone, email, is_primary)")
        .eq("school_id", context.schoolId)
        .eq("status", "active")

      recipients = (students || []).map((s: any) => {
        const guardians = (s.guardians as any[]) || []
        const primary = guardians.find((g: any) => g.is_primary) || guardians[0]
        return {
          name: primary?.name || `${s.first_name} ${s.last_name} (Parent)`,
          phone: primary?.phone,
          email: primary?.email,
        }
      })
    } else if (recipientType === "class" && recipientFilter?.class_id) {
      const { data: enrolledStudents } = await supabase
        .from("enrollments")
        .select("students(id, first_name, last_name, guardians(name, phone, email, is_primary))")
        .eq("class_id", recipientFilter.class_id)

      recipients = (enrolledStudents || []).map((e: any) => {
        const st = e.students as any
        if (!st) return { name: "Unknown" }
        const guardians = (st.guardians as any[]) || []
        const primary = guardians.find((g: any) => g.is_primary) || guardians[0]
        return {
          name: primary?.name || `${st.first_name} ${st.last_name} (Parent)`,
          phone: primary?.phone,
          email: primary?.email,
        }
      })
    } else if (recipientType === "staff") {
      const { data: employees } = await supabase
        .from("employees")
        .select("first_name, last_name, phone, email")
        .eq("school_id", context.schoolId)

      recipients = (employees || []).map((e: any) => ({
        name: `${e.first_name} ${e.last_name}`,
        phone: e.phone,
        email: e.email,
      }))
    } else if (recipientType === "individual" && recipientFilter?.recipients) {
      recipients = (recipientFilter.recipients as any[]).map((r: any) => ({
        name: r.name || "Unknown",
        phone: r.phone,
        email: r.email,
      }))
    }

    const channel = (campaign as any).channel
    const logEntries = recipients.map((r) => ({
      campaign_id: campaignId,
      school_id: context.schoolId,
      recipient_name: r.name,
      recipient_phone: channel === "email" ? null : (r.phone || null),
      recipient_email: channel === "sms" ? null : (r.email || null),
      channel: channel,
      status: "sent",
      sent_at: new Date().toISOString(),
    }))

    if (logEntries.length > 0) {
      // @ts-ignore
      await supabase.from("message_logs").insert(logEntries as any)
    }

    // @ts-ignore
    await supabase
      .from("message_campaigns")
      .update({
        status: "sent",
        total_recipients: recipients.length,
        sent_count: recipients.length,
        sent_at: new Date().toISOString(),
      } as any)
      .eq("id", campaignId)
  } catch (err: any) {
    // @ts-ignore
    await supabase
      .from("message_campaigns")
      .update({
        status: "failed",
        failed_count: recipients.length,
      } as any)
      .eq("id", campaignId)

    revalidatePath("/dashboard/admin/communications")
    return { error: err.message || "Failed to send campaign" }
  }

  revalidatePath("/dashboard/admin/communications")
  return { success: true, sent: recipients.length }
}

export async function getMessageLogs(campaignId: string) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  await requireTenantContext(user.id)

  const { data, error } = await supabase
    .from("message_logs")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return { data }
}

export async function getCommunicationStats() {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)

  const { data: campaigns } = await supabase
    .from("message_campaigns")
    .select("id, status, total_recipients, sent_count")
    .eq("school_id", context.schoolId)

  const all = campaigns || []
  const totalCampaigns = all.length
  const sentCampaigns = all.filter((c: any) => c.status === "sent").length
  const totalMessages = all.reduce((sum: number, c: any) => sum + (c.sent_count || 0), 0)

  return {
    data: {
      totalCampaigns,
      sentCampaigns,
      totalMessages,
    },
  }
}
