import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { getTeacherClasses } from "@/lib/actions/teacher-dashboard"

export default async function MyClassesPage() {
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

  const result = await getTeacherClasses()

  if (result.error || !result.data) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-neutral-900 mb-2">
              My Classes
            </h1>
            <p className="text-lg text-neutral-500">
              Manage your assigned classes and student performance
            </p>
          </div>
        </div>

        <Card className="border-0 shadow-lg border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
          <CardContent className="pt-6">
            <p className="text-red-600 dark:text-red-400">{result.error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const classes = result.data

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-neutral-900 mb-2">
            My Classes
          </h1>
          <p className="text-lg text-neutral-500">
            Manage your assigned classes and student performance
          </p>
        </div>
        <Button asChild className="h-11 px-6 bg-neutral-900 hover:bg-neutral-800 text-white transition-all duration-200">
          <Link href="/dashboard/teacher/grades">
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Enter Grades
          </Link>
        </Button>
      </div>

      {/* Classes Grid */}
      {classes.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {classes.map((classItem) => (
            <Card
              key={classItem.id}
              className="rounded-lg border border-neutral-200 shadow-sm hover:shadow-sm transition-all duration-300 overflow-hidden"
            >
              {/* Class Header */}
              <div className="p-6 pb-4 bg-white border-b border-neutral-200">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="text-sm text-neutral-500 font-medium">{classItem.subject}</div>
                    <h3 className="text-2xl font-bold mt-1">{classItem.name}</h3>
                  </div>
                  <div className="w-12 h-12 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-600 font-bold">
                    {classItem.level || "?"}
                  </div>
                </div>
                {classItem.section && (
                  <p className="text-xs text-neutral-500">{classItem.section}</p>
                )}
              </div>

              {/* Class Details */}
              <CardContent className="pt-6 space-y-6">
                {/* Students Card */}
                <div className="p-4 rounded-lg bg-neutral-50 border border-neutral-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-neutral-700">Students Enrolled</span>
                    <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-600 text-sm font-bold">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-neutral-900">{classItem.studentCount}</div>
                </div>

                {/* Performance Summary */}
                <div>
                  <h4 className="text-sm font-semibold mb-3">Performance Summary</h4>
                  <div className="space-y-3">
                    {/* Average Score */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-neutral-500">Average Score</span>
                        <span className="text-sm font-bold text-neutral-900">
                          {classItem.performanceSummary.averageScore}%
                        </span>
                      </div>
                      <div className="w-full h-2 bg-neutral-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-neutral-800 rounded-full transition-all duration-500"
                          style={{ width: `${classItem.performanceSummary.averageScore}%` }}
                        />
                      </div>
                    </div>

                    {/* Top Score */}
                    <div className="flex items-center justify-between p-2 rounded-lg bg-neutral-50">
                      <span className="text-xs font-medium text-neutral-500">Highest Score</span>
                      <span className="text-sm font-bold text-neutral-900">
                        {classItem.performanceSummary.topScore}%
                      </span>
                    </div>

                    {/* Bottom Score */}
                    <div className="flex items-center justify-between p-2 rounded-lg bg-neutral-50">
                      <span className="text-xs font-medium text-neutral-500">Lowest Score</span>
                      <span className="text-sm font-bold text-neutral-900">
                        {classItem.performanceSummary.bottomScore}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Attendance Rate */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold">Attendance Rate</span>
                    <span className="text-sm font-bold text-neutral-900">
                      {classItem.attendanceRate}%
                    </span>
                  </div>
                  <div className="w-full h-3 bg-neutral-200 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500 bg-neutral-800"
                      style={{ width: `${classItem.attendanceRate}%` }}
                    />
                  </div>
                </div>

                {/* Quick Action Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-neutral-200">
                  <Button asChild size="sm" variant="outline" className="border-neutral-300 hover:bg-neutral-50">
                    <Link href={`/dashboard/teacher/grades/reports/${classItem.id}?examType=midterm`}>
                      <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      Grades
                    </Link>
                  </Button>

                  <Button asChild size="sm" variant="outline" className="border-neutral-300 hover:bg-neutral-50">
                    <Link href="/dashboard/teacher/attendance">
                      <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                      Attend.
                    </Link>
                  </Button>

                  <Button asChild size="sm" variant="outline" className="border-neutral-300 hover:bg-neutral-50">
                    <Link href="/dashboard/teacher/assignments">
                      <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Assign.
                    </Link>
                  </Button>

                  <Button asChild size="sm" variant="outline" className="border-neutral-300 hover:bg-neutral-50">
                    <Link href="/dashboard/teacher/homework">
                      <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      H.Work
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="rounded-lg border border-neutral-200 bg-white shadow-sm">
          <CardContent className="pt-12 pb-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-neutral-100">
              <svg
                className="w-8 h-8 text-neutral-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6.253v13m0-13C6.5 6.253 2 10.998 2 17s4.5 10.747 10 10.747c5.5 0 10-4.998 10-10.747S17.5 6.253 12 6.253z"
                />
              </svg>
            </div>
            <p className="text-lg font-medium mb-2">No Classes Assigned</p>
            <p className="text-sm text-neutral-500 mb-4">
              You haven't been assigned to any classes yet. Contact your administrator.
            </p>
            <Button asChild variant="outline">
              <Link href="/dashboard">
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to Dashboard
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Summary Statistics */}
      {classes.length > 0 && (
        <Card className="rounded-lg border border-neutral-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Summary</CardTitle>
            <CardDescription>Overview across all your classes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="p-6 rounded-lg bg-neutral-50 border border-neutral-200">
                <div className="text-sm font-medium text-neutral-700 mb-2">Total Classes</div>
                <div className="text-4xl font-bold text-neutral-900">{classes.length}</div>
              </div>

              <div className="p-6 rounded-lg bg-neutral-50 border border-neutral-200">
                <div className="text-sm font-medium text-neutral-700 mb-2">Total Students</div>
                <div className="text-4xl font-bold text-neutral-900">
                  {classes.reduce((sum, c) => sum + c.studentCount, 0)}
                </div>
              </div>

              <div className="p-6 rounded-lg bg-neutral-50 border border-neutral-200">
                <div className="text-sm font-medium text-neutral-700 mb-2">Avg. Performance</div>
                <div className="text-4xl font-bold text-neutral-900">
                  {Math.round(
                    classes.reduce((sum, c) => sum + c.performanceSummary.averageScore, 0) / classes.length
                  )}%
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
