"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { recordPayment } from "@/lib/actions/payments"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

interface RecordPaymentPageClientProps {
  invoices: any[]
}

export function RecordPaymentPageClient({ invoices }: RecordPaymentPageClientProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("")

  const selectedInvoice = invoices.find((inv) => inv.id === selectedInvoiceId)

  const [formData, setFormData] = useState({
    invoice_id: "",
    amount: "",
    method: "cash",
    transaction_ref: "",
    paid_at: new Date().toISOString().split("T")[0],
  })

  const handleInvoiceChange = (invoiceId: string) => {
    setSelectedInvoiceId(invoiceId)
    setFormData({ ...formData, invoice_id: invoiceId })
    
    const invoice = invoices.find((inv) => inv.id === invoiceId)
    if (invoice) {
      // Set amount to invoice amount by default
      setFormData((prev) => ({ ...prev, amount: invoice.amount.toString() }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const formDataObj = new FormData()
      formDataObj.append("invoice_id", formData.invoice_id)
      formDataObj.append("amount", formData.amount)
      formDataObj.append("method", formData.method)
      if (formData.transaction_ref) {
        formDataObj.append("transaction_ref", formData.transaction_ref)
      }
      formDataObj.append("paid_at", formData.paid_at)

      await recordPayment(formDataObj)

      toast({
        title: "Success!",
        description: "Payment recorded successfully.",
      })

      router.push("/dashboard/accountant/fees")
      router.refresh()
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to record payment",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/accountant/fees">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Fees
          </Button>
        </Link>
        <h1 className="mt-4 text-3xl font-bold">Record Payment</h1>
        <p className="text-muted-foreground">
          Record a payment for an invoice
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>Payment Details</CardTitle>
            <CardDescription>
              Enter payment information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="invoice_id">Invoice *</Label>
              <Select
                value={formData.invoice_id}
                onValueChange={handleInvoiceChange}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select invoice" />
                </SelectTrigger>
                <SelectContent>
                  {invoices.map((invoice) => (
                    <SelectItem key={invoice.id} value={invoice.id}>
                      {invoice.reference} - KES {invoice.amount.toLocaleString()} ({invoice.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedInvoice && (
                <p className="text-sm text-muted-foreground">
                  Invoice Amount: KES {selectedInvoice.amount.toLocaleString()} • 
                  Due Date: {selectedInvoice.due_date ? new Date(selectedInvoice.due_date).toLocaleDateString() : "N/A"}
                </p>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.amount}
                  onChange={(e) =>
                    setFormData({ ...formData, amount: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="method">Payment Method *</Label>
                <Select
                  value={formData.method}
                  onValueChange={(value) =>
                    setFormData({ ...formData, method: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="mpesa">M-Pesa</SelectItem>
                    <SelectItem value="paystack">Paystack</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="transaction_ref">Transaction Reference</Label>
                <Input
                  id="transaction_ref"
                  value={formData.transaction_ref}
                  onChange={(e) =>
                    setFormData({ ...formData, transaction_ref: e.target.value })
                  }
                  placeholder="e.g., M-Pesa confirmation code"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="paid_at">Payment Date *</Label>
                <Input
                  id="paid_at"
                  type="date"
                  value={formData.paid_at}
                  onChange={(e) =>
                    setFormData({ ...formData, paid_at: e.target.value })
                  }
                  required
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Link href="/dashboard/accountant/fees">
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Link>
            <Button type="submit" disabled={loading}>
              {loading ? "Recording..." : "Record Payment"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}




