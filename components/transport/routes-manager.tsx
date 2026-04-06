"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Plus, Pencil, Trash2, Route, MapPin } from "lucide-react"
import { createRoute, updateRoute, deleteRoute } from "@/lib/actions/transport"
import { useRouter } from "next/navigation"

interface RouteData {
  id: string
  name: string
  route_number: string | null
  start_location: string | null
  end_location: string | null
  fee_amount: number
  vehicle_id: string | null
  driver_id: string | null
  departure_time: string | null
  return_time: string | null
  is_active: boolean
  vehicle?: { id: string; plate_number: string; vehicle_type: string } | null
  driver?: { id: string; name: string; phone: string } | null
  stops?: { id: string; stop_name: string; stop_order: number }[]
}

interface RoutesManagerProps {
  initialRoutes: RouteData[]
  vehicles: { id: string; plate_number: string; vehicle_type: string }[]
  drivers: { id: string; name: string }[]
  error?: string | null
}

export function RoutesManager({ initialRoutes, vehicles, drivers, error }: RoutesManagerProps) {
  const router = useRouter()
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [editingRoute, setEditingRoute] = useState<RouteData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  
  const [formData, setFormData] = useState({
    name: "",
    route_number: "",
    start_location: "",
    end_location: "",
    fee_amount: "",
    vehicle_id: "",
    driver_id: "",
    departure_time: "",
    return_time: "",
  })
  
  const resetForm = () => {
    setFormData({
      name: "",
      route_number: "",
      start_location: "",
      end_location: "",
      fee_amount: "",
      vehicle_id: "",
      driver_id: "",
      departure_time: "",
      return_time: "",
    })
  }
  
  const handleAdd = async () => {
    if (!formData.name.trim()) return
    
    setIsLoading(true)
    const fd = new FormData()
    Object.entries(formData).forEach(([key, value]) => {
      if (value) fd.append(key, value)
    })
    
    const result = await createRoute(fd)
    setIsLoading(false)
    
    if (result.error) {
      alert(result.error)
      return
    }
    
    setIsAddDialogOpen(false)
    resetForm()
    router.refresh()
  }
  
  const handleUpdate = async () => {
    if (!editingRoute || !formData.name.trim()) return
    
    setIsLoading(true)
    const fd = new FormData()
    Object.entries(formData).forEach(([key, value]) => {
      if (value) fd.append(key, value)
    })
    
    const result = await updateRoute(editingRoute.id, fd)
    setIsLoading(false)
    
    if (result.error) {
      alert(result.error)
      return
    }
    
    setEditingRoute(null)
    resetForm()
    router.refresh()
  }
  
  const handleDelete = async (routeId: string) => {
    if (!confirm("Are you sure you want to delete this route?")) return
    
    const result = await deleteRoute(routeId)
    if (result.error) {
      alert(result.error)
      return
    }
    router.refresh()
  }
  
  const openEditDialog = (route: RouteData) => {
    setEditingRoute(route)
    setFormData({
      name: route.name,
      route_number: route.route_number || "",
      start_location: route.start_location || "",
      end_location: route.end_location || "",
      fee_amount: route.fee_amount?.toString() || "",
      vehicle_id: route.vehicle_id || "",
      driver_id: route.driver_id || "",
      departure_time: route.departure_time || "",
      return_time: route.return_time || "",
    })
  }
  
  const RouteForm = () => (
    <div className="space-y-4 py-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Route Name *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Route A - City Center"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="route_number">Route Number</Label>
          <Input
            id="route_number"
            value={formData.route_number}
            onChange={(e) => setFormData({ ...formData, route_number: e.target.value })}
            placeholder="e.g., R001"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="start_location">Start Location</Label>
          <Input
            id="start_location"
            value={formData.start_location}
            onChange={(e) => setFormData({ ...formData, start_location: e.target.value })}
            placeholder="Starting point"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="end_location">End Location</Label>
          <Input
            id="end_location"
            value={formData.end_location}
            onChange={(e) => setFormData({ ...formData, end_location: e.target.value })}
            placeholder="End point (school)"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="departure_time">Departure Time</Label>
          <Input
            id="departure_time"
            type="time"
            value={formData.departure_time}
            onChange={(e) => setFormData({ ...formData, departure_time: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="return_time">Return Time</Label>
          <Input
            id="return_time"
            type="time"
            value={formData.return_time}
            onChange={(e) => setFormData({ ...formData, return_time: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="vehicle_id">Vehicle</Label>
          <Select value={formData.vehicle_id} onValueChange={(v) => setFormData({ ...formData, vehicle_id: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Select vehicle" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">None</SelectItem>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.plate_number} ({v.vehicle_type})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="driver_id">Driver</Label>
          <Select value={formData.driver_id} onValueChange={(v) => setFormData({ ...formData, driver_id: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Select driver" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">None</SelectItem>
              {drivers.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="fee_amount">Fee Amount</Label>
        <Input
          id="fee_amount"
          type="number"
          value={formData.fee_amount}
          onChange={(e) => setFormData({ ...formData, fee_amount: e.target.value })}
          placeholder="0.00"
        />
      </div>
    </div>
  )
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Routes</CardTitle>
            <CardDescription>Manage transport routes</CardDescription>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="mr-2 h-4 w-4" />
                Add Route
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add New Route</DialogTitle>
                <DialogDescription>Create a new transport route</DialogDescription>
              </DialogHeader>
              <RouteForm />
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleAdd} disabled={isLoading || !formData.name.trim()}>
                  {isLoading ? "Creating..." : "Create Route"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              Failed to load routes: {error}. If this persists, run the transport module migration.
            </div>
          )}
          {initialRoutes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Route className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>No routes yet. Create your first route to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Route</TableHead>
                  <TableHead>From / To</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Fee</TableHead>
                  <TableHead>Stops</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialRoutes.map((route) => (
                  <TableRow key={route.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{route.name}</div>
                        {route.route_number && (
                          <div className="text-sm text-muted-foreground">{route.route_number}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{route.start_location || "-"}</div>
                        <div className="text-muted-foreground">→ {route.end_location || "-"}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {route.departure_time && <div>Dep: {route.departure_time}</div>}
                        {route.return_time && <div>Ret: {route.return_time}</div>}
                        {!route.departure_time && !route.return_time && "-"}
                      </div>
                    </TableCell>
                    <TableCell>{route.vehicle?.plate_number || "-"}</TableCell>
                    <TableCell>{route.driver?.name || "-"}</TableCell>
                    <TableCell>{route.fee_amount ? `$${route.fee_amount}` : "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {route.stops?.length || 0}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={route.is_active ? "default" : "secondary"}>
                        {route.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(route)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(route.id)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      
      {/* Edit Dialog */}
      <Dialog open={!!editingRoute} onOpenChange={(open: boolean) => !open && setEditingRoute(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Route</DialogTitle>
            <DialogDescription>Update route details</DialogDescription>
          </DialogHeader>
          <RouteForm />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRoute(null)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={isLoading || !formData.name.trim()}>
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}


