import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { getVehicles, getDrivers } from "@/lib/actions/transport"
import { VehiclesManager } from "@/components/transport/vehicles-manager"

export default async function VehiclesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect("/login")
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }
  
  const [vehiclesResult, driversResult] = await Promise.all([
    getVehicles(),
    getDrivers(),
  ])
  
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Vehicles</h1>
        <p className="text-muted-foreground">
          Manage school vehicles
        </p>
      </div>
      
      <VehiclesManager 
        initialVehicles={vehiclesResult.data || []}
        drivers={driversResult.data || []}
      />
    </div>
  )
}


