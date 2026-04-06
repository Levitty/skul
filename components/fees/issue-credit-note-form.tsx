"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { createCreditNote } from "@/lib/actions/credit-notes"
import { format } from "date-fns"

interface IssueCreditNoteFormProps {
  invoices: any[]
  students: any[]
}

const reasonOptions = [
  { value: "scholarship", label: "Scholarship" },
  { value: "discount", label: "Discount" },
  { value: "billing-error", label: "Billing Error" },
  { value: "refund", label: "Refund" },
  { value: "other", label: "Other" },
]

export function IssueCreditNoteForm({ invoices, students }: IssueCreditNoteFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("")
  const [selectedStudentId, setSelectedStudentId] = useState("")

  const [formData, setFormData] = useState({
    invoice_id: "",
    amount: "",
    reason: "discount",
    description: "",
  })

  const selectedInvoice = invoices.find((inv) => inv.id === selectedInvoiceId)
  const selectedStudent = students.find((s) => s.id === selectedStudentId)

  // Filter invoices by selected student
  const studentInvoices = selectedStudentId
    ? invoices.filter((inv) => inv.student_id === selectedStudentId)
    : []

  // Calculate outstanding balance
  let outstandingBalance = 0
  if (selectedInvoice) {
    const paid = 0 // simplified for this form
    const discountAmount = Number(selectedInvoice.discount_amount || 0)
    const invoiceAmount = Number(selectedInvoice.amount || 0)
    outstandingBalance = invoiceAmount - discountAmount - paid
  }

  const handleStudentChange = (studentId: string) => {
    setSelectedStudentId(studentId)
    setSelectedInvoiceId("") // Reset invoice when student changes
    setFormData((prev) => ({
      ...prev,
      invoice_id: "",
      amount: "",
    }))
  }

  const handleInvoiceChange = (invoiceId: string) => {
    setSelectedInvoiceId(invoiceId)
    setFormData((prev) => ({
      ...prev,
      invoice_id: invoiceId,
      amount: "",
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (!formData.invoice_id) {
        throw new Error("Please select an invoice")
      }

      if (!formData.amount || Number(formData.amount) <= 0) {
        throw new Error("Please enter a valid amount")
      }

      const amount = Number(formData.amount)
      if (amount > outstandingBalance) {
        throw new Error(
          `Credit note amount (${amount}) exceeds outstanding balance (${outstandingBalance})`
        )
      }

      if (!formData.reason) {
        throw new Error("Please select a reason")
      }

      const result = await createCreditNote(
        formData.invoice_id,
        amount,
        formData.reason,
        formData.description || undefined
      )

      toast({
        title: "Success!",
        description: `Credit note ${result.creditNumber} issued successfully.`,
      })

      // Reset form
      setFormData({
        invoice_id: "",
        amount: "",
        reason: "discount",
        description: "",
      })
      setSelectedInvoiceId("")
      setSelectedStudentId("")

      router.refresh()
      // Switch to list tab
      const listTab = document.querySelector('[value="list"]')
      if (listTab) {
        ;(listTab as HTMLElement).click()
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to issue credit note",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="border-0 shadow-lg max-w-2xl">
      <CardHeader>
        <CardTitle>Issue New Credit Note</CardTitle>
        <CardDescription>
          Create a credit note to adjust an invoice balance
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Student Selection */}
          <div className="space-y-2">
            <Label htmlFor="student">Student *</Label>
            <select
              id="student"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              value={selectedStudentId}
              onChange={(e) => handleStudentChange(e.target.value)}
            >
              <option value="">Select a student</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.first_name} {student.last_name} ({student.admission_number})
                </option>
              ))}
            </select>
          </div>

          {/* Invoice Selection */}
          {selectedStudentId && studentInvoices.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="invoice">Invoice *</Label>
              <select
                id="invoice"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                value={selectedInvoiceId}
                onChange={(e) => handleInvoiceChange(e.target.value)}
              >
                <option value="">Select an invoice</option>
                {studentInvoices.map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.reference} - KES {Number(invoice.amount).toLocaleString()}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedStudentId && studentInvoices.length === 0 && (
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md text-sm text-amber-800 dark:text-amber-200">
              No unpaid invoices found for this student.
            </div>
          )}

          {/* Invoice Details */}
          {selectedInvoice && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md space-y-2">
              <div className="text-sm">
                <span className="font-semibold">Invoice Amount:</span>{" "}
                <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                  KES {Number(selectedInvoice.amount).toLocaleString()}
                </span>
              </div>
              {Number(selectedInvoice.discount_amount || 0) > 0 && (
                <div className="text-sm">
                  <span className="font-semibold">Existing Discount:</span>{" "}
                  <span className="text-orange-600 dark:text-orange-400">
                    KES {Number(selectedInvoice.discount_amount).toLocaleString()}
                  </span>
                </div>
              )}
              <div className="text-sm">
                <span className="font-semibold">Outstanding Balance:</span>{" "}
                <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                  KES {outstandingBalance.toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">
              Credit Note Amount (max: KES {outstandingBalance.toLocaleString()}) *
            </Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              max={outstandingBalance}
              placeholder="0.00"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              disabled={!selectedInvoiceId}
              className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">Reason for Credit Note *</Label>
            <select
              id="reason"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
            >
              {reasonOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              placeholder="Enter any additional details..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              rows={4}
            />
          </div>

          {/* Submit Button */}
          <div className="flex gap-4 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFormData({
                  invoice_id: "",
                  amount: "",
                  reason: "discount",
                  description: "",
                })
                setSelectedInvoiceId("")
                setSelectedStudentId("")
              }}
              disabled={loading}
            >
              Clear
            </Button>
            <Button
              type="submit"
              disabled={loading || !selectedInvoiceId}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/30 transition-all duration-200 hover:shadow-xl hover:shadow-emerald-500/40 hover:scale-[1.02]"
            >
              {loading ? "Issuing..." : "Issue Credit Note"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
