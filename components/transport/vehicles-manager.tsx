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
import { Plus, Pencil, Trash2, Bus } from "lucide-react"
import { createVehicle, updateVehicle, deleteVehicle } from "@/lib/actions/transport"
import { useRouter } from "next/navigation"

interface VehicleData {
  id: string
  plate_number: string
  vehicle_type: string
  make: string | null
  model: string | null
  year: number | null
  capacity: number
  color: string | null
  driver_id: string | null
  insurance_expiry: string | null
  is_active: boolean
  driver?: { id: string; name: string; phone: string } | null
}

interface VehiclesManagerProps {
  initialVehicles: VehicleData[]
  drivers: { id: string; name: string }[]
}

export function VehiclesManager({ initialVehicles, drivers }: VehiclesManagerProps) {
  const router = useRouter()
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState<VehicleData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  
  const [formData, setFormData] = useState({
    plate_number: "",
    vehicle_type: "bus",
    make: "",
    model: "",
    year: "",
    capacity: "30",
    color: "",
    driver_id: "",
    insurance_number: "",
    insurance_expiry: "",
    registration_expiry: "",
  })
  
  const resetForm = () => {
    setFormData({
      plate_number: "",
      vehicle_type: "bus",
      make: "",
      model: "",
      year: "",
      capacity: "30",
      color: "",
      driver_id: "",
      insurance_number: "",
      insurance_expiry: "",
      registration_expiry: "",
    })
  }
  
  const handleAdd = async () => {
    if (!formData.plate_number.trim()) return
    
    setIsLoading(true)
    const fd = new FormData()
    Object.entries(formData).forEach(([key, value]) => {
      if (value) fd.append(key, value)
    })
    
    const result = await createVehicle(fd)
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
    if (!editingVehicle || !formData.plate_number.trim()) return
    
    setIsLoading(true)
    const fd = new FormData()
    Object.entries(formData).forEach(([key, value]) => {
      if (value) fd.append(key, value)
    })
    
    const result = await updateVehicle(editingVehicle.id, fd)
    setIsLoading(false)
    
    if (result.error) {
      alert(result.error)
      return
    }
    
    setEditingVehicle(null)
    resetForm()
    router.refresh()
  }
  
  const handleDelete = async (vehicleId: string) => {
    if (!confirm("Are you sure you want to delete this vehicle?")) return
    
    const result = await deleteVehicle(vehicleId)
    if (result.error) {
      alert(result.error)
      return
    }
    router.refresh()
  }
  
  const openEditDialog = (vehicle: VehicleData) => {
    setEditingVehicle(vehicle)
    setFormData({
      plate_number: vehicle.plate_number,
      vehicle_type: vehicle.vehicle_type,
      make: vehicle.make || "",
      model: vehicle.model || "",
      year: vehicle.year?.toString() || "",
      capacity: vehicle.capacity?.toString() || "30",
      color: vehicle.color || "",
      driver_id: vehicle.driver_id || "",
      insurance_number: "",
      insurance_expiry: vehicle.insurance_expiry || "",
      registration_expiry: "",
    })
  }
  
  const VehicleForm = () => (
    <div className="space-y-4 py-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="plate_number">Plate Number *</Label>
          <Input
            id="plate_number"
            value={formData.plate_number}
            onChange={(e) => setFormData({ ...formData, plate_number: e.target.value })}
            placeholder="e.g., KAA 123B"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="vehicle_type">Vehicle Type</Label>
          <Select value={formData.vehicle_type} onValueChange={(v) => setFormData({ ...formData, vehicle_type: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bus">Bus</SelectItem>
              <SelectItem value="minibus">Minibus</SelectItem>
              <SelectItem value="van">Van</SelectItem>
              <SelectItem value="car">Car</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="make">Make</Label>
          <Input
            id="make"
            value={formData.make}
            onChange={(e) => setFormData({ ...formData, make: e.target.value })}
            placeholder="e.g., Toyota"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="model">Model</Label>
          <Input
            id="model"
            value={formData.model}
            onChange={(e) => setFormData({ ...formData, model: e.target.value })}
            placeholder="e.g., Coaster"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="year">Year</Label>
          <Input
            id="year"
            type="number"
            value={formData.year}
            onChange={(e) => setFormData({ ...formData, year: e.target.value })}
            placeholder="e.g., 2020"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="capacity">Capacity (seats)</Label>
          <Input
            id="capacity"
            type="number"
            value={formData.capacity}
            onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="color">Color</Label>
          <Input
            id="color"
            value={formData.color}
            onChange={(e) => setFormData({ ...formData, color: e.target.value })}
            placeholder="e.g., Yellow"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="driver_id">Assigned Driver</Label>
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
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="insurance_expiry">Insurance Expiry</Label>
          <Input
            id="insurance_expiry"
            type="date"
            value={formData.insurance_expiry}
            onChange={(e) => setFormData({ ...formData, insurance_expiry: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="registration_expiry">Registration Expiry</Label>
          <Input
            id="registration_expiry"
            type="date"
            value={formData.registration_expiry}
            onChange={(e) => setFormData({ ...formData, registration_expiry: e.target.value })}
          />
        </div>
      </div>
    </div>
  )
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Vehicles</CardTitle>
            <CardDescription>Manage school vehicles</CardDescription>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="mr-2 h-4 w-4" />
                Add Vehicle
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add New Vehicle</DialogTitle>
                <DialogDescription>Add a new vehicle to the fleet</DialogDescription>
              </DialogHeader>
              <VehicleForm />
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleAdd} disabled={isLoading || !formData.plate_number.trim()}>
                  {isLoading ? "Adding..." : "Add Vehicle"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {initialVehicles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bus className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>No vehicles yet. Add your first vehicle to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plate Number</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Make/Model</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialVehicles.map((vehicle) => (
                  <TableRow key={vehicle.id}>
                    <TableCell className="font-medium">{vehicle.plate_number}</TableCell>
                    <TableCell className="capitalize">{vehicle.vehicle_type}</TableCell>
                    <TableCell>
                      {vehicle.make || vehicle.model 
                        ? `${vehicle.make || ""} ${vehicle.model || ""}`.trim() 
                        : "-"}
                    </TableCell>
                    <TableCell>{vehicle.capacity} seats</TableCell>
                    <TableCell>{vehicle.driver?.name || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={vehicle.is_active ? "default" : "secondary"}>
                        {vehicle.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(vehicle)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(vehicle.id)}>
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
      <Dialog open={!!editingVehicle} onOpenChange={(open: boolean) => !open && setEditingVehicle(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Vehicle</DialogTitle>
            <DialogDescription>Update vehicle details</DialogDescription>
          </DialogHeader>
          <VehicleForm />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingVehicle(null)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={isLoading || !formData.plate_number.trim()}>
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}


