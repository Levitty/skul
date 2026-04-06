"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { createSchool } from "@/lib/actions/school-setup"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Loader2 } from "lucide-react"

export function NewSchoolForm() {
  const router = useRouter()
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const formData = new FormData(e.currentTarget)

    try {
      const result = await createSchool(formData)

      if (result.error) {
        setError(result.error)
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      } else {
        toast({
          title: "Success!",
          description: "School created successfully. You can now add classes and sections.",
        })
        router.push("/dashboard/admin/school-setup")
        router.refresh()
      }
    } catch (err: any) {
      const errorMessage = err?.message || "Failed to create school. Please try again."
      setError(errorMessage)
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">School Name *</Label>
          <Input
            id="name"
            name="name"
            placeholder="Enter school name"
            required
            className="h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="code">School Code</Label>
          <Input
            id="code"
            name="code"
            placeholder="Auto-generated if left empty"
            className="h-11"
          />
          <p className="text-xs text-muted-foreground">
            A unique code for your school (e.g., SCHOOL001)
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email Address</Label>
          <Input
            id="email"
            name="email"
            type="email"
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
            placeholder="+254 700 000 000"
            className="h-11"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="logo_url">Logo URL</Label>
          <Input
            id="logo_url"
            name="logo_url"
            type="url"
            placeholder="https://example.com/logo.png"
            className="h-11"
          />
          <p className="text-xs text-muted-foreground">
            Enter a URL to your school logo image
          </p>
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="address">Address</Label>
          <Textarea
            id="address"
            name="address"
            placeholder="Enter school address"
            rows={3}
          />
        </div>
      </div>

      <div className="flex justify-end gap-4 pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting} className="min-w-[120px]">
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            "Create School"
          )}
        </Button>
      </div>
    </form>
  )
}
