import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { getDashboardData } from "@/lib/actions/strategic-kpis"
import { StrategicDashboardClient } from "@/components/dashboard/strategic-dashboard-client"

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>
}) {
  const params = await searchParams
  const branchFilter = params.branch || null

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

  if (context.role === "teacher") {
    redirect("/dashboard/teacher")
  }

  const schoolId = context.schoolId

  // Helper: add branch filter to a query if a branch is selected
  function withBranch(query: any, column = "branch_id") {
    if (branchFilter) {
      return query.eq(column, branchFilter)
    }
    return query
  }

  // Single unified call for all KPIs + insight + quick stats
  const dashboardData = await getDashboardData()

  // Fetch remaining data in parallel
  const [
    schoolData,
    userData,
    todayAttendance,
    recentPaymentsData,
    recentStudentsData,
    totalInvoiced,
    totalPaid,
    totalExpenses,
    unassignedClasses,
    overdueCount,
  ] = await Promise.all([
    supabase.from("schools").select("name").eq("id", schoolId).single(),
    supabase.from("profiles").select("full_name").eq("id", user.id).single(),
    // Today's attendance
    withBranch(
      supabase
        .from("attendance" as any)
        .select("id, status", { count: "exact", head: false })
        .eq("school_id", schoolId)
        .gte("date", new Date().toISOString().split("T")[0])
        .lte("date", new Date().toISOString().split("T")[0])
    ),
    // Recent payments
    withBranch(
      supabase
        .from("payments")
        .select("id, amount, created_at, invoices(students(first_name, last_name))")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false })
        .limit(5)
    ),
    // Recent enrollments
    withBranch(
      supabase
        .from("students")
        .select("id, first_name, last_name, created_at")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false })
        .limit(5)
    ),
    // Total invoiced this term
    withBranch(
      supabase
        .from("invoices")
        .select("total_amount")
        .eq("school_id", schoolId)
        .eq("status", "sent")
    ),
    // Total paid this term
    withBranch(
      supabase
        .from("payments")
        .select("amount")
        .eq("school_id", schoolId)
    ),
    // Total expenses
    withBranch(
      supabase
        .from("expenses" as any)
        .select("amount")
        .eq("school_id", schoolId)
    ),
    // Classes with no teacher (unassigned)
    withBranch(
      supabase
        .from("classes")
        .select("id, name, teacher_id")
        .eq("school_id", schoolId)
        .is("teacher_id", null)
    ),
    // Overdue invoices
    withBranch(
      supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId)
        .eq("status", "sent")
        .lt("due_date", new Date().toISOString().split("T")[0])
    ),
  ])

  // Extract user info
  const fullName = (userData.data as any)?.full_name || user.email?.split("@")[0] || "Director"
  const firstName = fullName.split(" ")[0]
  const schoolName = (schoolData.data as any)?.name || "Your School"

  // Get branch name if filtered
  let branchName: string | null = null
  if (branchFilter) {
    const { data: branchData } = await supabase
      .from("school_branches" as any)
      .select("name")
      .eq("id", branchFilter)
      .single()
    branchName = (branchData as any)?.name || null
  }

  // Extract unified dashboard data
  const kpisData = dashboardData.kpis
  const quickStatsData = dashboardData.quickStats?.data

  // Insight
  const insight = dashboardData.insight?.data ? {
    text: dashboardData.insight.data.insight,
    priority: dashboardData.insight.data.priority as "info" | "warning" | "critical",
  } : undefined

  // Compute attendance rate for today
  const attendanceRecords = (todayAttendance.data as any[]) || []
  const totalMarked = attendanceRecords.length
  const presentCount = attendanceRecords.filter((a: any) => a.status === "present").length
  const attendanceRate = totalMarked > 0 ? Math.round((presentCount / totalMarked) * 100) : null

  // Compute revenue summary
  const totalInvoicedAmount = ((totalInvoiced.data as any[]) || []).reduce((sum: number, inv: any) => sum + (Number(inv.total_amount) || 0), 0)
  const totalPaidAmount = ((totalPaid.data as any[]) || []).reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0)
  const totalExpenseAmount = ((totalExpenses.data as any[]) || []).reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0)
  const outstandingFees = Math.max(0, totalInvoicedAmount - totalPaidAmount)

  // Build alerts
  const alerts: Array<{ text: string; severity: "critical" | "warning" | "info"; href?: string }> = []

  const pendingAdmissions = quickStatsData?.pendingAdmissions ?? 0
  if (pendingAdmissions > 0) {
    alerts.push({
      text: `${pendingAdmissions} admission${pendingAdmissions === 1 ? "" : "s"} pending review`,
      severity: pendingAdmissions >= 5 ? "warning" : "info",
      href: "/dashboard/admin/admissions",
    })
  }

  const unassigned = (unassignedClasses.data as any[]) || []
  if (unassigned.length > 0) {
    alerts.push({
      text: `${unassigned.length} class${unassigned.length === 1 ? " has" : "es have"} no teacher assigned`,
      severity: "warning",
      href: "/dashboard/admin/academic/class-assignments",
    })
  }

  const overdueInvoices = overdueCount.count ?? 0
  if (overdueInvoices > 0) {
    alerts.push({
      text: `${overdueInvoices} overdue invoice${overdueInvoices === 1 ? "" : "s"}`,
      severity: overdueInvoices >= 10 ? "critical" : "warning",
      href: "/dashboard/accountant/fees",
    })
  }

  if (outstandingFees > 0) {
    alerts.push({
      text: `KES ${outstandingFees.toLocaleString()} in outstanding fees`,
      severity: outstandingFees > 500000 ? "warning" : "info",
      href: "/dashboard/accountant/fees",
    })
  }

  // Format recent activity
  const recentActivity = formatRecentActivity(recentPaymentsData.data, recentStudentsData.data)

  // Sub-dashboard summaries
  const subDashboards = [
    {
      label: "Finance",
      href: "/dashboard/accountant/finance",
      stat: `KES ${totalPaidAmount.toLocaleString()} collected`,
    },
    {
      label: "Students",
      href: "/dashboard/admin/students",
      stat: `${quickStatsData?.totalStudents ?? 0} active`,
    },
    {
      label: "Admissions",
      href: "/dashboard/admin/admissions",
      stat: `${pendingAdmissions} pending`,
    },
    {
      label: "Academic",
      href: "/dashboard/admin/academic/subjects",
      stat: `${quickStatsData?.totalClasses ?? 0} classes`,
    },
  ]

  const runwayMonths = (kpisData as any)?.financialRunway?.months ?? 0
  const collectionRate = (kpisData as any)?.collectionVelocity?.percentageChange ?? 0

  return (
    <StrategicDashboardClient
      userName={firstName}
      schoolName={schoolName}
      branchName={branchName}
      insight={insight}
      stats={{
        totalStudents: quickStatsData?.totalStudents ?? 0,
        totalTeachers: quickStatsData?.totalTeachers ?? 0,
        totalClasses: quickStatsData?.totalClasses ?? 0,
        pendingAdmissions,
        attendanceRate,
        totalMarkedToday: totalMarked,
        collectionRate,
        runwayMonths,
        totalRevenue: totalPaidAmount,
        totalExpenses: totalExpenseAmount,
        outstandingFees,
        overdueInvoices,
      }}
      alerts={alerts}
      recentActivity={recentActivity}
      subDashboards={subDashboards}
    />
  )
}

function formatRecentActivity(
  payments: any[] | null,
  students: any[] | null
) {
  const activities: Array<{
    id: string
    type: "payment" | "enrollment"
    title: string
    description: string
    time: string
    timestamp: Date
  }> = []

  for (const payment of payments || []) {
    const student = (payment.invoices as any)?.students
    const studentName = student
      ? `${student.first_name} ${student.last_name}`
      : "Student"

    activities.push({
      id: payment.id,
      type: "payment",
      title: `Payment received`,
      description: `KES ${Number(payment.amount).toLocaleString()} from ${studentName}`,
      time: formatTimeAgo(new Date(payment.created_at)),
      timestamp: new Date(payment.created_at),
    })
  }

  for (const student of students || []) {
    activities.push({
      id: student.id,
      type: "enrollment",
      title: `New enrollment`,
      description: `${student.first_name} ${student.last_name} joined`,
      time: formatTimeAgo(new Date(student.created_at)),
      timestamp: new Date(student.created_at),
    })
  }

  return activities
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 6)
}

function formatTimeAgo(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}
