import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Users2 } from "lucide-react"
import { SectionsManager } from "@/components/school-setup/sections-manager"

export default async function SectionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }

  // Fetch classes for the dropdown
  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, level")
    .eq("school_id", context.schoolId)
    .order("level", { ascending: true })

  // Fetch sections with class info
  const { data: sections } = await supabase
    .from("sections")
    .select("*, classes!inner(id, name, level, school_id)")
    .eq("classes.school_id", context.schoolId)
    .order("name", { ascending: true })

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/admin/school-setup"
          className="inline-flex items-center text-sm text-neutral-500 hover:text-neutral-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Setup
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-neutral-900 mb-2">
            Sections
          </h1>
          <p className="text-lg text-neutral-500">
            Manage sections within each class
          </p>
        </div>
      </div>

      {/* Info Card */}
      <Card className="border border-neutral-200 shadow-sm bg-white">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-lg bg-neutral-100 text-neutral-600">
              <Users2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-1">About Sections</h3>
              <p className="text-sm text-neutral-500">
                Sections divide classes into smaller groups (e.g., Grade 1A, Grade 1B).
                You can set capacity limits for each section to manage class sizes.
                Students are assigned to a specific section when enrolled.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sections Manager */}
      {!classes || classes.length === 0 ? (
        <Card className="border border-neutral-200 shadow-sm">
          <CardContent className="p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-neutral-100">
              <Users2 className="w-8 h-8 text-neutral-600" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No classes found</h3>
            <p className="text-sm text-neutral-500 mb-4">
              You need to create classes before adding sections
            </p>
            <Link
              href="/dashboard/admin/school-setup/classes"
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 transition-colors"
            >
              Create Classes First
            </Link>
          </CardContent>
        </Card>
      ) : (
        <SectionsManager
          initialSections={sections || []}
          classes={classes}
        />
      )}
    </div>
  )
}


