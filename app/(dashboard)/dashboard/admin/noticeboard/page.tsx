import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { getAnnouncements } from "@/lib/actions/announcements"
import { NoticeboardManager } from "@/components/academic/noticeboard-manager"

export default async function NoticeboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect("/login")
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }
  
  const { data: announcements } = await getAnnouncements()
  
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Noticeboard</h1>
        <p className="text-muted-foreground">
          Manage school announcements and notices
        </p>
      </div>
      
      <NoticeboardManager initialAnnouncements={announcements || []} />
    </div>
  )
}


