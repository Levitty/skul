import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Building2 } from "lucide-react"
import { SchoolProfileForm } from "@/components/school-setup/school-profile-form"

export default async function SchoolProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }

  const { data: school } = await supabase
    .from("schools")
    .select("*")
    .eq("id", context.schoolId)
    .single()

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/admin/school-setup"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Setup
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent mb-2">
            School Profile
          </h1>
          <p className="text-lg text-muted-foreground">
            Update your school&apos;s information and branding
          </p>
        </div>
      </div>

      {/* Current Logo Preview */}
      {(school as any)?.logo_url && (
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Current Logo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="w-24 h-24 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
                <img 
                  src={(school as any).logo_url} 
                  alt="School logo" 
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Your school logo appears on invoices, reports, and the dashboard.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Profile Form */}
      <Card className="border-0 shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl">School Information</CardTitle>
          <CardDescription>
            This information will be displayed on invoices, reports, and communications.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SchoolProfileForm school={school} />
        </CardContent>
      </Card>
    </div>
  )
}

