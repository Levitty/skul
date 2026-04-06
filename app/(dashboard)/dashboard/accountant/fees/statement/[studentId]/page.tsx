import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { FeeStatementClient } from "@/components/fees/fee-statement-client"
import type { StatementEntry } from "@/lib/services/fee-statement-pdf"

export default async function FeeStatementPage({
  params,
}: {
  params: Promise<{ studentId: string }>
}) {
  const { studentId } = await params
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

  const { data: student } = await supabase
    .from("students")
    .select("id, first_name, last_name, admission_number")
    .eq("id", studentId)
    .eq("school_id", context.schoolId)
    .single()

  if (!student) {
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

  const [
    { data: studentInvoices },
    { data: school },
    { data: enrollment },
  ] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, reference, amount, issued_date, status")
      .eq("student_id", studentId)
      .eq("school_id", context.schoolId)
      .order("issued_date", { ascending: true }),
    supabase
      .from("schools")
      .select("name, address, phone, email")
      .eq("id", context.schoolId)
      .single(),
    supabase
      .from("enrollments")
      .select("classes(name)")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const invoiceIds = ((studentInvoices || []) as any[]).map((i) => i.id)

  let allPayments: any[] = []
  if (invoiceIds.length > 0) {
    const { data: payments } = await supabase
      .from("payments")
      .select("id, invoice_id, amount, method, paid_at, created_at, status")
      .in("invoice_id", invoiceIds)
      .eq("status", "completed")
      .order("paid_at", { ascending: true })

    allPayments = payments || []
  }

  // Build chronological statement entries
  type RawEntry = { date: Date; description: string; debit: number; credit: number }
  const rawEntries: RawEntry[] = []

  for (const inv of ((studentInvoices || []) as any[])) {
    rawEntries.push({
      date: new Date(inv.issued_date),
      description: `Invoice ${inv.reference}`,
      debit: Number(inv.amount) || 0,
      credit: 0,
    })
  }

  for (const pmt of allPayments) {
    const inv = ((studentInvoices || []) as any[]).find((i) => i.id === pmt.invoice_id)
    rawEntries.push({
      date: new Date(pmt.paid_at || pmt.created_at),
      description: `Payment — ${pmt.method}${inv ? ` (${inv.reference})` : ""}`,
      debit: 0,
      credit: Number(pmt.amount) || 0,
    })
  }

  rawEntries.sort((a, b) => a.date.getTime() - b.date.getTime())

  let runningBalance = 0
  const entries: StatementEntry[] = rawEntries.map((e) => {
    runningBalance += e.debit - e.credit
    return {
      date: e.date.toLocaleDateString("en-KE"),
      description: e.description,
      debit: e.debit,
      credit: e.credit,
      balance: runningBalance,
    }
  })

  const totalDebits = rawEntries.reduce((sum, e) => sum + e.debit, 0)
  const totalCredits = rawEntries.reduce((sum, e) => sum + e.credit, 0)

  const studentClass = (enrollment as any)?.classes?.name

  return (
    <FeeStatementClient
      student={student}
      className={studentClass}
      school={{
        name: (school as any)?.name || "School",
        address: (school as any)?.address || undefined,
        phone: (school as any)?.phone || undefined,
        email: (school as any)?.email || undefined,
      }}
      entries={entries}
      totalDebits={totalDebits}
      totalCredits={totalCredits}
      closingBalance={runningBalance}
    />
  )
}
