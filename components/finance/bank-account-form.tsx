"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createBankAccount, updateBankAccount } from "@/lib/actions/bank-accounts"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"

interface BankAccountFormProps {
  account?: any
}

export function BankAccountForm({ account }: BankAccountFormProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    account_name: account?.account_name || "",
    account_number: account?.account_number || "",
    bank_name: account?.bank_name || "",
    account_type: account?.account_type || "",
    opening_balance: account?.opening_balance?.toString() || "0",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const formDataObj = new FormData()
      Object.entries(formData).forEach(([key, value]) => {
        if (value) formDataObj.append(key, value)
      })

      if (account) {
        await updateBankAccount(account.id, formDataObj)
        toast({
          title: "Success",
          description: "Bank account updated successfully",
        })
      } else {
        await createBankAccount(formDataObj)
        toast({
          title: "Success",
          description: "Bank account created successfully",
        })
      }

      router.refresh()
      router.push("/dashboard/accountant/finance/banking")
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save bank account",
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
          <Label htmlFor="account_name">Account Name *</Label>
          <Input
            id="account_name"
            value={formData.account_name}
            onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
            placeholder="e.g., Main Operating Account"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="bank_name">Bank Name *</Label>
          <Input
            id="bank_name"
            value={formData.bank_name}
            onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
            placeholder="e.g., Equity Bank"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="account_number">Account Number *</Label>
          <Input
            id="account_number"
            value={formData.account_number}
            onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
            placeholder="Account number"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="account_type">Account Type</Label>
          <Select
            value={formData.account_type}
            onValueChange={(value) => setFormData({ ...formData, account_type: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="checking">Checking</SelectItem>
              <SelectItem value="savings">Savings</SelectItem>
              <SelectItem value="mpesa">M-Pesa</SelectItem>
              <SelectItem value="paystack">Paystack</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="opening_balance">Opening Balance (KES)</Label>
          <Input
            id="opening_balance"
            type="number"
            step="0.01"
            value={formData.opening_balance}
            onChange={(e) => setFormData({ ...formData, opening_balance: e.target.value })}
            placeholder="0.00"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting} className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
          {isSubmitting ? "Saving..." : account ? "Update Account" : "Create Account"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  )
}



