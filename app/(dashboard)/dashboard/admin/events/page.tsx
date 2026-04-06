import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { getEvents } from "@/lib/actions/events"
import { EventsManager } from "@/components/academic/events-manager"

export default async function EventsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect("/login")
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }
  
  const { data: events } = await getEvents()
  
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">School Events</h1>
        <p className="text-muted-foreground">
          Manage school events and calendar
        </p>
      </div>
      
      <EventsManager initialEvents={events || []} />
    </div>
  )
}


