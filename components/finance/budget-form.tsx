"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createBudget } from "@/lib/actions/budgets"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"

interface BudgetFormProps {
  accounts: any[]
  categories: any[]
  academicYears: any[]
}

export function BudgetForm({ accounts, categories, academicYears }: BudgetFormProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    budget_name: "",
    budget_type: "revenue",
    academic_year_id: "",
    account_id: "",
    category_id: "",
    period_start: new Date().toISOString().split("T")[0],
    period_end: "",
    budgeted_amount: "",
    notes: "",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const formDataObj = new FormData()
      Object.entries(formData).forEach(([key, value]) => {
        if (value) formDataObj.append(key, value)
      })

      await createBudget(formDataObj)
      
      toast({
        title: "Success",
        description: "Budget created successfully",
      })

      router.refresh()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create budget",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Filter accounts based on budget type
  const filteredAccounts = formData.budget_type === "revenue"
    ? accounts.filter((a: any) => a.account_type === "revenue")
    : accounts.filter((a: any) => a.account_type === "expense")

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="budget_name">Budget Name *</Label>
          <Input
            id="budget_name"
            value={formData.budget_name}
            onChange={(e) => setFormData({ ...formData, budget_name: e.target.value })}
            placeholder="e.g., Term 1 Fee Revenue Budget"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="budget_type">Budget Type *</Label>
          <Select
            value={formData.budget_type}
            onValueChange={(value) => setFormData({ ...formData, budget_type: value, account_id: "", category_id: "" })}
            required
          >
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="revenue">Revenue</SelectItem>
              <SelectItem value="expense">Expense</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="academic_year_id">Academic Year</Label>
          <Select
            value={formData.academic_year_id}
            onValueChange={(value) => setFormData({ ...formData, academic_year_id: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select academic year (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="null">None</SelectItem>
              {academicYears.map((ay: any) => (
                <SelectItem key={ay.id} value={ay.id}>
                  {ay.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {formData.budget_type === "expense" ? (
          <div className="space-y-2">
            <Label htmlFor="category_id">Expense Category</Label>
            <Select
              value={formData.category_id}
              onValueChange={(value) => setFormData({ ...formData, category_id: value, account_id: "" })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="null">None</SelectItem>
                {categories.map((cat: any) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="account_id">Revenue Account</Label>
            <Select
              value={formData.account_id}
              onValueChange={(value) => setFormData({ ...formData, account_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select account (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="null">None</SelectItem>
                {filteredAccounts.map((acc: any) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.account_code} - {acc.account_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="period_start">Period Start *</Label>
          <Input
            id="period_start"
            type="date"
            value={formData.period_start}
            onChange={(e) => setFormData({ ...formData, period_start: e.target.value })}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="period_end">Period End *</Label>
          <Input
            id="period_end"
            type="date"
            value={formData.period_end}
            onChange={(e) => setFormData({ ...formData, period_end: e.target.value })}
            required
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="budgeted_amount">Budgeted Amount (KES) *</Label>
          <Input
            id="budgeted_amount"
            type="number"
            step="0.01"
            min="0"
            value={formData.budgeted_amount}
            onChange={(e) => setFormData({ ...formData, budgeted_amount: e.target.value })}
            placeholder="0.00"
            required
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="notes">Notes</Label>
          <Input
            id="notes"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Additional notes (optional)"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting} className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
          {isSubmitting ? "Creating..." : "Create Budget"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  )
}



