"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Shield, Mail, Phone, Building2, Save, AlertCircle, CheckCircle } from "lucide-react"
import { GlassCard } from "@/components/ui/glass-card"

interface UserDetailClientProps {
  userSchoolId: string
  userId: string
  fullName: string
  email: string
  phone: string
  role: string
  branchId: string
  customRoleId: string
  isActive: boolean
  branches: Array<{ id: string; name: string }>
  customRoles: Array<{ id: string; name: string }>
  customRoleDetails?: { id: string; name: string } | null
}

const SYSTEM_ROLES = [
  { value: "school_admin", label: "School Admin" },
  { value: "teacher", label: "Teacher" },
  { value: "staff", label: "Staff" },
  { value: "parent", label: "Parent" },
]

const getRoleBadgeColor = (role: string) => {
  const colors: Record<string, { bg: string; text: string }> = {
    school_admin: { bg: "bg-emerald-100", text: "text-emerald-700" },
    super_admin: { bg: "bg-indigo-100", text: "text-indigo-700" },
    teacher: { bg: "bg-blue-100", text: "text-blue-700" },
    staff: { bg: "bg-purple-100", text: "text-purple-700" },
    parent: { bg: "bg-rose-100", text: "text-rose-700" },
  }
  return colors[role] || { bg: "bg-neutral-100", text: "text-neutral-700" }
}

export function UserDetailClient({
  userSchoolId,
  userId,
  fullName: initialFullName,
  email,
  phone: initialPhone,
  role: initialRole,
  branchId: initialBranchId,
  customRoleId: initialCustomRoleId,
  isActive: initialIsActive,
  branches,
  customRoles,
  customRoleDetails,
}: UserDetailClientProps) {
  const router = useRouter()
  const [fullName, setFullName] = useState(initialFullName)
  const [phone, setPhone] = useState(initialPhone)
  const [role, setRole] = useState(initialRole)
  const [branchId, setBranchId] = useState(initialBranchId)
  const [customRoleId, setCustomRoleId] = useState(initialCustomRoleId)
  const [isActive, setIsActive] = useState(initialIsActive)
  const [isSaving, setIsSaving] = useState(false)
  const [isTogglingStatus, setIsTogglingStatus] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{
    type: "success" | "error"
    text: string
  } | null>(null)
  const [deactivateMessage, setDeactivateMessage] = useState<{
    type: "success" | "error"
    text: string
  } | null>(null)

  const hasChanges =
    fullName !== initialFullName ||
    phone !== initialPhone ||
    role !== initialRole ||
    branchId !== initialBranchId ||
    customRoleId !== initialCustomRoleId

  const handleSave = async () => {
    setIsSaving(true)
    setSaveMessage(null)

    try {
      const response = await fetch("/api/admin/update-user", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userSchoolId,
          fullName,
          phone,
          role,
          branchId: branchId || null,
          customRoleId: customRoleId || null,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setSaveMessage({
          type: "success",
          text: "User updated successfully",
        })
        // Optionally refresh the page to sync with server
        setTimeout(() => {
          router.refresh()
        }, 1500)
      } else {
        setSaveMessage({
          type: "error",
          text: data.error || "Failed to update user",
        })
      }
    } catch (error) {
      setSaveMessage({
        type: "error",
        text: "An error occurred while saving",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleStatus = async () => {
    setIsTogglingStatus(true)
    setDeactivateMessage(null)

    try {
      const response = await fetch("/api/admin/update-user", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userSchoolId,
          action: isActive ? "deactivate" : "reactivate",
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setIsActive(!isActive)
        setDeactivateMessage({
          type: "success",
          text: isActive
            ? "User account deactivated successfully"
            : "User account reactivated successfully",
        })
        setTimeout(() => {
          router.refresh()
        }, 1500)
      } else {
        setDeactivateMessage({
          type: "error",
          text: data.error || "Failed to update account status",
        })
      }
    } catch (error) {
      setDeactivateMessage({
        type: "error",
        text: "An error occurred while updating account status",
      })
    } finally {
      setIsTogglingStatus(false)
    }
  }

  const selectedBranch = branches.find((b) => b.id === branchId)
  const selectedCustomRole = customRoles.find((r) => r.id === customRoleId)
  const roleBadge = getRoleBadgeColor(role)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/admin/users"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Users
        </Link>
      </div>

      {/* Title section */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{fullName || "User"}</h1>
            <span className={`px-3 py-1 text-sm font-medium rounded-lg ${roleBadge.bg} ${roleBadge.text}`}>
              {role}
            </span>
          </div>
          <p className="text-muted-foreground">{email}</p>
        </div>
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-semibold flex-shrink-0">
          {fullName?.[0]?.toUpperCase() || "?"}
        </div>
      </div>

      {/* User info card */}
      <GlassCard variant="default" className="p-6">
        <h2 className="text-lg font-semibold mb-6">User Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Full Name */}
          <div>
            <label className="block text-sm font-medium mb-2">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>

          {/* Email (read-only) */}
          <div>
            <label className="block text-sm font-medium mb-2">Email</label>
            <div className="w-full px-3 py-2 border border-neutral-200 rounded-lg bg-neutral-50 text-neutral-600 flex items-center gap-2">
              <Mail className="w-4 h-4" />
              {email}
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium mb-2">Phone</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>

          {/* System Role */}
          <div>
            <label className="block text-sm font-medium mb-2">System Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              {SYSTEM_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* Branch */}
          <div>
            <label className="block text-sm font-medium mb-2 flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Branch
            </label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              <option value="">No specific branch</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Custom Role */}
          <div>
            <label className="block text-sm font-medium mb-2 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Custom Role
            </label>
            <select
              value={customRoleId}
              onChange={(e) => setCustomRoleId(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              <option value="">No custom role</option>
              {customRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Save message */}
        {saveMessage && (
          <div
            className={`mt-6 p-3 rounded-lg flex items-center gap-2 ${
              saveMessage.type === "success"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-rose-50 text-rose-700"
            }`}
          >
            {saveMessage.type === "success" ? (
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            )}
            {saveMessage.text}
          </div>
        )}

        {/* Save button */}
        <div className="mt-6 flex justify-end">
          <Button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Save className="w-4 h-4" />
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </GlassCard>

      {/* Account Status Section */}
      <GlassCard variant="default" className="p-6">
        <h2 className="text-lg font-semibold mb-4">Account Status</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-lg">
            <div>
              <p className="font-medium">
                Status:{" "}
                <span
                  className={`ml-2 ${
                    isActive
                      ? "text-emerald-600 font-semibold"
                      : "text-rose-600 font-semibold"
                  }`}
                >
                  {isActive ? "Active" : "Inactive"}
                </span>
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {isActive
                  ? "This user can access the application"
                  : "This user cannot access the application"}
              </p>
            </div>
          </div>

          {/* Deactivate/Reactivate message */}
          {deactivateMessage && (
            <div
              className={`p-3 rounded-lg flex items-center gap-2 ${
                deactivateMessage.type === "success"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-rose-50 text-rose-700"
              }`}
            >
              {deactivateMessage.type === "success" ? (
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
              )}
              {deactivateMessage.text}
            </div>
          )}

          {/* Toggle button */}
          <Button
            onClick={handleToggleStatus}
            disabled={isTogglingStatus}
            variant={isActive ? "destructive" : "default"}
            className={isActive ? "w-full sm:w-auto" : "w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700"}
          >
            {isTogglingStatus
              ? "Updating..."
              : isActive
                ? "Deactivate Account"
                : "Reactivate Account"}
          </Button>
        </div>
      </GlassCard>
    </div>
  )
}
