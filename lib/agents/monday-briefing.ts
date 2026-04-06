/**
 * Monday Morning Briefing Generator
 * Creates weekly executive summary for school management
 */

import { createClient } from "@/lib/supabase/server"
import { WhatsAppClient } from "@/lib/integrations/whatsapp"

export interface MondayBriefing {
  admissionsPulse: {
    newInquiries: number
    newEnrollments: number
    conversionRate: number
  }
  revenueHealth: {
    collected: number
    target: number
    percentage: number
  }
  staffSnapshot: {
    unusualAbsences: number
    gradingBottlenecks: number
  }
  period: {
    start: Date
    end: Date
  }
}

export async function generateMondayBriefing(
  schoolId: string
): Promise<MondayBriefing> {
  const supabase = await createClient()

  // Calculate date range (last 7 days)
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 7)

  // Admissions Pulse
  const { data: newApplications } = await supabase
    .from("applications")
    .select("id")
    .eq("school_id", schoolId)
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString())

  const { data: newEnrollments } = await supabase
    .from("enrollments")
    .select("id")
    .eq("school_id", schoolId)
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString())

  const newInquiries = newApplications?.length || 0
  const enrollments = newEnrollments?.length || 0
  const conversionRate =
    newInquiries > 0 ? (enrollments / newInquiries) * 100 : 0

  // Revenue Health
  // First get invoice IDs for this school
  const { data: invoices } = await supabase
    .from("invoices")
    .select("id")
    .eq("school_id", schoolId)
  
  const invoiceIds = invoices?.map((inv: any) => inv.id) || []
  
  const { data: payments } = invoiceIds.length > 0
    ? await supabase
        .from("payments")
        .select("amount")
        .eq("status", "completed")
        .gte("paid_at", start.toISOString())
        .lte("paid_at", end.toISOString())
        .in("invoice_id", invoiceIds)
    : { data: null }

  const collected =
    payments?.reduce((sum: number, p: any) => sum + Number(p.amount), 0) || 0

  // Placeholder: would get target from settings
  const target = 0
  const percentage = target > 0 ? (collected / target) * 100 : 0

  // Staff Snapshot
  // Placeholder: would check for unusual patterns
  const unusualAbsences = 0
  const gradingBottlenecks = 0

  return {
    admissionsPulse: {
      newInquiries,
      newEnrollments: enrollments,
      conversionRate,
    },
    revenueHealth: {
      collected,
      target,
      percentage,
    },
    staffSnapshot: {
      unusualAbsences,
      gradingBottlenecks,
    },
    period: {
      start,
      end,
    },
  }
}

export function formatBriefingMessage(briefing: MondayBriefing): string {
  return `📊 Monday Morning Briefing

📈 Admissions Pulse
• New Inquiries: ${briefing.admissionsPulse.newInquiries}
• New Enrollments: ${briefing.admissionsPulse.newEnrollments}
• Conversion Rate: ${briefing.admissionsPulse.conversionRate.toFixed(1)}%

💰 Revenue Health
• Collected: KES ${briefing.revenueHealth.collected.toLocaleString()}
• Target: KES ${briefing.revenueHealth.target.toLocaleString()}
• Achievement: ${briefing.revenueHealth.percentage.toFixed(1)}%

👥 Staff Snapshot
• Unusual Absences: ${briefing.staffSnapshot.unusualAbsences}
• Grading Bottlenecks: ${briefing.staffSnapshot.gradingBottlenecks}

Period: ${briefing.period.start.toLocaleDateString()} - ${briefing.period.end.toLocaleDateString()}`
}

export async function sendMondayBriefing(
  schoolId: string,
  recipientPhone: string
): Promise<void> {
  const briefing = await generateMondayBriefing(schoolId)
  const message = formatBriefingMessage(briefing)

  const whatsapp = new WhatsAppClient({
    accountSid: process.env.TWILIO_ACCOUNT_SID!,
    authToken: process.env.TWILIO_AUTH_TOKEN!,
    whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER!,
  })

  await whatsapp.sendMessage({
    to: recipientPhone,
    body: message,
  })
}

