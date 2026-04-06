import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default async function AttendancePage() {
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

  // Fetch classes
  const { data: classes } = await supabase
    .from("classes")
    .select("*")
    .eq("school_id", context.schoolId)
    .order("level", { ascending: true })

  // Fetch today's attendance
  const today = new Date().toISOString().split("T")[0]
  const { data: todayAttendance } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("school_id", context.schoolId)
    .eq("date", today)

  const attendanceList = todayAttendance || []
  const presentCount = attendanceList.filter((a: any) => a.status === "present").length
  const absentCount = attendanceList.filter((a: any) => a.status === "absent").length
  const lateCount = attendanceList.filter((a: any) => a.status === "late").length
  const totalMarked = attendanceList.length

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-neutral-900 mb-2">
            Attendance
          </h1>
          <p className="text-lg text-neutral-500">
            Track student attendance and participation
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="h-11">
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </Button>
          <Button className="h-11 px-6 bg-neutral-900 hover:bg-neutral-800 text-white transition-all duration-200">
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Quick Mark
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="rounded-lg border border-neutral-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>Present Today</CardDescription>
              <div className="p-2 rounded-lg bg-neutral-100 text-neutral-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <CardTitle className="text-3xl">{presentCount}</CardTitle>
            <p className="text-xs text-neutral-600 font-medium">
              {totalMarked > 0 ? `${Math.round((presentCount / totalMarked) * 100)}%` : "0%"} attendance
            </p>
          </CardHeader>
        </Card>

        <Card className="rounded-lg border border-neutral-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>Absent Today</CardDescription>
              <div className="p-2 rounded-lg bg-neutral-100 text-neutral-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <CardTitle className="text-3xl">{absentCount}</CardTitle>
            <p className="text-xs text-neutral-600 font-medium">Requires attention</p>
          </CardHeader>
        </Card>

        <Card className="rounded-lg border border-neutral-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>Late Today</CardDescription>
              <div className="p-2 rounded-lg bg-neutral-100 text-neutral-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <CardTitle className="text-3xl">{lateCount}</CardTitle>
            <p className="text-xs text-neutral-600 font-medium">Arrived late</p>
          </CardHeader>
        </Card>

        <Card className="rounded-lg border border-neutral-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>Total Marked</CardDescription>
              <div className="p-2 rounded-lg bg-neutral-100 text-neutral-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
            </div>
            <CardTitle className="text-3xl">{totalMarked}</CardTitle>
            <p className="text-xs text-neutral-600 font-medium">Records today</p>
          </CardHeader>
        </Card>
      </div>

      {/* Class Selection */}
      <Card className="rounded-lg border border-neutral-200 bg-white shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Mark Attendance by Class</CardTitle>
              <CardDescription className="mt-1">
                Select a class to mark attendance for today
              </CardDescription>
            </div>
            <Button variant="outline" size="sm">
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export Report
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {classes && classes.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {classes.map((classItem: any) => (
                <Card
                  key={classItem.id}
                  className="rounded-lg border border-neutral-200 hover:border-neutral-300 hover:shadow-sm transition-all duration-300 cursor-pointer group"
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-xl mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {classItem.name}
                        </CardTitle>
                        <CardDescription>{classItem.description || "No description"}</CardDescription>
                      </div>
                      <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-600 font-bold transition-transform">
                        {classItem.level}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-neutral-500">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                        <span>0 students</span>
                      </div>
                      <Button size="sm" className="bg-neutral-900 hover:bg-neutral-800">
                        Mark
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-neutral-100">
                <svg className="w-8 h-8 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <p className="text-lg font-medium mb-2">No classes found</p>
              <p className="text-sm text-neutral-500 mb-4">Create classes to start marking attendance</p>
              <Button>Create Class</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attendance Trends */}
      <Card className="rounded-lg border border-neutral-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Weekly Attendance Trends</CardTitle>
          <CardDescription>Attendance patterns for the past 7 days</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day, i) => {
              const percentage = Math.random() * 30 + 70 // Mock data: 70-100%
              return (
                <div key={day}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{day}</span>
                    <span className="text-sm text-neutral-500">{percentage.toFixed(0)}%</span>
                  </div>
                  <div className="w-full h-3 bg-neutral-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500 bg-neutral-400"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
