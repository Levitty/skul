import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { createSchool } from "@/lib/actions/school-setup"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Building2, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { NewSchoolForm } from "@/components/school-setup/new-school-form"

export default async function NewSchoolPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Check if user already has a school
  const { data: existingSchool } = await supabase
    .from("user_schools")
    .select("school_id")
    .eq("user_id", user.id)
    .single()

  // If user already has a school, redirect to school setup
  if (existingSchool) {
    redirect("/dashboard/admin/school-setup")
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent mb-2">
            Create Your School
          </h1>
          <p className="text-lg text-muted-foreground">
            Set up your school profile to get started
          </p>
        </div>
        <div className="hidden md:flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/50">
          <Building2 className="w-8 h-8 text-white" />
        </div>
      </div>

      {/* Create School Form */}
      <Card className="border-0 shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl">School Information</CardTitle>
          <CardDescription>
            Enter your school details. You can update these later in School Setup.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewSchoolForm />
        </CardContent>
      </Card>
    </div>
  )
}
