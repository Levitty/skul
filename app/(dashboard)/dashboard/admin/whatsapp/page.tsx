import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { WhatsAppDashboardClient } from "@/components/whatsapp/whatsapp-dashboard-client"
import { getPhoneSetupStatus, checkWhatsAppConfiguration } from "@/lib/actions/whatsapp-setup"

export default async function WhatsAppPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }

  // Get phone setup status and WhatsApp configuration
  let phoneStatus
  let whatsappConfig
  
  try {
    phoneStatus = await getPhoneSetupStatus()
    whatsappConfig = await checkWhatsAppConfiguration()
  } catch (error: any) {
    console.error("Error loading WhatsApp status:", error)
    // If there's an error (e.g., migration not run), use defaults
    whatsappConfig = await checkWhatsAppConfiguration()
    phoneStatus = {
      success: true,
      phone: null,
      verified: false,
      whatsappConfigured: whatsappConfig.configured,
      missingEnvVars: whatsappConfig.missing,
    }
  }

  // Get notification stats
  const { data: notifications } = await supabase
    .from("whatsapp_notification_queue")
    .select("status, created_at")
    .eq("school_id", context.schoolId)
    .order("created_at", { ascending: false })
    .limit(100)

  // Get chatbot sessions
  const { data: sessions } = await supabase
    .from("whatsapp_chatbot_sessions")
    .select(`
      *,
      whatsapp_chatbot_messages(count)
    `)
    .eq("school_id", context.schoolId)
    .order("last_interaction_at", { ascending: false })
    .limit(50)

  // Calculate stats
  const stats = {
    total: notifications?.length || 0,
    sent: notifications?.filter((n: any) => n.status === "sent").length || 0,
    delivered:
      notifications?.filter((n: any) => n.status === "delivered").length || 0,
    failed: notifications?.filter((n: any) => n.status === "failed").length || 0,
    pending: notifications?.filter((n: any) => n.status === "pending").length || 0,
    activeSessions: sessions?.filter((s: any) => s.session_state === "active").length || 0,
  }

  return (
    <WhatsAppDashboardClient
      notifications={notifications || []}
      sessions={sessions || []}
      stats={stats}
      phoneStatus={phoneStatus.success ? {
        phone: phoneStatus.phone,
        verified: phoneStatus.verified,
      } : null}
      whatsappConfigured={whatsappConfig.configured}
      missingEnvVars={whatsappConfig.missing}
    />
  )
}

