"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { updateSchoolProfile } from "@/lib/actions/school-setup"
import { Loader2, Save } from "lucide-react"

interface SchoolProfileFormProps {
  school: any
}

export function SchoolProfileForm({ school }: SchoolProfileFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true)
    setError(null)
    setSuccess(false)

    const result = await updateSchoolProfile(formData)

    if (result.error) {
      setError(result.error)
    } else {
      setSuccess(true)
      router.refresh()
    }

    setIsSubmitting(false)
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400">
          School profile updated successfully!
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">School Name *</Label>
          <Input
            id="name"
            name="name"
            defaultValue={school?.name || ""}
            placeholder="Enter school name"
            required
            className="h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email Address</Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={school?.email || ""}
            placeholder="school@example.com"
            className="h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Phone Number</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={school?.phone || ""}
            placeholder="+254 700 000 000"
            className="h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="logo_url">Logo URL</Label>
          <Input
            id="logo_url"
            name="logo_url"
            type="url"
            defaultValue={school?.logo_url || ""}
            placeholder="https://example.com/logo.png"
            className="h-11"
          />
          <p className="text-xs text-neutral-500">
            Enter a URL to your school logo image
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Address</Label>
        <Textarea
          id="address"
          name="address"
          defaultValue={school?.address || ""}
          placeholder="Enter school address"
          rows={3}
        />
      </div>

      <div className="flex justify-end gap-4 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </form>
  )
}


