"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { approveExpense, recordExpensePayment, rejectExpense } from "@/lib/actions/expenses"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { Search, Filter, Calendar, DollarSign, Download } from "lucide-react"
import { generateVoucherPDF } from "@/lib/services/voucher-pdf"

interface ExpensesListProps {
  expenses: any[]
  categories: any[]
  school?: { name?: string; address?: string; phone?: string; email?: string } | null
}

export function ExpensesList({ expenses: initialExpenses, categories, school }: ExpensesListProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [expenses] = useState(initialExpenses)
  const [searchTerm, setSearchTerm] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [dateFilter, setDateFilter] = useState<string>("all")
  const [selectedExpense, setSelectedExpense] = useState<any>(null)
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false)
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const [approvalComments, setApprovalComments] = useState("")
  const [paymentData, setPaymentData] = useState({
    amount: "",
    payment_method: "",
    payment_date: new Date().toISOString().split("T")[0],
    transaction_ref: "",
    notes: "",
  })

  // Filter expenses
  const filteredExpenses = expenses.filter((expense: any) => {
    const matchesSearch = 
      expense.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expense.vendor_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expense.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesCategory = categoryFilter === "all" || expense.category_id === categoryFilter
    const matchesStatus = statusFilter === "all" || expense.payment_status === statusFilter

    let matchesDate = true
    if (dateFilter === "today") {
      const today = new Date().toISOString().split("T")[0]
      matchesDate = expense.expense_date === today
    } else if (dateFilter === "week") {
      const weekAgo = new Date()
      weekAgo.setDate(weekAgo.getDate() - 7)
      matchesDate = new Date(expense.expense_date) >= weekAgo
    } else if (dateFilter === "month") {
      const monthAgo = new Date()
      monthAgo.setMonth(monthAgo.getMonth() - 1)
      matchesDate = new Date(expense.expense_date) >= monthAgo
    }

    return matchesSearch && matchesCategory && matchesStatus && matchesDate
  })

  const handleRecordPayment = async () => {
    if (!selectedExpense) return

    if (!paymentData.amount || !paymentData.payment_method || !paymentData.payment_date) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required payment fields",
        variant: "destructive",
      })
      return
    }

    setIsSubmittingPayment(true)

    try {
      const formData = new FormData()
      formData.append("amount", paymentData.amount)
      formData.append("payment_method", paymentData.payment_method)
      formData.append("payment_date", paymentData.payment_date)
      if (paymentData.transaction_ref) formData.append("transaction_ref", paymentData.transaction_ref)
      if (paymentData.notes) formData.append("notes", paymentData.notes)

      await recordExpensePayment(selectedExpense.id, formData)

      toast({
        title: "Success",
        description: "Payment recorded successfully",
      })

      setIsPaymentDialogOpen(false)
      setPaymentData({
        amount: "",
        payment_method: "",
        payment_date: new Date().toISOString().split("T")[0],
        transaction_ref: "",
        notes: "",
      })
      setSelectedExpense(null)
      router.refresh()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to record payment",
        variant: "destructive",
      })
    } finally {
      setIsSubmittingPayment(false)
    }
  }

  const openPaymentDialog = (expense: any) => {
    setSelectedExpense(expense)
    const remainingAmount = Number(expense.amount) - (Number(expense.paid_amount) || 0)
    setPaymentData({
      ...paymentData,
      amount: remainingAmount > 0 ? remainingAmount.toString() : "",
    })
    setIsPaymentDialogOpen(true)
  }

  const handleApprove = async (expense: any) => {
    setIsApproving(true)
    try {
      await approveExpense(expense.id, approvalComments || undefined)
      toast({
        title: "Approved",
        description: "Expense approved successfully",
      })
      setApprovalComments("")
      router.refresh()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to approve expense",
        variant: "destructive",
      })
    } finally {
      setIsApproving(false)
    }
  }

  const handleReject = async (expense: any) => {
    setIsApproving(true)
    try {
      await rejectExpense(expense.id, approvalComments || undefined)
      toast({
        title: "Rejected",
        description: "Expense rejected",
      })
      setApprovalComments("")
      router.refresh()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to reject expense",
        variant: "destructive",
      })
    } finally {
      setIsApproving(false)
    }
  }

  const getApprovalBadge = (status?: string) => {
    const normalized = status || "pending"
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      approved: "default",
      pending: "secondary",
      rejected: "destructive",
    }
    return (
      <Badge variant={variants[normalized] || "outline"} className="capitalize">
        {normalized}
      </Badge>
    )
  }

  const handleDownloadVoucher = (expense: any) => {
    const doc = generateVoucherPDF({
      schoolName: school?.name || "School",
      schoolAddress: school?.address,
      schoolPhone: school?.phone,
      schoolEmail: school?.email,
      voucherNumber: `PV-${expense.id?.slice(0, 8) || Date.now().toString(36)}`.toUpperCase(),
      date: new Date(expense.expense_date).toLocaleDateString("en-KE"),
      payee: expense.vendor_name || "N/A",
      amount: Number(expense.amount || 0),
      description: expense.description || "Expense payment",
      category: expense.expense_categories?.name || "Uncategorized",
      paymentMethod: expense.payment_method || "N/A",
      referenceNumber: expense.invoice_number,
    })
    doc.save(`payment-voucher-${expense.id?.slice(0, 8) || "expense"}.pdf`)
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      paid: "default",
      partial: "secondary",
      unpaid: "destructive",
    }
    return (
      <Badge variant={variants[status] || "outline"} className="capitalize">
        {status}
      </Badge>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search expenses..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((category: any) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Payment Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Date Range</Label>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All dates" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Dates</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">Last 7 Days</SelectItem>
                  <SelectItem value="month">Last 30 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Expenses List */}
      <Card className="border-0 shadow-xl">
        <CardHeader>
          <CardTitle>Expenses ({filteredExpenses.length})</CardTitle>
          <CardDescription>
            {filteredExpenses.length === 0 
              ? "No expenses match your filters" 
              : `Showing ${filteredExpenses.length} expense${filteredExpenses.length !== 1 ? "s" : ""}`
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredExpenses.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No expenses found matching your criteria.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredExpenses.map((expense: any) => {
                const remainingAmount = Number(expense.amount) - (Number(expense.paid_amount) || 0)
                const approvalStatus = expense.approval_status || "pending"
                return (
                  <div
                    key={expense.id}
                    className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <p className="font-medium">{expense.description}</p>
                        {getStatusBadge(expense.payment_status)}
                        {getApprovalBadge(approvalStatus)}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(expense.expense_date).toLocaleDateString()}
                        </span>
                        <span>{expense.expense_categories?.name || "Uncategorized"}</span>
                        {expense.vendor_name && <span>• {expense.vendor_name}</span>}
                        {expense.invoice_number && <span>• Invoice: {expense.invoice_number}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-semibold text-red-600 dark:text-red-400">
                          KES {Number(expense.amount).toLocaleString()}
                        </p>
                        {expense.payment_status !== "paid" && remainingAmount > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Remaining: KES {remainingAmount.toLocaleString()}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {approvalStatus === "pending" && (
                          <>
                            <Input
                              placeholder="Approval comments"
                              value={approvalComments}
                              onChange={(e) => setApprovalComments(e.target.value)}
                              className="w-44"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isApproving}
                              onClick={() => handleApprove(expense)}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isApproving}
                              onClick={() => handleReject(expense)}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownloadVoucher(expense)}
                          title="Download Payment Voucher"
                        >
                          <Download className="w-4 h-4 mr-1" />
                          Download Voucher
                        </Button>
                        {expense.payment_status !== "paid" && approvalStatus === "approved" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openPaymentDialog(expense)}
                          >
                            <DollarSign className="w-4 h-4 mr-1" />
                            Record Payment
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Dialog */}
      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Record a payment for: {selectedExpense?.description}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <p className="text-sm text-muted-foreground">Total Amount</p>
              <p className="text-lg font-semibold">KES {selectedExpense ? Number(selectedExpense.amount).toLocaleString() : "0"}</p>
              {selectedExpense && (
                <p className="text-xs text-muted-foreground mt-1">
                  Remaining: KES {(Number(selectedExpense.amount) - (Number(selectedExpense.paid_amount) || 0)).toLocaleString()}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment_amount">Payment Amount *</Label>
              <Input
                id="payment_amount"
                type="number"
                step="0.01"
                min="0"
                value={paymentData.amount}
                onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                placeholder="0.00"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment_method">Payment Method *</Label>
              <Select
                value={paymentData.payment_method}
                onValueChange={(value) => setPaymentData({ ...paymentData, payment_method: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="mpesa">M-Pesa</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment_date">Payment Date *</Label>
              <Input
                id="payment_date"
                type="date"
                value={paymentData.payment_date}
                onChange={(e) => setPaymentData({ ...paymentData, payment_date: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="transaction_ref">Transaction Reference</Label>
              <Input
                id="transaction_ref"
                value={paymentData.transaction_ref}
                onChange={(e) => setPaymentData({ ...paymentData, transaction_ref: e.target.value })}
                placeholder="Transaction reference number"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={paymentData.notes}
                onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
                placeholder="Additional notes"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                onClick={handleRecordPayment}
                disabled={isSubmittingPayment}
                className="flex-1"
              >
                {isSubmittingPayment ? "Recording..." : "Record Payment"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsPaymentDialogOpen(false)}
                disabled={isSubmittingPayment}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
