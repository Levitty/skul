import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { getRoutes, getVehicles, getDrivers } from "@/lib/actions/transport"
import { RoutesManager } from "@/components/transport/routes-manager"

export default async function RoutesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect("/login")
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }
  
  const [routesResult, vehiclesResult, driversResult] = await Promise.all([
    getRoutes(),
    getVehicles(),
    getDrivers(),
  ])
  
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Transport Routes</h1>
        <p className="text-muted-foreground">
          Manage transport routes, stops, and assignments
        </p>
      </div>
      
      <RoutesManager 
        initialRoutes={routesResult.data || []}
        vehicles={vehiclesResult.data || []}
        drivers={driversResult.data || []}
        error={routesResult.error || null}
      />
    </div>
  )
}


