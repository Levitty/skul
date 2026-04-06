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

export default async function StudentInvoicesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data: student } = await supabase
    .from("students")
    .select("id, first_name, last_name")
    .eq("user_id", user.id)
    .single()

  if (!student) {
    redirect("/student-portal")
  }

  const s = student as any
  const { data: invoices } = await supabase
    .from("invoices")
    .select("*, invoice_items(*)")
    .eq("student_id", s.id)
    .order("created_at", { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">My Invoices</h2>
          <p className="text-muted-foreground">
            View all fee invoices for {s.first_name} {s.last_name}
          </p>
        </div>
        <Link
          href="/student-portal"
          className="text-sm text-blue-600 hover:underline"
        >
          &larr; Back to Dashboard
        </Link>
      </div>

      {!invoices || invoices.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No invoices found.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {invoices.length} Invoice{invoices.length !== 1 ? "s" : ""}
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
                {invoices.map((invoice: any) => (
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
    </div>
  )
}
