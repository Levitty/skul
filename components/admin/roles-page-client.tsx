"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Plus, Edit, Trash2, Users, ChevronDown, X, Shield } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"

interface Permission {
  id: string
  resource: string
  action: string
  description: string
}

interface CustomRole {
  id: string
  school_id: string
  name: string
  description: string | null
  is_system_role: boolean
  created_at: string
  updated_at: string
}

interface RolesPageClientProps {
  customRoles: CustomRole[]
  permissions: Permission[]
  rolePermissionsMap: Record<string, string[]>
  roleUserCounts: Record<string, number>
  schoolId: string
}

const SYSTEM_ROLES = [
  {
    id: "school_admin",
    name: "School Admin",
    description: "Full access to all school modules and settings",
    dot: "bg-indigo-500",
  },
  {
    id: "branch_admin",
    name: "Branch Admin",
    description: "Manages a specific branch",
    dot: "bg-violet-500",
  },
  {
    id: "teacher",
    name: "Teacher",
    description: "Academic management — classes, grades, attendance",
    dot: "bg-blue-500",
  },
  {
    id: "accountant",
    name: "Accountant",
    description: "Financial operations — fees, expenses, reports",
    dot: "bg-emerald-500",
  },
  {
    id: "librarian",
    name: "Librarian",
    description: "Library resource management",
    dot: "bg-cyan-500",
  },
  {
    id: "nurse",
    name: "Nurse",
    description: "Student health and clinic records",
    dot: "bg-rose-500",
  },
  {
    id: "transport_manager",
    name: "Transport Manager",
    description: "Transport routes, vehicles, and assignments",
    dot: "bg-orange-500",
  },
  {
    id: "hostel_manager",
    name: "Hostel Manager",
    description: "Hostel allocation and management",
    dot: "bg-purple-500",
  },
  {
    id: "store_keeper",
    name: "Store Keeper",
    description: "Inventory and sales management",
    dot: "bg-amber-500",
  },
  {
    id: "parent",
    name: "Parent",
    description: "View child's academic and fee information",
    dot: "bg-teal-500",
  },
  {
    id: "student",
    name: "Student",
    description: "Access student portal",
    dot: "bg-green-500",
  },
  {
    id: "super_admin",
    name: "Super Admin",
    description: "Full access to all schools and features",
    dot: "bg-red-500",
  },
]

const RESOURCES = [
  "students",
  "admissions",
  "fees",
  "attendance",
  "grades",
  "timetable",
  "financials",
  "strategic",
  "settings",
  "users",
  "roles",
  "inventory",
  "sales",
  "receipts",
]

const ACTIONS = ["create", "read", "update", "delete", "export", "view_reports"]

const RESOURCE_LABELS: Record<string, string> = {
  students: "Students",
  admissions: "Admissions",
  fees: "Fees & Payments",
  attendance: "Attendance",
  grades: "Grades",
  timetable: "Timetable",
  financials: "Financials",
  strategic: "Strategic Analytics",
  settings: "Settings",
  users: "Users Management",
  roles: "Roles Management",
  inventory: "Inventory",
  sales: "Sales",
  receipts: "Receipts",
}

const ACTION_LABELS: Record<string, string> = {
  create: "Create",
  read: "Read",
  update: "Update",
  delete: "Delete",
  export: "Export",
  view_reports: "View Reports",
}

