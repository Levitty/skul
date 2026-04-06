import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import StudentDetailPageClient from "./client"

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
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

  // Fetch student details
  const { data: student, error } = await adminClient
    .from("students")
    .select("*")
    .eq("id", id)
    .eq("school_id", context.schoolId)
    .single()

  if (error || !student) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Student Not Found</h1>
          <p className="text-muted-foreground">
            The student you&apos;re looking for doesn&apos;t exist or you don&apos;t have access.
          </p>
        </div>
        <Link href="/dashboard/admin/students">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Students
          </Button>
        </Link>
      </div>
    )
  }

  // Fetch invoices first to get their IDs for payments query
  const { data: studentInvoices, error: invoicesError } = await adminClient
    .from("invoices")
    .select("id")
    .eq("student_id", (student as any).id)

  const invoicesList = studentInvoices || []
  const invoiceIds = invoicesList.map((i: any) => i.id)

  const studentId = (student as any).id

  // Fetch all related data in parallel
  const [
    { data: guardians },
    { data: enrollments },
    { data: invoices },
    { data: payments },
    { data: recentAttendance },
    { data: documents },
  ] = await Promise.all([
    adminClient
      .from("guardians")
      .select("*")
      .eq("student_id", studentId)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true }),
    adminClient
      .from("enrollments")
      .select("*, classes(name, level), academic_years(name, start_date, end_date), sections(name)")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false }),
    adminClient
      .from("invoices")
      .select("*, invoice_items(*)")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false })
      .limit(20),
    invoiceIds.length > 0
      ? adminClient
          .from("payments")
          .select("*")
          .in("invoice_id", invoiceIds)
          .order("created_at", { ascending: false })
          .limit(20)
      : { data: null },
    adminClient
      .from("attendance_records")
      .select("*, periods(name)")
      .eq("student_id", studentId)
      .order("date", { ascending: false })
      .limit(10),
    adminClient
      .from("student_documents")
      .select("*")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false }),
  ])

  return (
    <StudentDetailPageClient
      student={student}
      guardians={guardians || []}
      enrollments={enrollments || []}
      invoices={invoices || []}
      payments={payments || []}
      recentAttendance={recentAttendance || []}
      documents={documents || []}
    />
  )
}
