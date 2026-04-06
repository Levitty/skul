"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useState } from "react"
import { createSupplier, updateSupplier, deleteSupplier } from "@/lib/actions/suppliers"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Pencil, Trash2, Plus } from "lucide-react"

interface SuppliersClientProps {
  suppliers: any[]
}

const emptyForm = {
  name: "",
  contact_person: "",
  phone: "",
  email: "",
  address: "",
  tax_id: "",
  notes: "",
  is_active: true,
}

export function SuppliersClient({ suppliers }: SuppliersClientProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState(emptyForm)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const activeCount = suppliers.filter((s) => s.is_active !== false).length

  const openAddDialog = () => {
    setEditingId(null)
    setFormData(emptyForm)
    setDialogOpen(true)
  }

  const openEditDialog = (supplier: any) => {
    setEditingId(supplier.id)
    setFormData({
      name: supplier.name || "",
      contact_person: supplier.contact_person || "",
      phone: supplier.phone || "",
      email: supplier.email || "",
      address: supplier.address || "",
      tax_id: supplier.tax_id || "",
      notes: supplier.notes || "",
      is_active: supplier.is_active !== false,
    })
    setDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Name is required",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)
    try {
      const fd = new FormData()
      fd.append("name", formData.name.trim())
      if (formData.contact_person) fd.append("contact_person", formData.contact_person)
      if (formData.phone) fd.append("phone", formData.phone)
      if (formData.email) fd.append("email", formData.email)
      if (formData.address) fd.append("address", formData.address)
      if (formData.tax_id) fd.append("tax_id", formData.tax_id)
      if (formData.notes) fd.append("notes", formData.notes)
      fd.append("is_active", formData.is_active ? "true" : "false")

      if (editingId) {
        const result = await updateSupplier(editingId, fd)
        if (result.error) throw new Error(result.error)
        toast({
          title: "Success",
          description: "Supplier updated successfully",
        })
      } else {
        const result = await createSupplier(fd)
        if (result.error) throw new Error(result.error)
        toast({
          title: "Success",
          description: "Supplier created successfully",
        })
      }
      router.refresh()
      setDialogOpen(false)
      setFormData(emptyForm)
      setEditingId(null)
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to save supplier",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (supplierId: string, supplierName: string) => {
    if (!confirm(`Are you sure you want to delete "${supplierName}"? This action cannot be undone.`)) return

    try {
      const result = await deleteSupplier(supplierId)
      if (result.error) throw new Error(result.error)
      toast({
        title: "Success",
        description: "Supplier deleted successfully",
      })
      router.refresh()
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to delete supplier",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-0 shadow-xl">
          <CardHeader className="pb-3">
            <CardDescription>Total Suppliers</CardDescription>
            <CardTitle className="text-2xl">{suppliers.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-0 shadow-xl">
          <CardHeader className="pb-3">
            <CardDescription>Active Suppliers</CardDescription>
            <CardTitle className="text-2xl">{activeCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="border-0 shadow-xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Suppliers</CardTitle>
              <CardDescription>Manage supplier contacts and details</CardDescription>
            </div>
            <Button onClick={openAddDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add Supplier
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {suppliers.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-muted-foreground mb-4">No suppliers yet</p>
              <Button onClick={openAddDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Add Supplier
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact Person</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((supplier) => (
                  <TableRow key={supplier.id}>
                    <TableCell className="font-medium">{supplier.name}</TableCell>
                    <TableCell>{supplier.contact_person || "—"}</TableCell>
                    <TableCell>{supplier.phone || "—"}</TableCell>
                    <TableCell>{supplier.email || "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          supplier.is_active !== false
                            ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300"
                            : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                        }
                      >
                        {supplier.is_active !== false ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(supplier)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(supplier.id, supplier.name)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Update supplier details" : "Add a new supplier to your system"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Supplier name"
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contact_person">Contact Person</Label>
                <Input
                  id="contact_person"
                  value={formData.contact_person}
                  onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                  placeholder="Contact name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Phone number"
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
                placeholder="email@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Full address"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tax_id">Tax ID</Label>
              <Input
                id="tax_id"
                value={formData.tax_id}
                onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
                placeholder="Tax/VAT number"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes"
                rows={3}
              />
            </div>
            {editingId && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="is_active" className="cursor-pointer">
                  Active
                </Label>
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : editingId ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
