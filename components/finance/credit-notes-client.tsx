"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createCreditNote } from "@/lib/actions/credit-notes"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { FileText, Plus } from "lucide-react"

interface CreditNotesClientProps {
  creditNotes: any[]
  invoices: any[]
}

export function CreditNotesClient({ creditNotes, invoices }: CreditNotesClientProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    invoiceId: "",
    amount: "",
    reason: "",
  })

  const totalCredited = creditNotes.reduce((sum, cn) => sum + Number(cn.amount || 0), 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const amountNum = parseFloat(formData.amount)
    if (!formData.invoiceId) {
      toast({
        title: "Validation Error",
        description: "Please select an invoice",
        variant: "destructive",
      })
      return
    }
    if (!formData.amount || isNaN(amountNum) || amountNum <= 0) {
      toast({
        title: "Validation Error",
        description: "Amount must be greater than 0",
        variant: "destructive",
      })
      return
    }
    if (!formData.reason.trim()) {
      toast({
        title: "Validation Error",
        description: "Reason is required",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)
    try {
      await createCreditNote(formData.invoiceId, amountNum, formData.reason.trim())
      toast({
        title: "Success",
        description: "Credit note issued successfully",
      })
      router.refresh()
      setDialogOpen(false)
      setFormData({ invoiceId: "", amount: "", reason: "" })
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to issue credit note",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-0 shadow-xl">
          <CardHeader className="pb-3">
            <CardDescription>Total Credit Notes</CardDescription>
            <CardTitle className="text-2xl">{creditNotes.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-0 shadow-xl">
          <CardHeader className="pb-3">
            <CardDescription>Total Amount Credited</CardDescription>
            <CardTitle className="text-2xl text-emerald-600 dark:text-emerald-400">
              KES {totalCredited.toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Credit Notes List */}
      <Card className="border-0 shadow-xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Credit Notes
              </CardTitle>
              <CardDescription>
                {creditNotes.length === 0
                  ? "No credit notes issued yet"
                  : `Showing ${creditNotes.length} credit note${creditNotes.length !== 1 ? "s" : ""}`}
              </CardDescription>
            </div>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Issue Credit Note
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {creditNotes.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">No credit notes have been issued yet</p>
              <Button onClick={() => setDialogOpen(true)}>Issue Credit Note</Button>
            </div>
          ) : (
            <div className="space-y-3">
              {creditNotes.map((cn: any) => {
                const student = cn.students
                const invoice = cn.invoices
                const studentName = student
                  ? `${student.first_name || ""} ${student.last_name || ""}`.trim()
                  : "—"
                return (
                  <div
                    key={cn.id}
                    className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium">{cn.credit_number}</p>
                        <span className="text-sm text-muted-foreground">
                          {new Date(cn.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span>{studentName}</span>
                        {invoice?.reference && (
                          <span>• Invoice: {invoice.reference}</span>
                        )}
                        <span>• KES {Number(cn.amount).toLocaleString()}</span>
                      </div>
                      {cn.reason && (
                        <p className="text-sm text-muted-foreground mt-2 truncate max-w-md" title={cn.reason}>
                          {cn.reason}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                        KES {Number(cn.amount).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Issue Credit Note Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue Credit Note</DialogTitle>
            <DialogDescription>
              Issue a credit note for an invoice. This will reduce the amount owed.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invoice">Invoice *</Label>
              <Select
                value={formData.invoiceId}
                onValueChange={(value) => setFormData({ ...formData, invoiceId: value })}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select invoice" />
                </SelectTrigger>
                <SelectContent>
                  {invoices.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No eligible invoices (pending, partial, or overdue)
                    </SelectItem>
                  ) : (
                    invoices.map((inv: any) => {
                      const student = inv.students
                      const studentName = student
                        ? `${student.first_name || ""} ${student.last_name || ""}`.trim()
                        : ""
                      const label = `${inv.reference}${studentName ? ` - ${studentName}` : ""} - KES ${Number(inv.amount).toLocaleString()}`
                      return (
                        <SelectItem key={inv.id} value={inv.id}>
                          {label}
                        </SelectItem>
                      )
                    })
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount (KES) *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason *</Label>
              <Textarea
                id="reason"
                placeholder="e.g., Duplicate payment, fee waiver, correction..."
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                rows={3}
                required
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="submit" disabled={isSubmitting || invoices.length === 0}>
                {isSubmitting ? "Issuing..." : "Issue Credit Note"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
