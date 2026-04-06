import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ChevronLeft } from "lucide-react"
import { StudentProgressPageClient } from "@/components/teacher/student-progress-page-client"
import { getClassStudentProgress } from "@/lib/actions/student-progress"

interface StudentProgressDetailPageProps {
  params: {
    classId: string
  }
}

export default async function StudentProgressDetailPage({
  params,
}: StudentProgressDetailPageProps) {
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

  // Verify teacher has access to this class
  const { data: teacher } = await supabase
    .from("employees")
    .select("id")
    .eq("user_id", user.id)
    .eq("school_id", context.schoolId)
    .single()

  if (!teacher) {
    redirect("/login")
  }

  const teacherId = (teacher as any).id

  // Check if teacher teaches this class
  const { data: classAssignment } = await supabase
    .from("timetable_entries")
    .select("id")
    .eq("teacher_id", teacherId)
    .eq("class_id", params.classId)
    .single()

  if (!classAssignment) {
    redirect("/dashboard/teacher/student-progress")
  }

  // Get class info
  const { data: classData } = await supabase
    .from("classes")
    .select("id, name, level")
    .eq("id", params.classId)
    .single()

  if (!classData) {
    redirect("/dashboard/teacher/student-progress")
  }

  // Load student progress data
  let students: any[] = []
  let dataErrors: string[] = []

  try {
    const result = await getClassStudentProgress(params.classId)
    if (result.error) {
      console.error("Error loading student progress:", result.error)
      dataErrors.push(`Progress Data: ${result.error}`)
    } else {
      students = result.data || []
    }
  } catch (error: any) {
    console.error("Error loading student progress:", error)
    dataErrors.push(`Progress Data: ${error.message || "Unknown error"}`)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header with Back Button */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          asChild
          className="h-10 w-10"
        >
          <Link href="/dashboard/teacher/student-progress">
            <ChevronLeft className="w-5 h-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent mb-2">
            {classData.name}
          </h1>
          <p className="text-lg text-muted-foreground">
            Track {students.length} student{students.length !== 1 ? "s" : ""} progress and performance
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

      {/* Quick Stats */}
      {students.length > 0 && (
        <div className="grid gap-4 md:grid-cols-5">
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground mb-1">Total Students</div>
              <div className="text-3xl font-bold">{students.length}</div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground mb-1">Class Average</div>
              <div className="text-3xl font-bold">
                {Math.round(
                  students.reduce((sum, s) => sum + s.averagePercentage, 0) / students.length
                )}%
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground mb-1">Top Performer</div>
              <div className="text-3xl font-bold">
                {students.length > 0
                  ? Math.max(...students.map((s) => s.averagePercentage))
                  : "-"}
                %
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground mb-1">Avg Attendance</div>
              <div className="text-3xl font-bold">
                {Math.round(
                  students.reduce((sum, s) => sum + s.attendanceRate, 0) / students.length
                )}%
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground mb-1">Avg Homework</div>
              <div className="text-3xl font-bold">
                {Math.round(
                  students.reduce((sum, s) => sum + s.homeworkCompletionRate, 0) / students.length
                )}%
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Progress View */}
      <StudentProgressPageClient
        classId={params.classId}
        className={classData.name}
        students={students}
      />
    </div>
  )
}
