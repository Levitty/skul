import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES" }).format(amount)
}

export default async function ParentPortalDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Get all children linked to this parent
  const { data: students } = await (supabase as any)
    .from("students")
    .select(
      `
      id,
      first_name,
      last_name,
      admission_number,
      photo_url,
      gender,
      guardians (
        id,
        name,
        is_primary
      ),
      enrollments (
        id,
        sections (name),
        classes (name)
      ),
      invoices (
        amount,
        status
      ),
      attendance_records (
        status,
        attendance_date
      )
    `
    )
    .eq("user_id", user.id)
    .order("first_name", { ascending: true })

  const studentList = (students as any[]) || []

  if (studentList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="h-16 w-16 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-4">
          <svg className="h-8 w-8 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold mb-2">No Children Linked</h2>
        <p className="text-muted-foreground max-w-md">
          Your account is not linked to any students yet. Please contact your school administrator to get set up.
        </p>
      </div>
    )
  }

  // Get primary guardian name
  const primaryGuardian = studentList[0].guardians?.find((g: any) => g.is_primary) || studentList[0].guardians?.[0]
  const guardianName = primaryGuardian?.name || "Parent"

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Welcome, {guardianName}
        </h2>
        <p className="text-muted-foreground">
          Here&apos;s an overview of your children&apos;s information
        </p>
      </div>

      {/* Children Overview Cards */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Your Children</h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {studentList.map((student: any) => {
            const currentEnrollment = student.enrollments?.[0]
            const className = currentEnrollment?.classes?.name ?? "N/A"
            const sectionName = currentEnrollment?.sections?.name ?? "N/A"

            // Calculate fee summary
            const invoices = student.invoices || []
            let totalInvoiced = 0
            let totalPaid = 0

            for (const inv of invoices) {
              const amt = Number(inv.amount) || 0
              totalInvoiced += amt
              if (inv.status === "paid") {
                totalPaid += amt
              } else if (inv.status === "partial") {
                totalPaid += amt * 0.5
              }
            }

            const balance = totalInvoiced - totalPaid

            // Calculate attendance summary
            const attendanceRecords = student.attendance_records || []
            const today = new Date()
            const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
            const recentAttendance = attendanceRecords.filter((r: any) => {
              const recordDate = new Date(r.attendance_date)
              return recordDate >= thirtyDaysAgo
            })

            const present = recentAttendance.filter((r: any) => r.status === "present").length
            const attendanceRate = recentAttendance.length > 0
              ? Math.round((present / recentAttendance.length) * 100)
              : 0

            return (
              <Card key={student.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">
                        {student.first_name} {student.last_name}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {student.admission_number}
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {className}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Section</span>
                      <span className="font-medium">{sectionName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Fee Balance</span>
                      <span className={`font-medium ${balance > 0 ? "text-red-600" : "text-emerald-600"}`}>
                        {formatCurrency(balance)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Attendance (30d)</span>
                      <span className={`font-medium ${attendanceRate >= 80 ? "text-emerald-600" : "text-amber-600"}`}>
                        {attendanceRate}%
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Link
                      href={`/parent-portal/fees?child=${student.id}`}
                      className="flex-1 text-xs px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors text-center font-medium"
                    >
                      Fees
                    </Link>
                    <Link
                      href={`/parent-portal/grades?child=${student.id}`}
                      className="flex-1 text-xs px-3 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors text-center font-medium"
                    >
                      Grades
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Quick Links */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Quick Links</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickLink
            href="/parent-portal/children"
            label="All Children"
            description="View detailed child information"
            color="blue"
          />
          <QuickLink
            href="/parent-portal/fees"
            label="All Fees"
            description="View invoices and payments"
            color="emerald"
          />
          <QuickLink
            href="/parent-portal/grades"
            label="Academic Records"
            description="View exam results and grades"
            color="violet"
          />
          <QuickLink
            href="/parent-portal/attendance"
            label="Attendance"
            description="Track attendance records"
            color="amber"
          />
        </div>
      </div>
    </div>
  )
}

function QuickLink({
  href,
  label,
  description,
  color,
}: {
  href: string
  label: string
  description: string
  color: "emerald" | "blue" | "violet" | "amber"
}) {
  const colorMap = {
    emerald: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600",
    blue: "bg-blue-100 dark:bg-blue-900/30 text-blue-600",
    violet: "bg-violet-100 dark:bg-violet-900/30 text-violet-600",
    amber: "bg-amber-100 dark:bg-amber-900/30 text-amber-600",
  }

  return (
    <Link href={href}>
      <Card className="transition-shadow hover:shadow-md cursor-pointer h-full">
        <CardContent className="flex items-center gap-3 p-4">
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${colorMap[color]}`}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </div>
          <div>
            <p className="font-medium text-sm">{label}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
