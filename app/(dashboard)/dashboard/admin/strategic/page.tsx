import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { StrategicAdvisorClient } from "@/components/strategic/strategic-advisor-client"

export default async function StrategicAdvisorPage() {
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

  // Fetch some baseline stats for the dashboard
  const [
    { count: studentCount },
    { data: revenueData },
    { data: pendingInvoices },
    { data: attendanceRate },
  ] = await Promise.all([
    supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("school_id", context.schoolId)
      .eq("status", "active"),
    supabase
      .from("payments")
      .select("amount")
      .eq("status", "completed")
      .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    supabase
      .from("invoices")
      .select("id, amount")
      .eq("school_id", context.schoolId)
      .in("status", ["unpaid", "partial", "overdue"]),
    supabase
      .from("attendance_records")
      .select("status")
      .gte("date", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]),
  ])

  const revenueList = revenueData || []
  const pendingList = pendingInvoices || []
  const attendanceList = attendanceRate || []
  const totalRevenue = revenueList.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0)
  const totalPending = pendingList.reduce((sum: number, i: any) => sum + (Number(i.amount) || 0), 0)
  const presentCount = attendanceList.filter((a: any) => a.status === "present").length
  const totalAttendance = attendanceList.length || 1
  const attendancePercentage = Math.round((presentCount / totalAttendance) * 100)

  const quickStats = {
    activeStudents: studentCount || 0,
    monthlyRevenue: totalRevenue,
    pendingFees: totalPending,
    attendanceRate: attendancePercentage,
  }

  return <StrategicAdvisorClient quickStats={quickStats} />
}
