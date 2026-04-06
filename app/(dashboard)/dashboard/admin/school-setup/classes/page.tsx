import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, GraduationCap, Plus } from "lucide-react"
import { ClassesManager } from "@/components/school-setup/classes-manager"

export default async function ClassesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }

  const { data: classes } = await supabase
    .from("classes")
    .select("*, sections(id, name, capacity)")
    .eq("school_id", context.schoolId)
    .order("level", { ascending: true })

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
            Classes
          </h1>
          <p className="text-lg text-muted-foreground">
            Manage your school&apos;s class structure
          </p>
        </div>
      </div>

      {/* Info Card */}
      <Card className="border-0 shadow-lg bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-1">About Classes</h3>
              <p className="text-sm text-muted-foreground">
                Classes represent grade levels in your school (e.g., Grade 1, Grade 2, Form 1). 
                Each class can have multiple sections (A, B, C). Students are enrolled in a 
                specific class and section each academic year.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Classes Manager */}
      <ClassesManager initialClasses={classes || []} />
    </div>
  )
}


