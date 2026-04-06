"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { recordOtherIncome } from "@/lib/actions/other-income"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"

interface OtherIncomeFormProps {
  students?: any[]
}

export function OtherIncomeForm({ students = [] }: OtherIncomeFormProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    income_type: "",
    student_id: "",
    description: "",
    amount: "",
    payment_method: "",
    transaction_ref: "",
    received_date: new Date().toISOString().split("T")[0],
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const formDataObj = new FormData()
      Object.entries(formData).forEach(([key, value]) => {
        if (value) formDataObj.append(key, value)
      })

      await recordOtherIncome(formDataObj)
      
      toast({
        title: "Success",
        description: "Other income recorded successfully",
      })

      router.refresh()
      router.push("/dashboard/accountant/finance/other-income")
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to record income",
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
          <Label htmlFor="income_type">Income Type *</Label>
          <Select
            value={formData.income_type}
            onValueChange={(value) => setFormData({ ...formData, income_type: value })}
            required
          >
            <SelectTrigger>
              <SelectValue placeholder="Select income type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="donation">Donation</SelectItem>
              <SelectItem value="uniform_sale">Uniform Sales</SelectItem>
              <SelectItem value="book_sales">Book Sales</SelectItem>
              <SelectItem value="event_revenue">Event Revenue</SelectItem>
              <SelectItem value="rental_income">Rental Income</SelectItem>
              <SelectItem value="interest_income">Interest Income</SelectItem>
              <SelectItem value="government_grant">Government Grant</SelectItem>
              <SelectItem value="trip_payment">Trip Payment</SelectItem>
              <SelectItem value="club_fee">Club Fee</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="student_id">Student (Optional)</Label>
          <Select
            value={formData.student_id}
            onValueChange={(value) => setFormData({ ...formData, student_id: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select student (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="null">None</SelectItem>
              {students.map((student: any) => (
                <SelectItem key={student.id} value={student.id}>
                  {student.first_name} {student.last_name} ({student.admission_number})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description *</Label>
          <Input
            id="description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Enter description"
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
          <Label htmlFor="payment_method">Payment Method</Label>
          <Select
            value={formData.payment_method}
            onValueChange={(value) => setFormData({ ...formData, payment_method: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select payment method" />
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
            onChange={(e) => setFormData({ ...formData, transaction_ref: e.target.value })}
            placeholder="Optional transaction reference"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="received_date">Received Date *</Label>
          <Input
            id="received_date"
            type="date"
            value={formData.received_date}
            onChange={(e) => setFormData({ ...formData, received_date: e.target.value })}
            required
          />
        </div>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting} className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700">
          {isSubmitting ? "Recording..." : "Record Income"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  )
}



