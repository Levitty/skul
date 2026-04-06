import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { CommunicationsClient } from "@/components/communications/communications-client"

export default async function CommunicationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }

  const [campaignsRes, templatesRes, classesRes] = await Promise.all([
    supabase
      .from("message_campaigns")
      .select("*")
      .eq("school_id", context.schoolId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("message_templates")
      .select("*")
      .eq("school_id", context.schoolId)
      .order("name"),
    supabase
      .from("classes")
      .select("id, name, section")
      .eq("school_id", context.schoolId)
      .order("name"),
  ])

  return (
    <CommunicationsClient
      initialCampaigns={campaignsRes.data || []}
      initialTemplates={templatesRes.data || []}
      classes={classesRes.data || []}
    />
  )
}
