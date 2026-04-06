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

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES" }).format(amount)
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    paid: { label: "Paid", variant: "default" },
    unpaid: { label: "Unpaid", variant: "destructive" },
    partial: { label: "Partial", variant: "secondary" },
    overdue: { label: "Overdue", variant: "destructive" },
    cancelled: { label: "Cancelled", variant: "outline" },
  }
  const entry = map[status] ?? { label: status, variant: "outline" as const }
  return <Badge variant={entry.variant}>{entry.label}</Badge>
}

export default async function ParentFeesPage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Get all students to show in selector or details
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

  // Get invoices for all children or just the selected one
  const { data: invoices } = await (supabase as any)
    .from("invoices")
    .select("*, invoice_items(*), payments(*), students(first_name, last_name, admission_number)")
    .in("student_id", students.map((s: any) => s.id))
    .order("created_at", { ascending: false })

  const invoicesList = (invoices as any[]) || []

  // Group by student
  const invoicesByStudent: Record<string, any[]> = {}
  const studentSummaries: Record<string, { totalInvoiced: number; totalPaid: number; balance: number }> = {}

  for (const student of students) {
    invoicesByStudent[student.id] = []
    studentSummaries[student.id] = { totalInvoiced: 0, totalPaid: 0, balance: 0 }
  }

  for (const inv of invoicesList) {
    const studentId = inv.student_id
    if (!invoicesByStudent[studentId]) {
      invoicesByStudent[studentId] = []
    }
    invoicesByStudent[studentId].push(inv)

    const summary = studentSummaries[studentId]
    const amt = Number(inv.amount) || 0
    summary.totalInvoiced += amt
    if (inv.status === "paid") {
      summary.totalPaid += amt
    } else if (inv.status === "partial") {
      summary.totalPaid += amt * 0.5
    }
  }

  for (const student of students) {
    const summary = studentSummaries[student.id]
    summary.balance = summary.totalInvoiced - summary.totalPaid
  }

  // Get current student details
  const selectedStudent = students.find((s: any) => s.id === selectedChildId) || students[0]
  const selectedInvoices = invoicesByStudent[selectedStudent.id] || []
  const selectedSummary = studentSummaries[selectedStudent.id] || { totalInvoiced: 0, totalPaid: 0, balance: 0 }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Fees & Invoices</h2>
          <p className="text-muted-foreground">
            View and track all fee invoices
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
              href={`/parent-portal/fees?child=${student.id}`}
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

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Invoiced</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(selectedSummary.totalInvoiced)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {invoicesList.length} invoice{invoicesList.length !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{formatCurrency(selectedSummary.totalPaid)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {((selectedSummary.totalPaid / selectedSummary.totalInvoiced) * 100).toFixed(0)}% paid
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Outstanding Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${selectedSummary.balance > 0 ? "text-red-600" : "text-emerald-600"}`}>
              {formatCurrency(selectedSummary.balance)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {selectedSummary.balance > 0 ? "Amount due" : "No amount due"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Invoices Table */}
      {selectedInvoices.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No invoices found for {selectedStudent.first_name} {selectedStudent.last_name}.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {selectedInvoices.length} Invoice{selectedInvoices.length !== 1 ? "s" : ""} - {selectedStudent.first_name} {selectedStudent.last_name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Items</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedInvoices.map((invoice: any) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.reference}</TableCell>
                    <TableCell>
                      {invoice.issued_date
                        ? new Date(invoice.issued_date).toLocaleDateString()
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {invoice.due_date
                        ? new Date(invoice.due_date).toLocaleDateString()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(Number(invoice.amount))}
                    </TableCell>
                    <TableCell>{statusBadge(invoice.status ?? "unpaid")}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {invoice.invoice_items?.length ?? 0} item{(invoice.invoice_items?.length ?? 0) !== 1 ? "s" : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Payment Methods */}
      {selectedSummary.balance > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment Methods</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Outstanding balance of {formatCurrency(selectedSummary.balance)} can be paid using:
            </p>
            <div className="space-y-2">
              <div className="p-3 border rounded-lg">
                <p className="font-medium text-sm">M-Pesa</p>
                <p className="text-xs text-muted-foreground">Paybill or Till Number (available from school)</p>
              </div>
              <div className="p-3 border rounded-lg">
                <p className="font-medium text-sm">Bank Transfer</p>
                <p className="text-xs text-muted-foreground">Contact school for bank details</p>
              </div>
              <div className="p-3 border rounded-lg">
                <p className="font-medium text-sm">In-Person Payment</p>
                <p className="text-xs text-muted-foreground">Visit the school office during business hours</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground border-t pt-3">
              Contact the school administrator for online payment options or payment plans.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
