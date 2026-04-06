"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ArrowLeft, Printer, Download, Share2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { generateInvoicePDF } from "@/lib/services/invoice-pdf"

interface InvoiceViewClientProps {
  invoice: any
  payments: any[]
  school: any
  guardian: any
}

export function InvoiceViewClient({
  invoice,
  payments,
  school,
  guardian,
}: InvoiceViewClientProps) {
  const totalPaid = payments
    .filter((p) => p.status === "completed")
    .reduce((sum, p) => sum + Number(p.amount || 0), 0)
  const balance = Number(invoice.amount) - totalPaid

  const handlePrint = () => {
    window.print()
  }

  const handleDownload = () => {
    const doc = generateInvoicePDF({
      schoolName: school?.name || "School",
      schoolAddress: school?.address,
      schoolPhone: school?.phone,
      schoolEmail: school?.email,
      reference: invoice.reference,
      issuedDate: new Date(invoice.issued_date).toLocaleDateString("en-KE"),
      dueDate: invoice.due_date ? new Date(invoice.due_date).toLocaleDateString("en-KE") : undefined,
      status: invoice.status,
      termName: invoice.terms?.name,
      academicYear: invoice.academic_years?.name,
      guardianName: guardian?.name,
      guardianPhone: guardian?.phone,
      guardianEmail: guardian?.email,
      studentName: `${invoice.students?.first_name || ""} ${invoice.students?.last_name || ""}`.trim(),
      admissionNumber: invoice.students?.admission_number,
      items: (invoice.invoice_items || []).map((item: any) => ({
        description: item.description,
        amount: Number(item.amount),
      })),
      totalAmount: Number(invoice.amount),
      payments: payments
        .filter((p) => p.status === "completed")
        .map((p) => ({
          date: new Date(p.paid_at || p.created_at).toLocaleDateString("en-KE"),
          method: p.method,
          ref: p.transaction_ref,
          amount: Number(p.amount),
        })),
      totalPaid,
      balance,
    })
    doc.save(`Invoice-${invoice.reference}.pdf`)
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Invoice ${invoice.reference}`,
          text: `Invoice ${invoice.reference} for KES ${Number(invoice.amount).toLocaleString()}. Balance: KES ${balance.toLocaleString()}.`,
          url: window.location.href,
        })
      } catch {
        // User cancelled share
      }
    } else {
      await navigator.clipboard.writeText(window.location.href)
      alert("Invoice link copied to clipboard!")
    }
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
          <h1 className="mt-4 text-3xl font-bold">Invoice {invoice.reference}</h1>
          <p className="text-muted-foreground">
            {invoice.students?.first_name} {invoice.students?.last_name}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
          <Button variant="outline" onClick={handleDownload}>
            <Download className="mr-2 h-4 w-4" />
            Download PDF
          </Button>
          <Button variant="outline" onClick={handleShare}>
            <Share2 className="mr-2 h-4 w-4" />
            Share
          </Button>
        </div>
      </div>

      <Card className="print:shadow-none print:border-0">
        <CardContent className="p-8">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h2 className="text-2xl font-bold">{school?.name || "School Name"}</h2>
              {school?.address && <p className="text-sm text-muted-foreground">{school.address}</p>}
              {school?.phone && <p className="text-sm text-muted-foreground">Phone: {school.phone}</p>}
              {school?.email && <p className="text-sm text-muted-foreground">Email: {school.email}</p>}
            </div>
            <div className="text-right">
              <h3 className="text-xl font-bold">INVOICE</h3>
              <p className="text-sm text-muted-foreground">Reference: {invoice.reference}</p>
              <p className="text-sm text-muted-foreground">
                Date: {new Date(invoice.issued_date).toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="mb-8">
            <h4 className="font-semibold mb-2">Bill To:</h4>
            <p className="text-sm">{guardian?.name || "Guardian Name"}</p>
            {guardian?.phone && <p className="text-sm text-muted-foreground">Phone: {guardian.phone}</p>}
            {guardian?.email && <p className="text-sm text-muted-foreground">Email: {guardian.email}</p>}
            <p className="text-sm mt-2">
              Student: {invoice.students?.first_name} {invoice.students?.last_name}
              {invoice.students?.admission_number && ` (${invoice.students.admission_number})`}
            </p>
          </div>

          <div className="mb-8">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4 font-semibold">Description</th>
                  <th className="text-right py-2 px-4 font-semibold">Amount (KES)</th>
                </tr>
              </thead>
              <tbody>
                {invoice.invoice_items?.map((item: any) => (
                  <tr key={item.id} className="border-b">
                    <td className="py-2 px-4">{item.description}</td>
                    <td className="text-right py-2 px-4">{item.amount.toLocaleString()}</td>
                  </tr>
                ))}
                <tr className="border-t-2 font-bold">
                  <td className="py-2 px-4">Total</td>
                  <td className="text-right py-2 px-4">{invoice.amount.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {payments.length > 0 && (
            <div className="mb-8">
              <h4 className="font-semibold mb-2">Payment History:</h4>
              <div className="space-y-2">
                {payments.map((payment) => (
                  <div key={payment.id} className="flex justify-between text-sm">
                    <span>
                      {new Date(payment.paid_at || payment.created_at).toLocaleDateString()} - {payment.method}
                      {payment.transaction_ref && ` (${payment.transaction_ref})`}
                      {payment.receipt_number && (
                        <>
                          {" • "}
                          <Link href={`/dashboard/accountant/fees/receipts/${payment.id}`} className="underline">
                            {payment.receipt_number}
                          </Link>
                        </>
                      )}
                    </span>
                    <span>KES {payment.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t flex justify-between font-semibold">
                <span>Total Paid:</span>
                <span>KES {totalPaid.toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-bold text-lg">
                <span>Balance:</span>
                <span className={cn(balance > 0 ? "text-red-600" : "text-emerald-600")}>
                  KES {balance.toLocaleString()}
                </span>
              </div>
            </div>
          )}

          <div className="mt-8 pt-8 border-t text-sm text-muted-foreground">
            <p>
              Due Date: {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : "N/A"}
            </p>
            <p className="mt-2">
              Status: <span className={cn(
                "font-semibold",
                invoice.status === "paid" ? "text-emerald-600" :
                invoice.status === "overdue" ? "text-red-600" :
                "text-amber-600"
              )}>
                {invoice.status.toUpperCase()}
              </span>
            </p>
            {invoice.terms && (
              <p className="mt-2">
                Term: {invoice.terms.name} - {invoice.academic_years?.name}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
