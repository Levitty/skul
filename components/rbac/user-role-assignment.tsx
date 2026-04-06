"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { assignRoleToUser } from "@/lib/actions/rbac/assign-role"

interface UserRoleAssignmentProps {
  userId: string
  currentRoleId: string | null
  roles: Array<{ id: string; name: string }>
}

export function UserRoleAssignment({
  userId,
  currentRoleId,
  roles,
}: UserRoleAssignmentProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [selectedRole, setSelectedRole] = useState(currentRoleId || "none")

  const handleAssign = async () => {
    setLoading(true)

    try {
      const roleId = selectedRole === "none" ? null : selectedRole
      const result = await assignRoleToUser(userId, roleId)

      if (result.error) {
        throw new Error(result.error)
      }

      toast({
        title: "Success!",
        description: "Role assigned successfully",
      })

      router.refresh()
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to assign role",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const hasChanged = (selectedRole === "none" ? null : selectedRole) !== currentRoleId

  return (
    <div className="flex items-center gap-2">
      <Select value={selectedRole} onValueChange={setSelectedRole}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Select custom role" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No custom role</SelectItem>
          {roles.map((role) => (
            <SelectItem key={role.id} value={role.id}>
              {role.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hasChanged && (
        <Button size="sm" onClick={handleAssign} disabled={loading}>
          {loading ? "Saving..." : "Save"}
        </Button>
      )}
    </div>
  )
}



