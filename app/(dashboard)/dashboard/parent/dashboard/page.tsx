import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Users, Award, DollarSign, Calendar, FileText, CheckCircle, MessageSquare, Download } from "lucide-react"
import { AttendanceTrendChart } from "@/components/charts/attendance-trend-chart"

export default async function ParentDashboardPage() {
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

  // Find guardians linked to this user's email
  const { data: guardians, error: guardiansError } = await supabase
    .from("guardians")
    .select("student_id")
    .eq("email", user.email || "")
    .eq("school_id", context.schoolId)

  const guardiansList = guardians || []
  const studentIds = guardiansList.map((g: any) => g.student_id)

  if (studentIds.length === 0) {
    return (
      <div className="space-y-6">
        <div className="border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-900 p-8 shadow-sm">
          <div className="text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No students linked</h2>
            <p className="text-muted-foreground">Please contact the school to link your account to your child&apos;s records.</p>
          </div>
        </div>
      </div>
    )
  }

  // Fetch students
  const { data: students, error: studentsError } = await supabase
    .from("students")
    .select("*")
    .in("id", studentIds)
    .eq("school_id", context.schoolId)
    .eq("status", "active")

  const studentsList = students || []
  const primaryStudent = studentsList[0] as any

  if (!primaryStudent) {
    return (
      <div className="space-y-6">
        <div className="border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-900 p-8 shadow-sm">
          <div className="text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No active students</h2>
            <p className="text-muted-foreground">No active student records found.</p>
          </div>
        </div>
      </div>
    )
  }

  // Calculate attendance rate (last 30 days)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  
  const { data: attendanceRecords, error: attendanceError } = await supabase
    .from("attendance_records")
    .select("status, date")
    .eq("student_id", primaryStudent.id)
    .eq("school_id", context.schoolId)
    .gte("date", thirtyDaysAgo.toISOString().split("T")[0])
    .order("date", { ascending: true })

  const attendanceList = attendanceRecords || []
  const totalDays = attendanceList.length
  const presentDays = attendanceList.filter((a: any) => a.status === "present").length
  const attendanceRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0

  // Prepare attendance trend data (last 7 days)
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  
  const { data: recentAttendanceTrend, error: trendError } = await supabase
    .from("attendance_records")
    .select("status, date")
    .eq("student_id", primaryStudent.id)
    .eq("school_id", context.schoolId)
    .gte("date", sevenDaysAgo.toISOString().split("T")[0])
    .order("date", { ascending: true })

  // Group by date
  const trendList = recentAttendanceTrend || []
  const attendanceByDate = trendList.reduce((acc: any, record: any) => {
    const date = record.date
    if (!acc[date]) {
      acc[date] = { date, present: 0, total: 0 }
    }
    acc[date].total += 1
    if (record.status === "present") {
      acc[date].present += 1
    }
    return acc
  }, {}) || {}

  const attendanceTrendData = Object.values(attendanceByDate)

  // Fetch exam results for current term
  const { data: currentTerm, error: termError } = await supabase
    .from("terms")
    .select("id, name, start_date, end_date")
    .eq("school_id", context.schoolId)
    .lte("start_date", new Date().toISOString().split("T")[0])
    .gte("end_date", new Date().toISOString().split("T")[0])
    .single()

  let examResults: any[] | null = null
  if (!termError && currentTerm) {
    const termData = currentTerm as any
    // First get exam IDs for this term
    const { data: exams, error: examsError } = await supabase
      .from("exams")
      .select("id")
      .eq("term_id", termData.id)
      .eq("school_id", context.schoolId)
    
    const examsList = exams || []
    const examIds = examsList.map((e: any) => e.id)
    
    if (examIds.length > 0) {
      // Get exam sessions for these exams
      const { data: examSessions, error: sessionsError } = await supabase
        .from("exam_sessions")
        .select("id")
        .in("exam_id", examIds)
      
      const sessionsList = examSessions || []
      const sessionIds = sessionsList.map((s: any) => s.id)
      
      if (sessionIds.length > 0) {
        const { data: results, error: resultsError } = await supabase
          .from("exam_results")
          .select("*, exam_sessions(exams(name, subject_id), subjects(name))")
          .eq("student_id", primaryStudent.id)
          .in("exam_session_id", sessionIds)
        
        examResults = results || []
      }
    }
  }

  // Calculate average grade
  const examResultsList = examResults || []
  const grades = examResultsList.map((r: any) => {
    // Use grade if available, otherwise calculate from marks_obtained
    if (r.grade) return r.grade
    const marks = Number(r.marks_obtained) || 0
    if (marks >= 90) return "A"
    if (marks >= 80) return "B"
    if (marks >= 70) return "C"
    if (marks >= 60) return "D"
    return "F"
  })
  
  const gradePoints = grades.map(g => {
    const grade = g?.toUpperCase() || "F"
    if (grade.startsWith("A")) return 4
    if (grade.startsWith("B")) return 3
    if (grade.startsWith("C")) return 2
    if (grade.startsWith("D")) return 1
    return 0
  })
  
  const avgGradePoint = gradePoints.length > 0 
    ? gradePoints.reduce((a: number, b: number) => a + b, 0) / gradePoints.length 
    : 0
  
  const overallGrade = avgGradePoint >= 3.5 ? "A" 
    : avgGradePoint >= 2.5 ? "B"
    : avgGradePoint >= 1.5 ? "C"
    : avgGradePoint >= 0.5 ? "D"
    : "F"

  // Calculate fee balance
  const { data: invoices, error: invoicesError } = await supabase
    .from("invoices")
    .select("id, amount, status")
    .eq("student_id", primaryStudent.id)
    .eq("school_id", context.schoolId)
    .in("status", ["unpaid", "partial", "overdue"])

  const invoicesList = invoices || []
  const invoiceIds = invoicesList.map((i: any) => i.id)
  
  const { data: payments, error: paymentsError } = invoiceIds.length > 0
    ? await supabase
        .from("payments")
        .select("amount, invoice_id")
        .in("invoice_id", invoiceIds)
        .eq("school_id", context.schoolId)
    : { data: null, error: null }

  const paymentsList = payments || []
  const totalOwed = invoicesList.reduce((sum: number, inv: any) => sum + (Number(inv.amount) || 0), 0)
  const totalPaid = paymentsList.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0)
  const feeBalance = totalOwed - totalPaid

  // Fetch recent activities (last 10)
  const recentActivities: Array<{
    type: string
    message: string
    time: string
    icon: typeof FileText
    color: string
  }> = []

  // Add recent attendance records
  const { data: recentAttendance, error: recentAttError } = await supabase
    .from("attendance_records")
    .select("date, status")
    .eq("student_id", primaryStudent.id)
    .order("date", { ascending: false })
    .limit(5)

  const recentAttList = recentAttendance || []
  recentAttList.forEach((att: any) => {
    const date = new Date(att.date)
    const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
    const timeAgo = daysAgo === 0 ? "Today" : daysAgo === 1 ? "1 day ago" : `${daysAgo} days ago`
    
    recentActivities.push({
      type: "Attendance",
      message: `Marked ${att.status} on ${date.toLocaleDateString()}`,
      time: timeAgo,
      icon: CheckCircle,
      color: att.status === "present" ? "emerald" : "amber"
    })
  })

  // Add recent payments
  const { data: recentPayments, error: recentPayError } = await supabase
    .from("payments")
    .select("amount, created_at, invoices(amount)")
    .in("invoice_id", invoiceIds)
    .order("created_at", { ascending: false })
    .limit(5)

  const recentPayList = recentPayments || []
  recentPayList.forEach((payment: any) => {
    const date = new Date(payment.created_at)
    const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
    const timeAgo = daysAgo === 0 ? "Today" : daysAgo === 1 ? "1 day ago" : `${daysAgo} days ago`
    
    recentActivities.push({
      type: "Payment",
      message: `Payment of KES ${Number(payment.amount).toLocaleString()} received`,
      time: timeAgo,
      icon: DollarSign,
      color: "emerald"
    })
  })

  // Sort by time and take most recent 5
  recentActivities.sort((a, b) => {
    const aDays = parseInt(a.time) || 0
    const bDays = parseInt(b.time) || 0
    return aDays - bDays
  })

  // Get subject performance from exam results
  const subjectPerformance = examResultsList.reduce((acc: any, result: any) => {
    const subjectName = result.exam_sessions?.subjects?.name || result.exam_sessions?.exams?.name || "Unknown"
    const marks = Number(result.marks_obtained) || 0
    if (!acc[subjectName]) {
      acc[subjectName] = { marks: [], total: 0, count: 0 }
    }
    acc[subjectName].marks.push(marks)
    acc[subjectName].total += marks
    acc[subjectName].count += 1
    return acc
  }, {}) || {}

  const subjectGrades = Object.entries(subjectPerformance).map(([subject, data]: [string, any]) => {
    const avgScore = data.total / data.count
    let grade = "F"
    if (avgScore >= 90) grade = "A"
    else if (avgScore >= 80) grade = "B"
    else if (avgScore >= 70) grade = "C"
    else if (avgScore >= 60) grade = "D"
    
    return {
      subject,
      grade: grade,
      percentage: Math.round(avgScore)
    }
  }).slice(0, 5)

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          {primaryStudent.first_name}&apos;s Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Here&apos;s how your child is doing
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-5 grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
              <CheckCircle className="w-5 h-5" />
            </div>
            {attendanceRate >= 90 && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">Excellent</span>
            )}
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums text-foreground">{attendanceRate}%</p>
            <p className="text-xs text-muted-foreground mt-0.5">Attendance (30 days)</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3">
          <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 w-fit">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums text-foreground">{overallGrade}{avgGradePoint >= 3.7 ? "+" : avgGradePoint >= 3.3 ? "" : avgGradePoint >= 2.7 ? "+" : ""}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Overall Grade</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3">
          <div className="p-2.5 rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400 w-fit">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums text-foreground">KES {feeBalance.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{feeBalance === 0 ? "All fees paid" : "Fee Balance"}</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3">
          <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 w-fit">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums text-foreground">0</p>
            <p className="text-xs text-muted-foreground mt-0.5">Events This Week</p>
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Attendance Trend */}
          {attendanceTrendData.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="text-sm font-semibold text-foreground mb-1">Attendance Trend</h3>
              <p className="text-xs text-muted-foreground mb-4">Last 7 days</p>
              <AttendanceTrendChart data={attendanceTrendData as any} />
            </div>
          )}

          {/* Academic Performance */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="text-sm font-semibold text-foreground mb-1">Academic Performance</h3>
            <p className="text-xs text-muted-foreground mb-4">Current term grades</p>
            {subjectGrades.length > 0 ? (
              <div className="space-y-4">
                {subjectGrades.map((item) => (
                  <div key={item.subject} className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-muted/60 flex items-center justify-center font-semibold text-sm text-foreground">
                      {item.grade}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium text-foreground">{item.subject}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">{item.percentage}%</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-500 transition-all duration-500"
                          style={{ width: `${item.percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No grades available yet</p>
            )}
          </div>

          {/* Recent Activity */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4">Recent Activity</h3>
            {recentActivities.length > 0 ? (
              <div className="space-y-3">
                {recentActivities.slice(0, 5).map((activity, i) => {
                  const IconComponent = activity.icon
                  const colorClasses: Record<string, string> = {
                    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
                    blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
                    purple: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400",
                    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
                  }
                  return (
                    <div key={i} className="flex items-start gap-3">
                      <div className={`mt-0.5 p-1.5 rounded-lg ${colorClasses[activity.color] || colorClasses.blue}`}>
                        <IconComponent className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{activity.type}</p>
                        <p className="text-xs text-muted-foreground">{activity.message}</p>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{activity.time}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">No recent activity</p>
            )}
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4">Quick Actions</h3>
            <div className="space-y-2">
              <Button className="w-full justify-start h-auto py-3" size="sm">
                <DollarSign className="w-4 h-4 mr-3" />
                Make Payment
              </Button>
              <Button variant="outline" className="w-full justify-start h-auto py-3" size="sm">
                <MessageSquare className="w-4 h-4 mr-3" />
                Message Teacher
              </Button>
              <Button variant="outline" className="w-full justify-start h-auto py-3" size="sm">
                <Download className="w-4 h-4 mr-3" />
                View Report Card
              </Button>
            </div>
          </div>

          {/* This Week */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4">This Week</h3>
            <p className="text-sm text-muted-foreground text-center py-6">No upcoming events</p>
          </div>
        </div>
      </div>
    </div>
  )
}
