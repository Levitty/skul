import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { ReceiptActions } from "@/components/fees/receipt-actions"

export default async function ReceiptPage({
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

  const { data: payment, error } = await supabase
    .from("payments")
    .select(`
      *,
      invoices(
        id,
        reference,
        amount,
        due_date,
        issued_date,
        school_id,
        students(id, first_name, last_name, admission_number)
      )
    `)
    .eq("id", id)
    .single()

  if (error || !payment || (payment as any).invoices?.school_id !== context.schoolId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Receipt Not Found</h1>
          <p className="text-muted-foreground">
            The receipt you&apos;re looking for doesn&apos;t exist or you don&apos;t have access.
          </p>
        </div>
        <Link href="/dashboard/accountant/fees">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Fees
          </Button>
        </Link>
      </div>
    )
  }

  const p = payment as any
  const invoice = p.invoices
  const student = invoice?.students
  const receiptNumber = p.receipt_number || `PAY-${p.id.slice(0, 8)}`

  const { data: school } = await supabase
    .from("schools")
    .select("name, address, phone, email")
    .eq("id", context.schoolId)
    .single()

  const s = school as any
  const receiptData = {
    schoolName: s?.name || "School",
    schoolAddress: s?.address || undefined,
    schoolPhone: s?.phone || undefined,
    schoolEmail: s?.email || undefined,
    receiptNumber,
    paymentDate: p.paid_at
      ? new Date(p.paid_at).toLocaleDateString("en-KE")
      : new Date(p.created_at).toLocaleDateString("en-KE"),
    studentName: `${student?.first_name || ""} ${student?.last_name || ""}`.trim(),
    admissionNumber: student?.admission_number || undefined,
    invoiceReference: invoice?.reference || undefined,
    paymentMethod: p.method || "N/A",
    transactionRef: p.transaction_ref || undefined,
    amount: Number(p.amount || 0),
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard/accountant/fees">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Fees
            </Button>
          </Link>
          <h1 className="mt-4 text-3xl font-bold">Receipt {receiptNumber}</h1>
          <p className="text-muted-foreground">
            Payment receipt for invoice {invoice?.reference}
          </p>
        </div>
        <ReceiptActions receiptData={receiptData} />
      </div>

      <Card className="print:shadow-none print:border-0">
        <CardHeader>
          <CardTitle>Payment Receipt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Receipt Number</p>
              <p className="font-medium">{receiptNumber}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Payment Date</p>
              <p className="font-medium">
                {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : new Date(p.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Student</p>
              <p className="font-medium">
                {student?.first_name} {student?.last_name}
                {student?.admission_number ? ` (${student.admission_number})` : ""}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Invoice Reference</p>
              <p className="font-medium">{invoice?.reference}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Payment Method</p>
              <p className="font-medium capitalize">{p.method}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Transaction Reference</p>
              <p className="font-medium">{p.transaction_ref || "N/A"}</p>
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-sm text-muted-foreground">Amount Paid</p>
            <p className="text-2xl font-bold">KES {Number(p.amount || 0).toLocaleString()}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
