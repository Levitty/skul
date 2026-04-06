import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { Plus, ArrowRightLeft, GraduationCap, Users, UserX, AlertTriangle, Download, Upload } from "lucide-react"

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string; class?: string; branch?: string }>
}) {
  const resolvedSearchParams = await searchParams
  const branchFilter = resolvedSearchParams.branch || null
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

  // Use service role client for data reads to bypass RLS issues
  // TODO: Fix RLS policies on users table so regular client works
  const adminClient = createServiceRoleClient()

  // Helper: add branch filter to a query if a branch is selected
  function withBranch(q: any, column = "branch_id") {
    if (branchFilter) return q.eq(column, branchFilter)
    return q
  }

  // Build query with filters
  let query = withBranch(
    adminClient
      .from("students")
      .select(`
        *,
        enrollments(
          id,
          class_id,
          section_id,
          classes(name),
          sections(name)
        )
      `)
      .eq("school_id", context.schoolId)
  )

  // Filter by status
  const statusFilter = resolvedSearchParams.status || "active"
  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter)
  }

  // Filter by search term
  if (resolvedSearchParams.search) {
    query = query.or(
      `first_name.ilike.%${resolvedSearchParams.search}%,last_name.ilike.%${resolvedSearchParams.search}%,admission_number.ilike.%${resolvedSearchParams.search}%,roll_number.ilike.%${resolvedSearchParams.search}%`
    )
  }

  query = query.order("created_at", { ascending: false }).limit(50)

  const { data: students, error } = await query

  // Fetch counts for each status (with branch filter)
  const [
    { count: activeCount },
    { count: inactiveCount },
    { count: suspendedCount },
    { count: graduatedCount },
    { count: transferredCount },
  ] = await Promise.all([
    withBranch(adminClient.from("students").select("id", { count: "exact", head: true }).eq("school_id", context.schoolId).eq("status", "active")),
    withBranch(adminClient.from("students").select("id", { count: "exact", head: true }).eq("school_id", context.schoolId).eq("status", "inactive")),
    withBranch(adminClient.from("students").select("id", { count: "exact", head: true }).eq("school_id", context.schoolId).eq("status", "suspended")),
    withBranch(adminClient.from("students").select("id", { count: "exact", head: true }).eq("school_id", context.schoolId).eq("status", "graduated")),
    withBranch(adminClient.from("students").select("id", { count: "exact", head: true }).eq("school_id", context.schoolId).eq("status", "transferred")),
  ])

  // Fetch classes for filter
  const { data: classes } = await adminClient
    .from("classes")
    .select("id, name")
    .eq("school_id", context.schoolId)
    .order("level", { ascending: true })

  const totalStudents = (activeCount || 0) + (inactiveCount || 0) + (suspendedCount || 0) + (graduatedCount || 0) + (transferredCount || 0)

  const statusTabs = [
    { value: "active", label: "Active", count: activeCount || 0, color: "text-green-600" },
    { value: "inactive", label: "Inactive", count: inactiveCount || 0, color: "text-gray-600" },
    { value: "suspended", label: "Suspended", count: suspendedCount || 0, color: "text-orange-600" },
    { value: "graduated", label: "Graduated", count: graduatedCount || 0, color: "text-blue-600" },
    { value: "transferred", label: "Transferred", count: transferredCount || 0, color: "text-purple-600" },
    { value: "all", label: "All", count: totalStudents, color: "text-foreground" },
  ]

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return "badge-refined badge-success"
      case "inactive":
        return "badge-refined bg-gray-100 text-gray-700"
      case "suspended":
        return "badge-refined bg-orange-100 text-orange-700"
      case "graduated":
        return "badge-refined badge-info"
      case "transferred":
        return "badge-refined bg-purple-100 text-purple-700"
      default:
        return "badge-refined"
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-4xl font-bold tracking-tight">Students</h1>
          <p className="text-lg text-muted-foreground">
            Manage student records and enrollments
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/admin/students/promote">
            <Button variant="outline" className="gap-2">
              <GraduationCap className="w-4 h-4" />
              Promote
            </Button>
          </Link>
          <Link href="/dashboard/admin/students/transfers">
            <Button variant="outline" className="gap-2">
              <ArrowRightLeft className="w-4 h-4" />
              Transfers
            </Button>
          </Link>
          <Link href="/dashboard/admin/students/bulk-import">
            <Button variant="outline" className="gap-2">
              <Upload className="w-4 h-4" />
              Bulk Import
            </Button>
          </Link>
          <Link href="/dashboard/admin/students/new">
            <Button className="btn-primary gap-2">
              <Plus className="w-4 h-4" />
              Add Student
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-6 md:grid-cols-4">
        <Card className="border border-neutral-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Students</CardTitle>
            <div className="p-2 rounded-lg bg-neutral-100 text-neutral-600">
              <Users className="w-5 h-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStudents}</div>
            <p className="text-xs text-neutral-500 mt-1">All records</p>
          </CardContent>
        </Card>

        <Card className="border border-neutral-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <div className="p-2 rounded-lg bg-neutral-100 text-neutral-600">
              <Users className="w-5 h-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCount || 0}</div>
            <p className="text-xs text-neutral-600 mt-1 font-medium">Currently enrolled</p>
          </CardContent>
        </Card>

        <Card className="border border-neutral-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Suspended</CardTitle>
            <div className="p-2 rounded-lg bg-neutral-100 text-neutral-600">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{suspendedCount || 0}</div>
            <p className="text-xs text-neutral-500 mt-1">Temporarily suspended</p>
          </CardContent>
        </Card>

        <Card className="border border-neutral-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Graduated</CardTitle>
            <div className="p-2 rounded-lg bg-neutral-100 text-neutral-600">
              <GraduationCap className="w-5 h-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{graduatedCount || 0}</div>
            <p className="text-xs text-neutral-500 mt-1">Completed studies</p>
          </CardContent>
        </Card>
      </div>

      {/* Directory */}
      <Card className="border border-neutral-200 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Student Directory</CardTitle>
              <CardDescription className="mt-1.5">
                View and manage all enrolled students
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="w-4 h-4" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Search and Filters */}
          <div className="p-4 border-b space-y-4">
            {/* Search */}
            <form method="get" className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  name="search"
                  defaultValue={resolvedSearchParams.search}
                  placeholder="Search by name, admission number, or roll number..."
                  className="w-full px-4 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <input type="hidden" name="status" value={statusFilter} />
              <Button type="submit" variant="outline">Search</Button>
            </form>

            {/* Status Tabs */}
            <div className="flex gap-2 flex-wrap">
              {statusTabs.map((tab) => (
                <Link
                  key={tab.value}
                  href={`/dashboard/admin/students?status=${tab.value}${resolvedSearchParams.search ? `&search=${resolvedSearchParams.search}` : ""}`}
                >
                  <Button
                    variant={statusFilter === tab.value ? "default" : "outline"}
                    size="sm"
                    className={cn(
                      "gap-2",
                      statusFilter !== tab.value && tab.color
                    )}
                  >
                    {tab.label}
                    <span className="text-xs px-1.5 py-0.5 bg-background/20 rounded">
                      {tab.count}
                    </span>
                  </Button>
                </Link>
              ))}
            </div>
          </div>

          {error ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <UserX className="w-8 h-8" />
              </div>
              <p className="text-lg font-semibold text-red-600 dark:text-red-400">Error loading students</p>
              <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
            </div>
          ) : students && students.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="table-refined">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Admission No.</th>
                    <th>Roll No.</th>
                    <th>Class</th>
                    <th>Gender</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student: any) => {
                    const initials = `${student.first_name?.[0] || ''}${student.last_name?.[0] || ''}`.toUpperCase()
                    const colors = [
                      'from-blue-500 to-cyan-500',
                      'from-purple-500 to-pink-500',
                      'from-emerald-500 to-teal-500',
                      'from-orange-500 to-red-500',
                      'from-indigo-500 to-purple-500',
                    ]
                    const colorIndex = student.id.charCodeAt(0) % colors.length
                    const currentEnrollment = student.enrollments?.[0]
                    
                    return (
                      <tr key={student.id}>
                        <td>
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "avatar-refined w-10 h-10",
                              `bg-gradient-to-br ${colors[colorIndex]}`
                            )}>
                              {initials}
                            </div>
                            <div>
                              <div className="font-medium">{student.first_name} {student.last_name}</div>
                              <div className="text-sm text-muted-foreground">{student.email || "No email"}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                            {student.admission_number || "N/A"}
                          </code>
                        </td>
                        <td>
                          <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                            {student.roll_number || "N/A"}
                          </code>
                        </td>
                        <td>
                          <span className="text-sm">
                            {currentEnrollment?.classes?.name || "Not enrolled"}
                            {currentEnrollment?.sections?.name && ` - ${currentEnrollment.sections.name}`}
                          </span>
                        </td>
                        <td>
                          <span className="badge-refined badge-info capitalize">
                            {student.gender || "N/A"}
                          </span>
                        </td>
                        <td>
                          <span className={getStatusBadge(student.status)}>
                            {student.status}
                            {student.status === "suspended" && student.suspension_end_date && (
                              <span className="ml-1 text-xs">
                                (until {new Date(student.suspension_end_date).toLocaleDateString()})
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="text-right">
                          <Link href={`/dashboard/admin/students/${student.id}`}>
                            <Button variant="ghost" size="sm" className="gap-2">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              View
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Users className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-semibold mb-1">
                {resolvedSearchParams.search ? "No students found" : "No students yet"}
              </h3>
              <p className="text-sm text-muted-foreground mb-6">
                {resolvedSearchParams.search 
                  ? "Try adjusting your search or filters"
                  : "Get started by adding your first student to the system"
                }
              </p>
              {!resolvedSearchParams.search && (
                <Link href="/dashboard/admin/students/new">
                  <Button className="btn-primary">Add Your First Student</Button>
                </Link>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
