"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { deleteOtherIncome } from "@/lib/actions/other-income"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { Search, Filter, Calendar, Trash2, Eye } from "lucide-react"

interface OtherIncomeListProps {
  income: any[]
}

const INCOME_TYPE_LABELS: Record<string, string> = {
  donation: "Donation",
  uniform_sale: "Uniform Sales",
  book_sales: "Book Sales",
  event_revenue: "Event Revenue",
  rental_income: "Rental Income",
  interest_income: "Interest Income",
  government_grant: "Government Grant",
  trip_payment: "Trip Payment",
  club_fee: "Club Fee",
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  mpesa: "M-Pesa",
  paystack: "Paystack",
  cheque: "Cheque",
  other: "Other",
}

export function OtherIncomeList({ income: initialIncome }: OtherIncomeListProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [income] = useState(initialIncome)
  const [searchTerm, setSearchTerm] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [methodFilter, setMethodFilter] = useState<string>("all")
  const [dateFilter, setDateFilter] = useState<string>("all")
  const [selectedIncome, setSelectedIncome] = useState<any>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Get unique income types for filter
  const incomeTypes = Array.from(new Set(income.map((i: any) => i.income_type)))

  // Filter income records
  const filteredIncome = income.filter((record: any) => {
    const matchesSearch =
      record.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.transaction_ref?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesType = typeFilter === "all" || record.income_type === typeFilter
    const matchesMethod = methodFilter === "all" || record.payment_method === methodFilter

    let matchesDate = true
    if (dateFilter === "today") {
      const today = new Date().toISOString().split("T")[0]
      matchesDate = record.received_date === today
    } else if (dateFilter === "week") {
      const weekAgo = new Date()
      weekAgo.setDate(weekAgo.getDate() - 7)
      matchesDate = new Date(record.received_date) >= weekAgo
    } else if (dateFilter === "month") {
      const monthAgo = new Date()
      monthAgo.setMonth(monthAgo.getMonth() - 1)
      matchesDate = new Date(record.received_date) >= monthAgo
    }

    return matchesSearch && matchesType && matchesMethod && matchesDate
  })

  const handleDeleteClick = (rec: any) => {
    setSelectedIncome(rec)
    setIsDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!selectedIncome) return

    setIsDeleting(true)
    try {
      await deleteOtherIncome(selectedIncome.id)

      toast({
        title: "Deleted",
        description: "Income record deleted successfully",
      })

      setIsDeleteDialogOpen(false)
      setSelectedIncome(null)
      router.refresh()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete income record",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const getIncomeTypeBadgeColor = (type: string) => {
    const colorMap: Record<string, string> = {
      donation: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
      uniform_sale: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      book_sales: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
      event_revenue: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
      rental_income: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      interest_income: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
      government_grant: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
      trip_payment: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
      club_fee: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    }
    return colorMap[type] || "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
  }

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-xl">
        <CardHeader>
          <CardTitle>Income Records</CardTitle>
          <CardDescription>View and manage all other income entries</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Filters */}
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search description..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold">Income Type</Label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {incomeTypes.map((type: string) => (
                      <SelectItem key={type} value={type}>
                        {INCOME_TYPE_LABELS[type] || type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold">Payment Method</Label>
                <Select value={methodFilter} onValueChange={setMethodFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Methods</SelectItem>
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
                <Label className="text-xs font-semibold">Date Range</Label>
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger>
                    <SelectValue />
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

            {/* Results count */}
            <div className="text-sm text-muted-foreground">
              Showing {filteredIncome.length} of {income.length} records
            </div>

            {/* Table */}
            {filteredIncome.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">No income records found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-200 dark:border-gray-800">
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Amount (KES)</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredIncome.map((record: any) => (
                      <TableRow key={record.id} className="border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/50">
                        <TableCell className="font-medium text-sm">
                          {new Date(record.received_date).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge className={`${getIncomeTypeBadgeColor(record.income_type)} cursor-default`}>
                            {INCOME_TYPE_LABELS[record.income_type] || record.income_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{record.description}</TableCell>
                        <TableCell className="text-sm">
                          <Badge variant="outline">
                            {PAYMENT_METHOD_LABELS[record.payment_method] || record.payment_method}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-semibold text-emerald-600 dark:text-emerald-400">
                          KES {Number(record.amount).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {record.transaction_ref || "-"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {record.students
                            ? `${record.students.first_name} ${record.students.last_name}`
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteClick(record)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Income Record</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this income record? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogAction
            onClick={handleConfirmDelete}
            disabled={isDeleting}
            className="bg-red-600 hover:bg-red-700"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </AlertDialogAction>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
