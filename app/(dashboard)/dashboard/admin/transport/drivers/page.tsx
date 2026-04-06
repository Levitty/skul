import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { getDrivers } from "@/lib/actions/transport"
import { DriversManager } from "@/components/transport/drivers-manager"

export default async function DriversPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect("/login")
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }
  
  const { data: drivers } = await getDrivers()
  
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Drivers</h1>
        <p className="text-muted-foreground">
          Manage driver information
        </p>
      </div>
      
      <DriversManager initialDrivers={drivers || []} />
    </div>
  )
}


