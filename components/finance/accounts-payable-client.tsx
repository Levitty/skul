"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useState } from "react"
import { payAccountsPayable } from "@/lib/actions/accounts-payable"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface AccountsPayableClientProps {
  payables: any[]
}

export function AccountsPayableClient({ payables }: AccountsPayableClientProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [payingId, setPayingId] = useState<string | null>(null)
  const [paymentData, setPaymentData] = useState({
    amount: "",
    payment_method: "bank_transfer",
    payment_date: new Date().toISOString().split("T")[0],
    transaction_ref: "",
    notes: "",
  })

  const handlePay = async (apId: string, totalAmount: number) => {
    setPayingId(apId)
    setPaymentData({
      ...paymentData,
      amount: totalAmount.toString(),
    })
  }

  const handleSubmitPayment = async (apId: string) => {
    try {
      const formData = new FormData()
      formData.append("amount", paymentData.amount)
      formData.append("payment_method", paymentData.payment_method)
      formData.append("payment_date", paymentData.payment_date)
      if (paymentData.transaction_ref) formData.append("transaction_ref", paymentData.transaction_ref)
      if (paymentData.notes) formData.append("notes", paymentData.notes)

      await payAccountsPayable(apId, formData)
      
      toast({
        title: "Success",
        description: "Payment recorded successfully",
      })

      router.refresh()
      setPayingId(null)
      setPaymentData({
        amount: "",
        payment_method: "bank_transfer",
        payment_date: new Date().toISOString().split("T")[0],
        transaction_ref: "",
        notes: "",
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to record payment",
        variant: "destructive",
      })
    }
  }

  if (payables.length === 0) {
    return (
      <Card className="border-0 shadow-xl">
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No accounts payable records</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-0 shadow-xl">
      <CardHeader>
        <CardTitle>Outstanding Bills</CardTitle>
        <CardDescription>Manage vendor payments</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {payables.map((ap: any) => {
            const amount = Number(ap.amount) || 0
            const paidAmount = Number(ap.paid_amount) || 0
            const outstanding = amount - paidAmount
            const dueDate = new Date(ap.due_date)
            const today = new Date()
            const isOverdue = dueDate < today && ap.status !== "paid"

            return (
              <div key={ap.id} className="p-4 rounded-lg border border-gray-200 dark:border-gray-800">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold">{ap.vendor_name}</h3>
                      <Badge
                        variant="outline"
                        className={
                          ap.status === "paid"
                            ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300"
                            : ap.status === "overdue" || isOverdue
                            ? "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300"
                            : "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300"
                        }
                      >
                        {ap.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{ap.description}</p>
                    {ap.invoice_number && (
                      <p className="text-xs text-muted-foreground">Invoice: {ap.invoice_number}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Total Amount</p>
                    <p className="font-semibold">KES {amount.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Paid</p>
                    <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                      KES {paidAmount.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Outstanding</p>
                    <p className="font-semibold text-red-600 dark:text-red-400">
                      KES {outstanding.toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Due Date</p>
                    <p className={`text-sm font-medium ${isOverdue ? "text-red-600 dark:text-red-400" : ""}`}>
                      {dueDate.toLocaleDateString()}
                    </p>
                  </div>
                  {outstanding > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePay(ap.id, outstanding)}
                    >
                      Record Payment
                    </Button>
                  )}
                </div>

                {payingId === ap.id && (
                  <div className="mt-4 p-4 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
                    <h4 className="font-semibold mb-3">Record Payment</h4>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="amount">Amount (KES)</Label>
                        <Input
                          id="amount"
                          type="number"
                          step="0.01"
                          value={paymentData.amount}
                          onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="payment_method">Payment Method</Label>
                        <Select
                          value={paymentData.payment_method}
                          onValueChange={(value) => setPaymentData({ ...paymentData, payment_method: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cash">Cash</SelectItem>
                            <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                            <SelectItem value="cheque">Cheque</SelectItem>
                            <SelectItem value="mpesa">M-Pesa</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="payment_date">Payment Date</Label>
                        <Input
                          id="payment_date"
                          type="date"
                          value={paymentData.payment_date}
                          onChange={(e) => setPaymentData({ ...paymentData, payment_date: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="transaction_ref">Transaction Reference</Label>
                        <Input
                          id="transaction_ref"
                          value={paymentData.transaction_ref}
                          onChange={(e) => setPaymentData({ ...paymentData, transaction_ref: e.target.value })}
                          placeholder="Optional"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <Button
                        size="sm"
                        onClick={() => handleSubmitPayment(ap.id)}
                      >
                        Record Payment
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPayingId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

