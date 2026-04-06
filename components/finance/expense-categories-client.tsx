"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useState } from "react"
import { createExpenseCategory, updateExpenseCategory, deleteExpenseCategory } from "@/lib/actions/expense-categories"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface ExpenseCategoriesClientProps {
  categories: any[]
  accounts: any[]
}

export function ExpenseCategoriesClient({ categories, accounts }: ExpenseCategoriesClientProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    description: "",
    account_id: "",
    parent_category_id: "",
  })

  const handleCreate = async () => {
    try {
      const formDataObj = new FormData()
      Object.entries(formData).forEach(([key, value]) => {
        if (value) formDataObj.append(key, value)
      })

      await createExpenseCategory(formDataObj)
      toast({
        title: "Success",
        description: "Category created successfully",
      })
      router.refresh()
      setFormData({
        name: "",
        code: "",
        description: "",
        account_id: "",
        parent_category_id: "",
      })
      setIsCreating(false)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create category",
        variant: "destructive",
      })
    }
  }

  const handleDelete = async (categoryId: string) => {
    if (!confirm("Are you sure you want to delete this category?")) return

    try {
      await deleteExpenseCategory(categoryId)
      toast({
        title: "Success",
        description: "Category deleted successfully",
      })
      router.refresh()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete category",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Expense Categories</CardTitle>
            <Button onClick={() => setIsCreating(!isCreating)}>
              {isCreating ? "Cancel" : "Add Category"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isCreating && (
            <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 mb-4">
              <h4 className="font-semibold mb-3">Create New Category</h4>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Category Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Salaries"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code">Code</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="e.g., 5100"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Optional description"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="account_id">Expense Account</Label>
                  <Select
                    value={formData.account_id}
                    onValueChange={(value) => setFormData({ ...formData, account_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select account (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="null">None</SelectItem>
                      {accounts.map((acc: any) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.account_code} - {acc.account_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="parent_category_id">Parent Category</Label>
                  <Select
                    value={formData.parent_category_id}
                    onValueChange={(value) => setFormData({ ...formData, parent_category_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select parent (optional)" />
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
              </div>
              <Button onClick={handleCreate} className="mt-4" disabled={!formData.name}>
                Create Category
              </Button>
            </div>
          )}

          <div className="space-y-2">
            {categories.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No categories created yet</p>
            ) : (
              categories.map((category: any) => (
                <div
                  key={category.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
                >
                  <div>
                    <p className="font-medium">{category.name}</p>
                    {category.description && (
                      <p className="text-sm text-muted-foreground">{category.description}</p>
                    )}
                    {category.chart_of_accounts && (
                      <p className="text-xs text-muted-foreground">
                        Account: {category.chart_of_accounts.account_code} - {category.chart_of_accounts.account_name}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(category.id)}
                  >
                    Delete
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}



