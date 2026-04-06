import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect, useRouter } from "next/navigation"
import { getExamSessions, getStudentsByClass, getExamResults } from "@/lib/actions/exams"
import { GradeEntryForm } from "@/components/academic/grade-entry-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ChevronLeft } from "lucide-react"

interface Props {
  searchParams: { sessionId?: string }
}

export default async function GradeEntryPage({ searchParams }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }

  let sessionData: any = null
  let students: any[] = []
  let existingResults: any[] = []

  if (searchParams.sessionId) {
    // Get exam session details
    const { data: sessions } = await getExamSessions(undefined, undefined)
    sessionData = (sessions as any[])?.find(s => s.id === searchParams.sessionId)

    if (sessionData) {
      // Get students in the class
      const { data: studentsData } = await getStudentsByClass(sessionData.class_id)
      students = studentsData || []

      // Get existing results
      const { data: results } = await getExamResults(searchParams.sessionId)
      existingResults = results || []
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/admin/academic/exams">
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Grade Entry</h1>
          <p className="text-muted-foreground mt-2">
            Enter grades for students in bulk
          </p>
        </div>
      </div>

      {!sessionData ? (
        <Card>
          <CardContent className="pt-12 pb-12">
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">
                No exam session selected. Please select an exam session from the Exams page.
              </p>
              <Button asChild>
                <Link href="/dashboard/admin/academic/exams">Go Back to Exams</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{sessionData.exams?.name || "Exam"}</CardTitle>
              <CardDescription>
                {sessionData.subject} - {sessionData.classes?.name || "Class"}
                {sessionData.exam_date && ` (${sessionData.exam_date})`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Subject</p>
                  <p className="font-semibold">{sessionData.subject}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Class</p>
                  <p className="font-semibold">{sessionData.classes?.name}</p>
                </div>
                {sessionData.max_marks && (
                  <div>
                    <p className="text-sm text-muted-foreground">Max Marks</p>
                    <p className="font-semibold">{sessionData.max_marks}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-muted-foreground">Students</p>
                  <p className="font-semibold">{students.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {students.length > 0 && (
            <GradeEntryForm
              sessionId={searchParams.sessionId!}
              students={students}
              existingResults={existingResults}
              maxMarks={sessionData.max_marks}
            />
          )}
        </>
      )}
    </div>
  )
}
