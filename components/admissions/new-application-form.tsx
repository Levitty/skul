"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createApplication } from "@/lib/actions/admissions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

interface NewApplicationFormProps {
  classes: any[]
}

export function NewApplicationForm({ classes }: NewApplicationFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    dob: "",
    gender: "",
    guardian_name: "",
    guardian_phone: "",
    guardian_email: "",
    applied_class_id: undefined as string | undefined, // This will be converted to applied_class (string) in the action
    notes: "",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const formDataObj = new FormData()
      Object.entries(formData).forEach(([key, value]) => {
        if (value !== undefined && value !== "") {
          formDataObj.append(key, value.toString())
        }
      })

      await createApplication(formDataObj)

      toast({
        title: "Success!",
        description: "Application created successfully.",
      })

      router.push("/dashboard/admin/admissions")
      router.refresh()
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to create application",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/admin/admissions">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Admissions
          </Button>
        </Link>
        <h1 className="mt-4 text-3xl font-bold">New Application</h1>
        <p className="text-muted-foreground">
          Create a new student application
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>Student Information</CardTitle>
            <CardDescription>
              Enter the applicant&apos;s basic information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="first_name">First Name *</Label>
                <Input
                  id="first_name"
                  value={formData.first_name}
                  onChange={(e) =>
                    setFormData({ ...formData, first_name: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Last Name *</Label>
                <Input
                  id="last_name"
                  value={formData.last_name}
                  onChange={(e) =>
                    setFormData({ ...formData, last_name: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dob">Date of Birth</Label>
                <Input
                  id="dob"
                  type="date"
                  value={formData.dob}
                  onChange={(e) =>
                    setFormData({ ...formData, dob: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gender">Gender</Label>
                <Select
                  value={formData.gender}
                  onValueChange={(value) =>
                    setFormData({ ...formData, gender: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="applied_class_id">Applied Class</Label>
                <Select
                  value={formData.applied_class_id || ""}
                  onValueChange={(value) =>
                    setFormData({ ...formData, applied_class_id: value || undefined })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select class (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold mb-4">Guardian Information</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="guardian_name">Guardian Name *</Label>
                  <Input
                    id="guardian_name"
                    value={formData.guardian_name}
                    onChange={(e) =>
                      setFormData({ ...formData, guardian_name: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guardian_phone">Guardian Phone *</Label>
                  <Input
                    id="guardian_phone"
                    type="tel"
                    value={formData.guardian_phone}
                    onChange={(e) =>
                      setFormData({ ...formData, guardian_phone: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="guardian_email">Guardian Email</Label>
                  <Input
                    id="guardian_email"
                    type="email"
                    value={formData.guardian_email}
                    onChange={(e) =>
                      setFormData({ ...formData, guardian_email: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                className="w-full min-h-[100px] rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                placeholder="Additional notes about this application..."
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Link href="/dashboard/admin/admissions">
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Link>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Application"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}

