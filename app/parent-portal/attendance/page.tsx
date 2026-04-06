import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

function getStatusColor(status: string) {
  switch (status) {
    case "present":
      return "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300"
    case "absent":
      return "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"
    case "late":
      return "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300"
    default:
      return "bg-gray-50 dark:bg-gray-900/20 text-gray-700 dark:text-gray-300"
  }
}

export default async function ParentAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Get all students
  const { data: allStudents } = await (supabase as any)
    .from("students")
    .select("id, first_name, last_name, admission_number")
    .eq("user_id", user.id)
    .order("first_name", { ascending: true })

  const students = (allStudents as any[]) || []

  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <h2 className="text-xl font-semibold mb-2">No Children Linked</h2>
        <p className="text-muted-foreground">
          Your account is not linked to any students yet.
        </p>
      </div>
    )
  }

  const params = await searchParams
  const selectedChildId = params.child || students[0].id

  // Get attendance records for all children
  const { data: allRecords } = await (supabase as any)
    .from("attendance_records")
    .select("*, students(id, first_name, last_name, admission_number)")
    .in("student_id", students.map((s: any) => s.id))
    .order("attendance_date", { ascending: false })

  const records = (allRecords as any[]) || []

  // Get current student details
  const selectedStudent = students.find((s: any) => s.id === selectedChildId) || students[0]

  // Filter records for selected student
  const studentRecords = records.filter((r: any) => r.student_id === selectedStudent.id)

  // Calculate statistics
  const stats = {
    present: 0,
    absent: 0,
    late: 0,
    total: studentRecords.length,
    presentPercentage: 0,
  }

  for (const record of studentRecords) {
    if (record.status === "present") {
      stats.present++
    } else if (record.status === "absent") {
      stats.absent++
    } else if (record.status === "late") {
      stats.late++
    }
  }

  stats.presentPercentage = stats.total > 0
    ? Math.round((stats.present / stats.total) * 100)
    : 0

  // Calculate monthly statistics
  const monthlyStats: Record<string, { present: number; absent: number; late: number; total: number }> = {}

  for (const record of studentRecords) {
    const date = new Date(record.attendance_date)
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`

    if (!monthlyStats[monthKey]) {
      monthlyStats[monthKey] = { present: 0, absent: 0, late: 0, total: 0 }
    }

    monthlyStats[monthKey].total++
    if (record.status === "present") {
      monthlyStats[monthKey].present++
    } else if (record.status === "absent") {
      monthlyStats[monthKey].absent++
    } else if (record.status === "late") {
      monthlyStats[monthKey].late++
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Attendance Records</h2>
          <p className="text-muted-foreground">
            Track daily attendance and attendance patterns
          </p>
        </div>
        <Link
          href="/parent-portal"
          className="text-sm text-blue-600 hover:underline"
        >
          &larr; Back to Dashboard
        </Link>
      </div>

      {/* Child Selector for Multiple Children */}
      {students.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {students.map((student: any) => (
            <Link
              key={student.id}
              href={`/parent-portal/attendance?child=${student.id}`}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedStudent.id === student.id
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {student.first_name} {student.last_name}
            </Link>
          ))}
        </div>
      )}

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Records</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">Days tracked</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Present</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{stats.present}</div>
            <p className="text-xs text-muted-foreground mt-1">{stats.presentPercentage}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Absent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.absent}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.total > 0 ? Math.round((stats.absent / stats.total) * 100) : 0}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Late</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{stats.late}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.total > 0 ? Math.round((stats.late / stats.total) * 100) : 0}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Attendance Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.presentPercentage >= 80 ? "text-emerald-600" : stats.presentPercentage >= 70 ? "text-amber-600" : "text-red-600"}`}>
              {stats.presentPercentage}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">Overall rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Summary */}
      {Object.keys(monthlyStats).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {Object.entries(monthlyStats)
                .sort()
                .reverse()
                .slice(0, 12)
                .map(([monthKey, monthData]) => {
                  const [year, month] = monthKey.split("-")
                  const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString("en-US", {
                    month: "short",
                    year: "numeric",
                  })
                  const monthRate = monthData.total > 0
                    ? Math.round((monthData.present / monthData.total) * 100)
                    : 0

                  return (
                    <div key={monthKey} className="p-3 border rounded-lg">
                      <p className="font-medium text-sm mb-2">{monthName}</p>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Present</span>
                          <span className="font-medium text-emerald-600">{monthData.present}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Absent</span>
                          <span className="font-medium text-red-600">{monthData.absent}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Late</span>
                          <span className="font-medium text-amber-600">{monthData.late}</span>
                        </div>
                        <div className="border-t pt-1 flex justify-between">
                          <span className="text-muted-foreground font-medium">Rate</span>
                          <span className={`font-bold ${monthRate >= 80 ? "text-emerald-600" : monthRate >= 70 ? "text-amber-600" : "text-red-600"}`}>
                            {monthRate}%
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Attendance Records Table */}
      {studentRecords.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No attendance records found for {selectedStudent.first_name} {selectedStudent.last_name}.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {studentRecords.length} Record{studentRecords.length !== 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {studentRecords.slice(0, 100).map((record: any) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">
                      {new Date(record.attendance_date).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={getStatusColor(record.status)}
                      >
                        {record.status?.charAt(0).toUpperCase() + record.status?.slice(1) || "Unknown"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs max-w-[200px] truncate">
                      {record.notes || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {studentRecords.length > 100 && (
              <p className="text-xs text-muted-foreground mt-4">
                Showing latest 100 records out of {studentRecords.length} total
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