export default function RolesPageClient({
  customRoles,
  permissions,
  rolePermissionsMap,
  roleUserCounts,
  schoolId,
}: RolesPageClientProps) {
  const { toast } = useToast()
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<CustomRole | null>(null)
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)
  const [deletingRoleId, setDeletingRoleId] = useState<string | null>(null)

  // Form state
  const [roleName, setRoleName] = useState("")
  const [roleDescription, setRoleDescription] = useState("")
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)

  // Group permissions by resource
  const groupedPermissions = useMemo(() => {
    return RESOURCES.reduce(
      (acc, resource) => {
        acc[resource] = permissions.filter((p) => p.resource === resource)
        return acc
      },
      {} as Record<string, Permission[]>
    )
  }, [permissions])

  const handleCreateClick = () => {
    setEditingRole(null)
    setRoleName("")
    setRoleDescription("")
    setSelectedPermissions([])
    setIsCreateModalOpen(true)
  }

  const handleEditClick = (role: CustomRole) => {
    setEditingRole(role)
    setRoleName(role.name)
    setRoleDescription(role.description || "")
    setSelectedPermissions(rolePermissionsMap[role.id] || [])
    setIsCreateModalOpen(true)
  }

  const handlePermissionToggle = (permissionId: string, checked: boolean) => {
    if (checked) {
      setSelectedPermissions([...selectedPermissions, permissionId])
    } else {
      setSelectedPermissions(selectedPermissions.filter((id) => id !== permissionId))
    }
  }

  const handleResourceSelectAll = (resource: string, checked: boolean) => {
    const resourcePermIds = groupedPermissions[resource]?.map((p) => p.id) || []
    if (checked) {
      setSelectedPermissions([...new Set([...selectedPermissions, ...resourcePermIds])])
    } else {
      setSelectedPermissions(selectedPermissions.filter((id) => !resourcePermIds.includes(id)))
    }
  }

  const isResourceFullySelected = (resource: string) => {
    const resourcePermIds = groupedPermissions[resource]?.map((p) => p.id) || []
    return resourcePermIds.length > 0 && resourcePermIds.every((id) => selectedPermissions.includes(id))
  }

  const isResourcePartiallySelected = (resource: string) => {
    const resourcePermIds = groupedPermissions[resource]?.map((p) => p.id) || []
    const selected = resourcePermIds.filter((id) => selectedPermissions.includes(id))
    return selected.length > 0 && selected.length < resourcePermIds.length
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!roleName.trim()) {
      toast({
        title: "Error",
        description: "Role name is required",
        variant: "destructive",
      })
      return
    }

    setIsSaving(true)

    try {
      const url = editingRole ? `/api/admin/roles` : `/api/admin/roles`
      const method = editingRole ? "PUT" : "POST"

      const body = {
        id: editingRole?.id,
        name: roleName.trim(),
        description: roleDescription.trim(),
        permission_ids: selectedPermissions,
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to save role")
      }

      toast({
        title: "Success!",
        description: editingRole ? "Role updated successfully" : "Role created successfully",
      })

      setIsCreateModalOpen(false)
      window.location.reload()
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to save role",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (roleId: string) => {
    const role = customRoles.find((r) => r.id === roleId)
    if (!role) return

    // Check if role has users
    const userCount = roleUserCounts[roleId] || 0
    if (userCount > 0) {
      toast({
        title: "Cannot Delete",
        description: `This role has ${userCount} user${userCount !== 1 ? "s" : ""} assigned. Please reassign them first.`,
        variant: "destructive",
      })
      return
    }

    setDeletingRoleId(roleId)
    setIsDeleting(true)

    try {
      const response = await fetch(`/api/admin/roles`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: roleId }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to delete role")
      }

      toast({
        title: "Success!",
        description: "Role deleted successfully",
      })

      window.location.reload()
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to delete role",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
      setDeletingRoleId(null)
    }
  }

  const toggleRoleExpansion = (roleId: string) => {
    const newExpanded = new Set(expandedRoles)
    if (newExpanded.has(roleId)) {
      newExpanded.delete(roleId)
    } else {
      newExpanded.add(roleId)
    }
    setExpandedRoles(newExpanded)
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Roles & Permissions</h1>
          <p className="text-neutral-500 mt-1">
            Manage system and custom roles with granular permission control
          </p>
        </div>
        <Button onClick={handleCreateClick} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4" />
          Create Role
        </Button>
      </div>

      {/* System Roles Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">System Roles</h2>
          <p className="text-sm text-neutral-500 mt-1">
            Built-in roles that cannot be modified
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {SYSTEM_ROLES.map((role) => (
            <div
              key={role.id}
              className="rounded-xl border border-neutral-200/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3 flex-1">
                  <div className={`w-3 h-3 rounded-full ${role.dot}`} />
                  <h3 className="font-semibold text-neutral-900 text-sm">{role.name}</h3>
                </div>
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">{role.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Custom Roles Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">Custom Roles</h2>
          <p className="text-sm text-neutral-500 mt-1">
            Create and manage custom roles specific to your school
          </p>
        </div>

        {customRoles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50/50 p-8 text-center">
            <Shield className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
            <h3 className="font-semibold text-neutral-900 mb-1">No custom roles yet</h3>
            <p className="text-sm text-neutral-500 mb-4">
              Create custom roles to assign specific permissions to your users
            </p>
            <Button onClick={handleCreateClick} variant="outline" className="gap-2">
              <Plus className="w-4 h-4" />
              Create Your First Role
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {customRoles.map((role) => {
              const isExpanded = expandedRoles.has(role.id)
              const userCount = roleUserCounts[role.id] || 0
              const rolePerms = rolePermissionsMap[role.id] || []

              return (
                <div
                  key={role.id}
                  className="rounded-xl border border-neutral-200/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden"
                >
                  {/* Role Header */}
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-3 h-3 rounded-full bg-emerald-500"
                          />
                          <div>
                            <h3 className="font-semibold text-neutral-900">{role.name}</h3>
                            <p className="text-sm text-neutral-600 mt-1">
                              {role.description || "No description"}
                            </p>
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="flex items-center gap-6 mt-3 ml-6">
                          <div className="text-xs">
                            <span className="text-neutral-500">Permissions: </span>
                            <span className="font-semibold text-neutral-900">{rolePerms.length}</span>
                          </div>
                          <div className="flex items-center gap-1 text-xs">
                            <Users className="w-3 h-3 text-neutral-400" />
                            <span className="text-neutral-500">Users: </span>
                            <span className="font-semibold text-neutral-900">{userCount}</span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleRoleExpansion(role.id)}
                          className="text-neutral-500 hover:text-neutral-900"
                        >
                          <ChevronDown
                            className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditClick(role)}
                          className="text-neutral-500 hover:text-neutral-900"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(role.id)}
                          disabled={isDeleting && deletingRoleId === role.id}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && rolePerms.length > 0 && (
                    <div className="border-t border-neutral-100 bg-neutral-50 p-4">
                      <div className="text-xs font-semibold text-neutral-900 mb-3">
                        Assigned Permissions
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {rolePerms.map((permId) => {
                          const perm = permissions.find((p) => p.id === permId)
                          if (!perm) return null
                          return (
                            <div
                              key={permId}
                              className="flex items-center gap-2 text-xs bg-white border border-neutral-200 rounded px-2 py-1.5"
                            >
                              <div className="w-2 h-2 rounded-full bg-emerald-500" />
                              <span className="text-neutral-700">
                                {RESOURCE_LABELS[perm.resource]} • {ACTION_LABELS[perm.action]}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRole ? "Edit Role" : "Create New Role"}
            </DialogTitle>
            <DialogDescription>
              {editingRole
                ? "Update the role name, description, and permissions"
                : "Create a new custom role and assign specific permissions"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="role-name" className="text-sm font-semibold">
                  Role Name *
                </Label>
                <Input
                  id="role-name"
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  placeholder="e.g., Class Teacher, Head of Department"
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="role-description" className="text-sm font-semibold">
                  Description
                </Label>
                <Input
                  id="role-description"
                  value={roleDescription}
                  onChange={(e) => setRoleDescription(e.target.value)}
                  placeholder="Brief description of this role"
                  className="mt-2"
                />
              </div>
            </div>

            {/* Permissions Grid */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-neutral-900 mb-4">
                  Permissions
                </h3>

                <div className="space-y-3">
                  {RESOURCES.map((resource) => {
                    const resourcePerms = groupedPermissions[resource] || []
                    const isFullySelected = isResourceFullySelected(resource)
                    const isPartiallySelected = isResourcePartiallySelected(resource)

                    return (
                      <div key={resource} className="border border-neutral-200 rounded-lg p-4 bg-white">
                        {/* Resource Header */}
                        <div className="flex items-center gap-3 mb-3">
                          <Checkbox
                            id={`resource-${resource}`}
                            checked={isFullySelected ? true : isPartiallySelected ? "indeterminate" : false}
                            onCheckedChange={(checked) =>
                              handleResourceSelectAll(resource, checked as boolean)
                            }
                          />
                          <label
                            htmlFor={`resource-${resource}`}
                            className="text-sm font-semibold text-neutral-900 cursor-pointer"
                          >
                            {RESOURCE_LABELS[resource] || resource}
                          </label>
                          <span className="text-xs text-neutral-500 ml-auto">
                            {resourcePerms.length} actions
                          </span>
                        </div>

                        {/* Resource Permissions */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 ml-6">
                          {resourcePerms.map((perm) => (
                            <div
                              key={perm.id}
                              className="flex items-center gap-2"
                            >
                              <Checkbox
                                id={perm.id}
                                checked={selectedPermissions.includes(perm.id)}
                                onCheckedChange={(checked) =>
                                  handlePermissionToggle(perm.id, checked as boolean)
                                }
                              />
                              <label
                                htmlFor={perm.id}
                                className="text-sm text-neutral-700 cursor-pointer"
                              >
                                {ACTION_LABELS[perm.action] || perm.action}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateModalOpen(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSaving || !roleName.trim()}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {isSaving ? "Saving..." : editingRole ? "Update Role" : "Create Role"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
