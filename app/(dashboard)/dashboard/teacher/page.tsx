import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { getTeacherDashboard } from "@/lib/actions/teacher-dashboard"

export default async function TeacherDashboard() {
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

  const result = await getTeacherDashboard()

  if (result.error || !result.data) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-neutral-900 mb-2">
              Teacher Dashboard
            </h1>
            <p className="text-lg text-neutral-500">
              Welcome back to your teaching dashboard
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

  const { teacher, stats, todaySchedule, upcomingDeadlines, recentActivity } = result.data

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-neutral-900 mb-2">
            Welcome, {teacher.name}
          </h1>
          <p className="text-lg text-neutral-500">
            {teacher.position}
            {teacher.department && ` • ${teacher.department}`}
          </p>
        </div>
      </div>

      {/* Quick Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="rounded-lg border border-neutral-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>My Classes</CardDescription>
              <div className="p-2 rounded-lg bg-neutral-100 text-neutral-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
            </div>
            <CardTitle className="text-3xl">{stats.classCount}</CardTitle>
            <p className="text-xs text-neutral-600 font-medium">Classes assigned</p>
          </CardHeader>
        </Card>

        <Card className="rounded-lg border border-neutral-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>My Students</CardDescription>
              <div className="p-2 rounded-lg bg-neutral-100 text-neutral-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.856-1.487M15 10a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </div>
            <CardTitle className="text-3xl">{stats.studentCount}</CardTitle>
            <p className="text-xs text-neutral-600 font-medium">Total students</p>
          </CardHeader>
        </Card>

        <Card className="rounded-lg border border-neutral-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>Pending Grading</CardDescription>
              <div className="p-2 rounded-lg bg-neutral-100 text-neutral-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <CardTitle className="text-3xl">{stats.pendingGrading}</CardTitle>
            <p className="text-xs text-neutral-600 font-medium">Submissions to grade</p>
          </CardHeader>
        </Card>

        <Card className="rounded-lg border border-neutral-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>Schemes Status</CardDescription>
              <div className="p-2 rounded-lg bg-neutral-100 text-neutral-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
            </div>
            <CardTitle className="text-3xl">{stats.schemeStatus.submitted}</CardTitle>
            <p className="text-xs text-neutral-600 font-medium">
              {stats.schemeStatus.draft} draft
            </p>
          </CardHeader>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="rounded-lg border border-neutral-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Quick Actions</CardTitle>
          <CardDescription>Access your most common tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            <Button
              asChild
              className="h-24 bg-neutral-900 hover:bg-neutral-800 text-white transition-all duration-200"
            >
              <Link href="/dashboard/teacher/attendance" className="flex flex-col items-center justify-center">
                <svg className="w-5 h-5 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                <span className="text-sm font-semibold">Mark Attendance</span>
              </Link>
            </Button>

            <Button
              asChild
              className="h-24 bg-neutral-900 hover:bg-neutral-800 text-white transition-all duration-200"
            >
              <Link href="/dashboard/teacher/grades" className="flex flex-col items-center justify-center">
                <svg className="w-5 h-5 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <span className="text-sm font-semibold">Enter Grades</span>
              </Link>
            </Button>

            <Button
              asChild
              className="h-24 bg-neutral-900 hover:bg-neutral-800 text-white transition-all duration-200"
            >
              <Link href="/dashboard/teacher/assignments" className="flex flex-col items-center justify-center">
                <svg className="w-5 h-5 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span className="text-sm font-semibold">Create Assignment</span>
              </Link>
            </Button>

            <Button
              asChild
              className="h-24 bg-neutral-900 hover:bg-neutral-800 text-white transition-all duration-200"
            >
              <Link href="/dashboard/teacher/homework" className="flex flex-col items-center justify-center">
                <svg className="w-5 h-5 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-sm font-semibold">Create Homework</span>
              </Link>
            </Button>

            <Button
              asChild
              className="h-24 bg-neutral-900 hover:bg-neutral-800 text-white transition-all duration-200"
            >
              <Link href="/dashboard/teacher/my-classes" className="flex flex-col items-center justify-center">
                <svg className="w-5 h-5 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C6.5 6.253 2 10.998 2 17s4.5 10.747 10 10.747c5.5 0 10-4.998 10-10.747S17.5 6.253 12 6.253z" />
                </svg>
                <span className="text-sm font-semibold">My Classes</span>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Today's Schedule */}
        <Card className="rounded-lg border border-neutral-200 bg-white shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-2xl">Today's Schedule</CardTitle>
            <CardDescription>
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {todaySchedule.length > 0 ? (
              <div className="space-y-3">
                {todaySchedule.map((session) => (
                  <div
                    key={session.id}
                    className="p-4 rounded-lg border border-neutral-200 hover:border-neutral-300 hover:shadow-sm transition-all duration-200 bg-white"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-semibold text-lg">{session.subject}</div>
                        <div className="text-sm text-neutral-500 mt-1">
                          <div>{session.className}</div>
                          <div className="mt-1">{session.period}</div>
                        </div>
                      </div>
                      <div className="text-right text-sm">
                        <div className="font-mono font-semibold">
                          {session.startTime} - {session.endTime}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="inline-flex items-center justify-center w-12 h-12 mb-3 rounded-full bg-neutral-100">
                  <svg
                    className="w-6 h-6 text-neutral-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <p className="text-neutral-500">No classes scheduled for today</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Deadlines */}
        <Card className="rounded-lg border border-neutral-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Upcoming Deadlines</CardTitle>
            <CardDescription>Next 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingDeadlines.length > 0 ? (
              <div className="space-y-3">
                {upcomingDeadlines.map((deadline) => (
                  <div key={deadline.id} className="p-3 rounded-lg border-l-4 border-neutral-300 bg-neutral-50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{deadline.title}</div>
                        <div className="text-xs text-neutral-500 mt-1">
                          {new Date(deadline.dueDate).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </div>
                      </div>
                      <div className="text-xs px-2 py-1 rounded bg-neutral-100 text-neutral-700 font-medium whitespace-nowrap">
                        {deadline.type === "homework" ? "HW" : "Assign"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="inline-flex items-center justify-center w-12 h-12 mb-3 rounded-full bg-neutral-100">
                  <svg
                    className="w-6 h-6 text-neutral-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <p className="text-neutral-500">No upcoming deadlines</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="rounded-lg border border-neutral-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Recent Activity</CardTitle>
          <CardDescription>Latest updates from your dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          {recentActivity.length > 0 ? (
            <div className="space-y-3">
              {recentActivity.map((activity, index) => (
                <div key={activity.id} className="flex gap-4 pb-3" style={{borderBottom: index < recentActivity.length - 1 ? "1px solid #e5e7eb" : "none"}}>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-neutral-100 text-neutral-600">
                    {activity.type === "grade" && (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    )}
                    {activity.type === "assignment" && (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    )}
                    {activity.type === "homework" && (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{activity.title}</div>
                    <div className="text-sm text-neutral-500 mt-1">{activity.description}</div>
                    <div className="text-xs text-neutral-500 mt-2">
                      {new Date(activity.timestamp).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-12 h-12 mb-3 rounded-full bg-neutral-100">
                <svg
                  className="w-6 h-6 text-neutral-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <p className="text-neutral-500">No recent activity</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
