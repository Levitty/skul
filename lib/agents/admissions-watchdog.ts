/**
 * Admissions Watchdog
 * Monitors application status and alerts if stuck
 */

import { createClient } from "@/lib/supabase/server"
import { WhatsAppClient } from "@/lib/integrations/whatsapp"

export interface StuckApplication {
  id: string
  studentName: string
  guardianPhone: string
  status: string
  daysStuck: number
  createdAt: Date
}

/**
 * Find applications that have been stuck for more than 48 hours
 */
export async function findStuckApplications(
  schoolId: string,
  thresholdHours: number = 48
): Promise<StuckApplication[]> {
  const supabase = await createClient()

  const thresholdDate = new Date()
  thresholdDate.setHours(thresholdDate.getHours() - thresholdHours)

  // Get applications that are still pending/reviewed and haven't been updated
  const { data: applications } = await supabase
    .from("applications")
    .select("*")
    .eq("school_id", schoolId)
    .in("status", ["pending", "reviewed"])
    .lte("updated_at", thresholdDate.toISOString())

  if (!applications) {
    return []
  }

  return applications.map((app: any) => {
    const daysStuck = Math.floor(
      (Date.now() - new Date(app.updated_at).getTime()) / (1000 * 60 * 60 * 24)
    )

    return {
      id: app.id,
      studentName: `${app.first_name} ${app.last_name}`,
      guardianPhone: app.guardian_phone,
      status: app.status,
      daysStuck,
      createdAt: new Date(app.created_at),
    }
  })
}

/**
 * Send alert for stuck applications
 */
export async function alertStuckApplications(
  schoolId: string,
  recipientPhone: string
): Promise<void> {
  const stuckApps = await findStuckApplications(schoolId)

  if (stuckApps.length === 0) {
    return
  }

  const message = `⚠️ Admissions Alert

${stuckApps.length} application(s) have been stuck for more than 48 hours:

${stuckApps
  .map(
    (app) =>
      `• ${app.studentName} - ${app.status} (${app.daysStuck} days)`
  )
  .join("\n")}

Please review and take action.`

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

