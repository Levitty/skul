"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { GlassCard } from "@/components/ui/glass-card"
import { ArrowLeft, UserPlus, Loader2, CheckCircle, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface Branch {
  id: string
  name: string
}

interface CustomRole {
  id: string
  name: string
}

interface InviteUserClientProps {
  branches: Branch[]
  customRoles: CustomRole[]
  userRole: string
}

const SYSTEM_ROLES = [
  { value: "school_admin", label: "School Admin" },
  { value: "branch_admin", label: "Branch Admin" },
  { value: "teacher", label: "Teacher" },
  { value: "accountant", label: "Accountant" },
  { value: "librarian", label: "Librarian" },
  { value: "nurse", label: "Nurse" },
  { value: "transport_manager", label: "Transport Manager" },
  { value: "hostel_manager", label: "Hostel Manager" },
  { value: "store_keeper", label: "Store Keeper" },
]

export function InviteUserClient({
  branches,
  customRoles,
  userRole,
}: InviteUserClientProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [successMessage, setSuccessMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    role: "teacher",
    branchId: "",
    customRoleId: "",
    sendEmail: true,
  })

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      sendEmail: e.target.checked,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage("")
    setSuccessMessage("")

    // Validation
    if (!formData.fullName.trim()) {
      setErrorMessage("Full name is required")
      return
    }

    if (!formData.email.trim()) {
      setErrorMessage("Email address is required")
      return
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email)) {
      setErrorMessage("Please enter a valid email address")
      return
    }

    if (!formData.role) {
      setErrorMessage("System role is required")
      return
    }

    // Branch is optional, but if role is branch_admin, branch is required
    if (formData.role === "branch_admin" && !formData.branchId) {
      setErrorMessage("Branch is required for Branch Admin role")
      return
    }

    // Phone validation - allow empty or valid format
    if (formData.phone && formData.phone.length < 6) {
      setErrorMessage("Phone number must be at least 6 characters")
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch("/api/admin/invite-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: formData.email.trim(),
          fullName: formData.fullName.trim(),
          phone: formData.phone.trim() || null,
          role: formData.role,
          branchId: formData.branchId || null,
          customRoleId: formData.customRoleId || null,
          sendEmail: formData.sendEmail,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setErrorMessage(data.error || "Failed to invite user. Please try again.")
        setIsLoading(false)
        return
      }

      setSuccessMessage(`Invitation sent to ${formData.email}`)
      setFormData({
        fullName: "",
        email: "",
        phone: "",
        role: "teacher",
        branchId: "",
        customRoleId: "",
        sendEmail: true,
      })

      // Redirect to users list after 2 seconds
      setTimeout(() => {
        router.push("/dashboard/admin/users")
      }, 2000)
    } catch (error) {
      console.error("Error inviting user:", error)
      setErrorMessage("An error occurred. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const shouldShowBranchField =
    formData.role !== "school_admin" && userRole !== "super_admin"

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

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
          <UserPlus className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Invite User</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Send an invitation to a new user to join your school
          </p>
        </div>
      </div>

      {/* Form Card */}
      <GlassCard variant="default" className="p-6 space-y-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Success Message */}
          {successMessage && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-50 border border-emerald-200">
              <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <p className="text-sm text-emerald-700">{successMessage}</p>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-rose-50 border border-rose-200">
              <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
              <p className="text-sm text-rose-700">{errorMessage}</p>
            </div>
          )}

          {/* Full Name */}
          <div className="space-y-2">
            <Label htmlFor="fullName" className="text-sm font-medium">
              Full Name <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="fullName"
              name="fullName"
              type="text"
              placeholder="John Doe"
              value={formData.fullName}
              onChange={handleInputChange}
              disabled={isLoading}
              className="rounded-lg"
            />
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">
              Email Address <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="john@example.com"
              value={formData.email}
              onChange={handleInputChange}
              disabled={isLoading}
              className="rounded-lg"
            />
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label htmlFor="phone" className="text-sm font-medium">
              Phone Number <span className="text-muted-foreground text-xs">(Optional)</span>
            </Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              placeholder="+254712345678"
              value={formData.phone}
              onChange={handleInputChange}
              disabled={isLoading}
              className="rounded-lg"
            />
          </div>

          {/* System Role */}
          <div className="space-y-2">
            <Label htmlFor="role" className="text-sm font-medium">
              System Role <span className="text-rose-500">*</span>
            </Label>
            <Select
              value={formData.role}
              onValueChange={(value) => handleSelectChange("role", value)}
            >
              <SelectTrigger id="role" disabled={isLoading} className="rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SYSTEM_ROLES.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Branch (Optional for non-admin roles) */}
          {shouldShowBranchField && (
            <div className="space-y-2">
              <Label htmlFor="branchId" className="text-sm font-medium">
                Branch <span className="text-muted-foreground text-xs">(Optional)</span>
              </Label>
              <Select
                value={formData.branchId}
                onValueChange={(value) => handleSelectChange("branchId", value)}
              >
                <SelectTrigger id="branchId" disabled={isLoading} className="rounded-lg">
                  <SelectValue placeholder="Select a branch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Branches</SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Custom Role */}
          {customRoles.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="customRoleId" className="text-sm font-medium">
                Custom Role <span className="text-muted-foreground text-xs">(Optional)</span>
              </Label>
              <Select
                value={formData.customRoleId}
                onValueChange={(value) => handleSelectChange("customRoleId", value)}
              >
                <SelectTrigger id="customRoleId" disabled={isLoading} className="rounded-lg">
                  <SelectValue placeholder="Select a custom role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {customRoles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Send Email Checkbox */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-neutral-50 border border-neutral-100">
            <input
              id="sendEmail"
              type="checkbox"
              checked={formData.sendEmail}
              onChange={handleCheckboxChange}
              disabled={isLoading}
              className="w-4 h-4 rounded border-neutral-300 text-emerald-600 cursor-pointer"
            />
            <label
              htmlFor="sendEmail"
              className="text-sm font-medium cursor-pointer flex-1"
            >
              Send Invitation Email
            </label>
          </div>

          {/* Submit Button */}
          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              disabled={isLoading}
              className={cn(
                "h-10 px-6 rounded-lg font-medium transition-all duration-200",
                "bg-emerald-600 hover:bg-emerald-700 text-white",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "flex items-center gap-2"
              )}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending Invite...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Send Invite
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={isLoading}
              asChild
              className="h-10 px-6 rounded-lg"
            >
              <Link href="/dashboard/admin/users">Cancel</Link>
            </Button>
          </div>
        </form>
      </GlassCard>
    </div>
  )
}
