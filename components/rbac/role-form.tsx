"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import { createRole, updateRole } from "@/lib/actions/rbac/roles"
import { Shield } from "lucide-react"

interface RoleFormProps {
  role?: any
  permissions: any[]
  groupedPermissions: Record<string, any[]>
  currentPermissionIds?: string[]
}

export function RoleForm({
  role,
  permissions,
  groupedPermissions,
  currentPermissionIds = [],
}: RoleFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const [name, setName] = useState(role?.name || "")
  const [description, setDescription] = useState(role?.description || "")
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(currentPermissionIds)

  const isEditing = !!role

  const handlePermissionToggle = (permissionId: string, checked: boolean) => {
    if (checked) {
      setSelectedPermissions([...selectedPermissions, permissionId])
    } else {
      setSelectedPermissions(selectedPermissions.filter((id) => id !== permissionId))
    }
  }

  const handleResourceSelectAll = (resource: string, checked: boolean) => {
    const resourcePermIds = groupedPermissions[resource]?.map((p: any) => p.id) || []
    if (checked) {
      setSelectedPermissions([...new Set([...selectedPermissions, ...resourcePermIds])])
    } else {
      setSelectedPermissions(selectedPermissions.filter((id) => !resourcePermIds.includes(id)))
    }
  }

  const isResourceFullySelected = (resource: string) => {
    const resourcePermIds = groupedPermissions[resource]?.map((p: any) => p.id) || []
    return resourcePermIds.every((id: string) => selectedPermissions.includes(id))
  }

  const isResourcePartiallySelected = (resource: string) => {
    const resourcePermIds = groupedPermissions[resource]?.map((p: any) => p.id) || []
    const selected = resourcePermIds.filter((id: string) => selectedPermissions.includes(id))
    return selected.length > 0 && selected.length < resourcePermIds.length
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      toast({
        title: "Error",
        description: "Role name is required",
        variant: "destructive",
      })
      return
    }

    setLoading(true)

    try {
      const data = {
        name: name.trim(),
        description: description.trim(),
        permission_ids: selectedPermissions,
      }

      let result
      if (isEditing) {
        result = await updateRole(role.id, data)
      } else {
        result = await createRole(data)
      }

      if (result.error) {
        throw new Error(result.error)
      }

      toast({
        title: "Success!",
        description: isEditing ? "Role updated successfully" : "Role created successfully",
      })

      router.push("/dashboard/admin/settings/roles")
      router.refresh()
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to save role",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const resourceLabels: Record<string, string> = {
    students: "Students",
    admissions: "Admissions",
    fees: "Fees & Payments",
    attendance: "Attendance",
    grades: "Grades",
    timetable: "Timetable",
    financials: "Financials",
    strategic: "Strategic Analytics",
    settings: "Settings",
    users: "Users",
    roles: "Roles",
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Role Details
            </CardTitle>
            <CardDescription>
              Basic information about the role
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Role Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Class Teacher, Head of Department"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of the role"
              />
            </div>
          </CardContent>
        </Card>

        {/* Permissions */}
        <Card>
          <CardHeader>
            <CardTitle>Permissions</CardTitle>
            <CardDescription>
              Select the permissions for this role ({selectedPermissions.length} selected)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {Object.entries(groupedPermissions).map(([resource, perms]) => (
                <div key={resource} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={`resource-${resource}`}
                        checked={isResourceFullySelected(resource)}
                        onCheckedChange={(checked) =>
                          handleResourceSelectAll(resource, checked as boolean)
                        }
                        className={isResourcePartiallySelected(resource) ? "opacity-50" : ""}
                      />
                      <Label
                        htmlFor={`resource-${resource}`}
                        className="font-semibold cursor-pointer capitalize"
                      >
                        {resourceLabels[resource] || resource}
                      </Label>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {perms.filter((p: any) => selectedPermissions.includes(p.id)).length} / {perms.length}
                    </span>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3 pl-6">
                    {perms.map((perm: any) => (
                      <div key={perm.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`perm-${perm.id}`}
                          checked={selectedPermissions.includes(perm.id)}
                          onCheckedChange={(checked) =>
                            handlePermissionToggle(perm.id, checked as boolean)
                          }
                        />
                        <Label
                          htmlFor={`perm-${perm.id}`}
                          className="text-sm cursor-pointer capitalize"
                        >
                          {perm.action.replace(/_/g, " ")}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : isEditing ? "Update Role" : "Create Role"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </form>
  )
}



