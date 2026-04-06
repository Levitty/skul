"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { recordExpense } from "@/lib/actions/expenses"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"

interface ExpenseFormProps {
  categories: any[]
}

export function ExpenseForm({ categories }: ExpenseFormProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [categoryId, setCategoryId] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("")
  const [paymentStatus, setPaymentStatus] = useState("unpaid")
  const [formData, setFormData] = useState({
    vendor_name: "",
    description: "",
    amount: "",
    expense_date: new Date().toISOString().split("T")[0],
    invoice_number: "",
    receipt_url: "",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      // Validate required fields
      if (!categoryId) {
        toast({
          title: "Validation Error",
          description: "Please select an expense category",
          variant: "destructive",
        })
        setIsSubmitting(false)
        return
      }

      if (!formData.description || !formData.amount) {
        toast({
          title: "Validation Error",
          description: "Please fill in all required fields",
          variant: "destructive",
        })
        setIsSubmitting(false)
        return
      }

      const formDataObj = new FormData()
      formDataObj.append("category_id", categoryId)
      formDataObj.append("payment_status", paymentStatus)
      if (paymentMethod) formDataObj.append("payment_method", paymentMethod)
      Object.entries(formData).forEach(([key, value]) => {
        if (value) formDataObj.append(key, value)
      })

      await recordExpense(formDataObj)
      
      toast({
        title: "Success",
        description: "Expense recorded successfully",
      })

      // Reset form
      setCategoryId("")
      setPaymentMethod("")
      setPaymentStatus("unpaid")
      setFormData({
        vendor_name: "",
        description: "",
        amount: "",
        expense_date: new Date().toISOString().split("T")[0],
        invoice_number: "",
        receipt_url: "",
      })

      router.refresh()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to record expense",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="category_id">Expense Category *</Label>
          <Select
            value={categoryId}
            onValueChange={setCategoryId}
            required
          >
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {categories.length === 0 ? (
                <SelectItem value="none" disabled>No categories available</SelectItem>
              ) : (
                categories.map((category: any) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <input type="hidden" name="category_id" value={categoryId} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="vendor_name">Vendor Name</Label>
          <Input
            id="vendor_name"
            value={formData.vendor_name}
            onChange={(e) => setFormData({ ...formData, vendor_name: e.target.value })}
            placeholder="Vendor name"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="description">Description *</Label>
          <Input
            id="description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Enter expense description"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="amount">Amount (KES) *</Label>
          <Input
            id="amount"
            type="number"
            step="0.01"
            min="0"
            value={formData.amount}
            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
            placeholder="0.00"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="expense_date">Expense Date *</Label>
          <Input
            id="expense_date"
            type="date"
            value={formData.expense_date}
            onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="payment_method">Payment Method</Label>
          <Select
            value={paymentMethod}
            onValueChange={setPaymentMethod}
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
          <input type="hidden" name="payment_method" value={paymentMethod} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="payment_status">Payment Status</Label>
          <Select
            value={paymentStatus}
            onValueChange={setPaymentStatus}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unpaid">Unpaid</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>
          <input type="hidden" name="payment_status" value={paymentStatus} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="invoice_number">Invoice Number</Label>
          <Input
            id="invoice_number"
            value={formData.invoice_number}
            onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
            placeholder="Vendor invoice number"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="receipt_url">Receipt URL</Label>
          <Input
            id="receipt_url"
            type="url"
            value={formData.receipt_url}
            onChange={(e) => setFormData({ ...formData, receipt_url: e.target.value })}
            placeholder="Link to receipt/document"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting} className="bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700">
          {isSubmitting ? "Recording..." : "Record Expense"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  )
}



