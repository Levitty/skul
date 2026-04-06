import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { StudentProgressPageClient } from "@/components/teacher/student-progress-page-client"
import { getTeacherClasses } from "@/lib/actions/teacher-dashboard"

export default async function StudentProgressPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }

  // Get teacher's classes
  let classes: any[] = []
  let dataErrors: string[] = []

  try {
    const result = await getTeacherClasses()
    if (result.error) {
      console.error("Error loading teacher classes:", result.error)
      dataErrors.push(`Classes: ${result.error}`)
    } else {
      classes = result.data || []
    }
  } catch (error: any) {
    console.error("Error loading teacher classes:", error)
    dataErrors.push(`Classes: ${error.message || "Unknown error"}`)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent mb-2">
            Student Progress Tracking
          </h1>
          <p className="text-lg text-muted-foreground">
            Monitor individual student academic performance and engagement
          </p>
        </div>
      </div>

      {/* Error Messages */}
      {dataErrors.length > 0 && (
        <Card className="border-0 shadow-lg border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
          <CardContent className="pt-6">
            <div className="space-y-1">
              <p className="font-medium text-red-600 dark:text-red-400">Some data failed to load:</p>
              {dataErrors.map((error, index) => (
                <p key={index} className="text-sm text-red-600 dark:text-red-400">• {error}</p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Class Selection */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl">Select a Class</CardTitle>
          <CardDescription>Choose a class to view student progress</CardDescription>
        </CardHeader>
        <CardContent>
          {classes.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">
                No classes assigned. Please contact your administrator.
              </p>
              <Button variant="outline" asChild>
                <Link href="/dashboard/teacher">Back to Dashboard</Link>
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {classes.map((classItem: any) => (
                <Button
                  key={classItem.id}
                  variant="outline"
                  asChild
                  className="h-24 border-2 hover:border-indigo-400 dark:hover:border-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-all group"
                >
                  <Link href={`/dashboard/teacher/student-progress/${classItem.id}`}>
                    <div className="text-center w-full">
                      <div className="font-semibold text-lg mb-1">{classItem.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {classItem.subject && <span>{classItem.subject} • </span>}
                        {classItem.studentCount} students
                      </div>
                    </div>
                  </Link>
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              What You Can Track
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-indigo-600 dark:text-indigo-400">•</span>
              <span>Academic performance by subject</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-indigo-600 dark:text-indigo-400">•</span>
              <span>Individual exam scores</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-indigo-600 dark:text-indigo-400">•</span>
              <span>Attendance and engagement</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Performance Metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-emerald-600 dark:text-emerald-400">•</span>
              <span>Overall grade and class rank</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-emerald-600 dark:text-emerald-400">•</span>
              <span>Homework completion rate</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-emerald-600 dark:text-emerald-400">•</span>
              <span>Identified strengths and gaps</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-amber-600 dark:text-amber-400">→</span>
              <span>View detailed progress reports</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-amber-600 dark:text-amber-400">→</span>
              <span>Identify at-risk students</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-amber-600 dark:text-amber-400">→</span>
              <span>Plan interventions</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
