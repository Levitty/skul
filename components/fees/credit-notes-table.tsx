"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { approveCreditNote, applyCreditNote, voidCreditNote } from "@/lib/actions/credit-notes"
import { format } from "date-fns"

interface CreditNotesTableProps {
  creditNotes: any[]
}

const statusColors = {
  draft: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  approved: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  applied: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  voided: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
}

const reasonLabels = {
  scholarship: "Scholarship",
  discount: "Discount",
  "billing-error": "Billing Error",
  refund: "Refund",
  other: "Other",
}

export function CreditNotesTable({ creditNotes }: CreditNotesTableProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState<string | null>(null)

  const handleApprove = async (creditNoteId: string) => {
    setLoading(creditNoteId)
    try {
      await approveCreditNote(creditNoteId)
      toast({
        title: "Success",
        description: "Credit note approved successfully.",
      })
      router.refresh()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to approve credit note",
        variant: "destructive",
      })
    } finally {
      setLoading(null)
    }
  }

  const handleApply = async (creditNoteId: string) => {
    setLoading(creditNoteId)
    try {
      await applyCreditNote(creditNoteId)
      toast({
        title: "Success",
        description: "Credit note applied successfully.",
      })
      router.refresh()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to apply credit note",
        variant: "destructive",
      })
    } finally {
      setLoading(null)
    }
  }

  const handleVoid = async (creditNoteId: string) => {
    setLoading(creditNoteId)
    try {
      await voidCreditNote(creditNoteId)
      toast({
        title: "Success",
        description: "Credit note voided successfully.",
      })
      router.refresh()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to void credit note",
        variant: "destructive",
      })
    } finally {
      setLoading(null)
    }
  }

  if (creditNotes.length === 0) {
    return (
      <Card className="border-0 shadow-lg">
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground mb-4">No credit notes found</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-0 shadow-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                Credit Note #
              </th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                Student
              </th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                Invoice
              </th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                Amount
              </th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                Reason
              </th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                Issued Date
              </th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                Status
              </th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {creditNotes.map((creditNote) => (
              <tr key={creditNote.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                  {creditNote.credit_number}
                </td>
                <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                  {creditNote.students?.first_name} {creditNote.students?.last_name}
                  {creditNote.students?.admission_number && (
                    <div className="text-xs text-muted-foreground">
                      {creditNote.students.admission_number}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                  {creditNote.invoices?.reference || "N/A"}
                </td>
                <td className="px-6 py-4 text-sm font-semibold text-gray-900 dark:text-white">
                  KES {Number(creditNote.amount).toLocaleString()}
                </td>
                <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                  {reasonLabels[creditNote.reason as keyof typeof reasonLabels] || creditNote.reason}
                </td>
                <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                  {format(new Date(creditNote.issued_at), "dd MMM yyyy")}
                </td>
                <td className="px-6 py-4 text-sm">
                  <Badge className={statusColors[creditNote.status as keyof typeof statusColors]}>
                    {creditNote.status.charAt(0).toUpperCase() + creditNote.status.slice(1)}
                  </Badge>
                </td>
                <td className="px-6 py-4 text-sm space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {creditNote.status === "draft" && (
                      <>
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleApprove(creditNote.id)}
                          disabled={loading === creditNote.id}
                          className="text-xs"
                        >
                          {loading === creditNote.id ? "Approving..." : "Approve"}
                        </Button>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={loading === creditNote.id}
                              className="text-xs"
                            >
                              Void
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Void Credit Note</DialogTitle>
                              <DialogDescription>
                                Are you sure you want to void this credit note? This action cannot be undone.
                              </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                              <Button variant="outline">Cancel</Button>
                              <Button
                                variant="destructive"
                                onClick={() => handleVoid(creditNote.id)}
                              >
                                Void
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </>
                    )}

                    {creditNote.status === "approved" && (
                      <>
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleApply(creditNote.id)}
                          disabled={loading === creditNote.id}
                          className="text-xs"
                        >
                          {loading === creditNote.id ? "Applying..." : "Apply"}
                        </Button>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={loading === creditNote.id}
                              className="text-xs"
                            >
                              Void
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Void Credit Note</DialogTitle>
                              <DialogDescription>
                                Are you sure you want to void this credit note? This action cannot be undone.
                              </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                              <Button variant="outline">Cancel</Button>
                              <Button
                                variant="destructive"
                                onClick={() => handleVoid(creditNote.id)}
                              >
                                Void
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </>
                    )}

                    {(creditNote.status === "applied" || creditNote.status === "voided") && (
                      <span className="text-xs text-muted-foreground">
                        {creditNote.status === "applied" ? "Applied" : "Voided"}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
