import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Bus, Users, MapPin, Route, ChevronRight, Car } from "lucide-react"
import { getTransportStats } from "@/lib/actions/transport"

export default async function TransportDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect("/login")
  }
  
  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }
  
  const { data: stats } = await getTransportStats()
  
  const transportItems = [
    {
      title: "Routes",
      description: "Manage transport routes and stops",
      href: "/dashboard/admin/transport/routes",
      icon: Route,
      color: "from-blue-500 to-indigo-600",
      bgColor: "from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30",
      stats: `${stats?.routes || 0} routes`,
    },
    {
      title: "Vehicles",
      description: "Manage school vehicles and their assignments",
      href: "/dashboard/admin/transport/vehicles",
      icon: Bus,
      color: "from-emerald-500 to-teal-600",
      bgColor: "from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30",
      stats: `${stats?.vehicles || 0} vehicles`,
    },
    {
      title: "Drivers",
      description: "Manage driver information and assignments",
      href: "/dashboard/admin/transport/drivers",
      icon: Users,
      color: "from-purple-500 to-pink-600",
      bgColor: "from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30",
      stats: `${stats?.drivers || 0} drivers`,
    },
    {
      title: "Student Assignments",
      description: "Assign students to transport routes",
      href: "/dashboard/admin/transport/assignments",
      icon: MapPin,
      color: "from-amber-500 to-orange-600",
      bgColor: "from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30",
      stats: `${stats?.activeAssignments || 0} active`,
    },
  ]
  
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-neutral-900 mb-2">
            Transport Management
          </h1>
          <p className="text-lg text-neutral-500">
            Manage school transport routes, vehicles, drivers, and student assignments
          </p>
        </div>
      </div>

      {/* Stats Overview */}
      <Card className="border border-neutral-200 bg-neutral-900 text-white shadow-sm">
        <CardContent className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="text-center">
              <Route className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold">{stats?.routes || 0}</p>
              <p className="text-white/70 text-sm">Routes</p>
            </div>
            <div className="text-center">
              <Bus className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold">{stats?.vehicles || 0}</p>
              <p className="text-white/70 text-sm">Vehicles</p>
            </div>
            <div className="text-center">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold">{stats?.drivers || 0}</p>
              <p className="text-white/70 text-sm">Drivers</p>
            </div>
            <div className="text-center">
              <MapPin className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold">{stats?.activeAssignments || 0}</p>
              <p className="text-white/70 text-sm">Students Assigned</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transport Items Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {transportItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="border border-neutral-200 shadow-sm hover:shadow-md transition-all duration-300 group cursor-pointer h-full">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="p-2 rounded-lg bg-neutral-100 text-neutral-600 group-hover:scale-105 transition-transform">
                    <item.icon className="w-6 h-6" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <CardTitle className="text-xl mb-2 group-hover:text-neutral-900 transition-colors">
                  {item.title}
                </CardTitle>
                <CardDescription className="mb-4">
                  {item.description}
                </CardDescription>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-neutral-500">
                    {item.stats}
                  </span>
                  <ChevronRight className="w-5 h-5 text-neutral-500 group-hover:text-neutral-900 group-hover:translate-x-1 transition-all" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}


