"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Plus, Pencil, Trash2, Users } from "lucide-react"
import { createDriver, updateDriver, deleteDriver } from "@/lib/actions/transport"
import { useRouter } from "next/navigation"

interface DriverData {
  id: string
  name: string
  phone: string | null
  email: string | null
  license_number: string | null
  license_expiry: string | null
  address: string | null
  emergency_contact: string | null
  emergency_phone: string | null
  is_active: boolean
}

interface DriversManagerProps {
  initialDrivers: DriverData[]
}

export function DriversManager({ initialDrivers }: DriversManagerProps) {
  const router = useRouter()
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [editingDriver, setEditingDriver] = useState<DriverData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    license_number: "",
    license_expiry: "",
    address: "",
    emergency_contact: "",
    emergency_phone: "",
  })
  
  const resetForm = () => {
    setFormData({
      name: "",
      phone: "",
      email: "",
      license_number: "",
      license_expiry: "",
      address: "",
      emergency_contact: "",
      emergency_phone: "",
    })
  }
  
  const handleAdd = async () => {
    if (!formData.name.trim()) return
    
    setIsLoading(true)
    const fd = new FormData()
    Object.entries(formData).forEach(([key, value]) => {
      if (value) fd.append(key, value)
    })
    
    const result = await createDriver(fd)
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
    if (!editingDriver || !formData.name.trim()) return
    
    setIsLoading(true)
    const fd = new FormData()
    Object.entries(formData).forEach(([key, value]) => {
      if (value) fd.append(key, value)
    })
    
    const result = await updateDriver(editingDriver.id, fd)
    setIsLoading(false)
    
    if (result.error) {
      alert(result.error)
      return
    }
    
    setEditingDriver(null)
    resetForm()
    router.refresh()
  }
  
  const handleDelete = async (driverId: string) => {
    if (!confirm("Are you sure you want to delete this driver?")) return
    
    const result = await deleteDriver(driverId)
    if (result.error) {
      alert(result.error)
      return
    }
    router.refresh()
  }
  
  const openEditDialog = (driver: DriverData) => {
    setEditingDriver(driver)
    setFormData({
      name: driver.name,
      phone: driver.phone || "",
      email: driver.email || "",
      license_number: driver.license_number || "",
      license_expiry: driver.license_expiry || "",
      address: driver.address || "",
      emergency_contact: driver.emergency_contact || "",
      emergency_phone: driver.emergency_phone || "",
    })
  }
  
  const DriverForm = () => (
    <div className="space-y-4 py-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Full Name *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Driver's full name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone Number</Label>
          <Input
            id="phone"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            placeholder="+254 XXX XXX XXX"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          placeholder="driver@email.com"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="license_number">License Number</Label>
          <Input
            id="license_number"
            value={formData.license_number}
            onChange={(e) => setFormData({ ...formData, license_number: e.target.value })}
            placeholder="License number"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="license_expiry">License Expiry</Label>
          <Input
            id="license_expiry"
            type="date"
            value={formData.license_expiry}
            onChange={(e) => setFormData({ ...formData, license_expiry: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="address">Address</Label>
        <Input
          id="address"
          value={formData.address}
          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          placeholder="Residential address"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="emergency_contact">Emergency Contact Name</Label>
          <Input
            id="emergency_contact"
            value={formData.emergency_contact}
            onChange={(e) => setFormData({ ...formData, emergency_contact: e.target.value })}
            placeholder="Contact person name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="emergency_phone">Emergency Phone</Label>
          <Input
            id="emergency_phone"
            value={formData.emergency_phone}
            onChange={(e) => setFormData({ ...formData, emergency_phone: e.target.value })}
            placeholder="Emergency phone number"
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
            <CardTitle>Drivers</CardTitle>
            <CardDescription>Manage transport drivers</CardDescription>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="mr-2 h-4 w-4" />
                Add Driver
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add New Driver</DialogTitle>
                <DialogDescription>Add a new driver to the team</DialogDescription>
              </DialogHeader>
              <DriverForm />
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleAdd} disabled={isLoading || !formData.name.trim()}>
                  {isLoading ? "Adding..." : "Add Driver"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {initialDrivers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>No drivers yet. Add your first driver to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>License</TableHead>
                  <TableHead>Emergency Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialDrivers.map((driver) => (
                  <TableRow key={driver.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{driver.name}</div>
                        {driver.email && <div className="text-sm text-muted-foreground">{driver.email}</div>}
                      </div>
                    </TableCell>
                    <TableCell>{driver.phone || "-"}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {driver.license_number || "-"}
                        {driver.license_expiry && (
                          <div className="text-muted-foreground">Exp: {driver.license_expiry}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {driver.emergency_contact || "-"}
                        {driver.emergency_phone && (
                          <div className="text-muted-foreground">{driver.emergency_phone}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={driver.is_active ? "default" : "secondary"}>
                        {driver.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(driver)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(driver.id)}>
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
      <Dialog open={!!editingDriver} onOpenChange={(open: boolean) => !open && setEditingDriver(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Driver</DialogTitle>
            <DialogDescription>Update driver details</DialogDescription>
          </DialogHeader>
          <DriverForm />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingDriver(null)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={isLoading || !formData.name.trim()}>
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}


