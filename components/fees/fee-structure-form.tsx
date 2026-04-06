"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createFeeStructure, updateFeeStructure } from "@/lib/actions/fee-structures"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

interface FeeStructureFormProps {
  classes: any[]
  terms: any[]
  feeStructure?: any
}

export function FeeStructureForm({ classes, terms, feeStructure }: FeeStructureFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const [formData, setFormData] = useState({
    name: feeStructure?.name || "",
    amount: feeStructure?.amount?.toString() || "",
    fee_type: feeStructure?.fee_type || "tuition",
    billing_cycle: feeStructure?.billing_cycle || "termly",
    class_id: feeStructure?.class_id || "all",
    term_id: feeStructure?.term_id || "all",
    description: feeStructure?.description || "",
    is_mandatory: feeStructure?.is_mandatory !== false,
    is_required_legacy: true, // unused, kept for compat
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const formDataObj = new FormData()
      Object.entries(formData).forEach(([key, value]) => {
        if (value !== "") {
          formDataObj.append(key, value.toString())
        }
      })

      if (feeStructure) {
        await updateFeeStructure(feeStructure.id, formDataObj)
        toast({
          title: "Success!",
          description: "Fee structure updated successfully.",
        })
      } else {
        await createFeeStructure(formDataObj)
        toast({
          title: "Success!",
          description: "Fee structure created successfully.",
        })
      }

      router.push("/dashboard/accountant/fees")
      router.refresh()
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to save fee structure",
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
        <h1 className="mt-4 text-3xl font-bold">
          {feeStructure ? "Edit Fee Structure" : "New Fee Structure"}
        </h1>
        <p className="text-muted-foreground">
          {feeStructure ? "Update fee structure details" : "Create a new fee structure"}
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>Fee Structure Details</CardTitle>
            <CardDescription>
              Define fee structure for classes and terms
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Fee Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="e.g., Tuition Fee, Boarding Fee"
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
                  onChange={(e) =>
                    setFormData({ ...formData, amount: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fee_type">Fee Type *</Label>
                <Select
                  value={formData.fee_type}
                  onValueChange={(value) =>
                    setFormData({ ...formData, fee_type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tuition">Tuition</SelectItem>
                    <SelectItem value="uniform">Uniform</SelectItem>
                    <SelectItem value="transport">Transport</SelectItem>
                    <SelectItem value="exam">Exam</SelectItem>
                    <SelectItem value="library">Library</SelectItem>
                    <SelectItem value="hostel">Hostel/Boarding</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="billing_cycle">Billing Cycle *</Label>
                <Select
                  value={formData.billing_cycle}
                  onValueChange={(value) =>
                    setFormData({ ...formData, billing_cycle: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="termly">Termly</SelectItem>
                    <SelectItem value="annually">Annually</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="class_id">Class (Optional)</Label>
                <Select
                  value={formData.class_id}
                  onValueChange={(value) =>
                    setFormData({ ...formData, class_id: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Classes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Classes</SelectItem>
                    {classes.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="term_id">Term (Optional)</Label>
                <Select
                  value={formData.term_id}
                  onValueChange={(value) =>
                    setFormData({ ...formData, term_id: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Terms" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Terms</SelectItem>
                    {terms.map((term) => (
                      <SelectItem key={term.id} value={term.id}>
                        {term.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                className="w-full min-h-[100px] rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Additional details about this fee..."
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_mandatory"
                checked={formData.is_mandatory}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_mandatory: checked as boolean })
                }
              />
              <Label htmlFor="is_mandatory" className="cursor-pointer">
                Mandatory fee (applies to all students; uncheck for optional/elective fees)
              </Label>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Link href="/dashboard/accountant/fees">
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Link>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : feeStructure ? "Update Fee Structure" : "Create Fee Structure"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}

