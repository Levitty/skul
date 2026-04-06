"use client"

import { motion } from "framer-motion"
import { GlassCard } from "@/components/ui/glass-card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { 
  Receipt, 
  Eye,
  ShoppingBag,
  TrendingUp
} from "lucide-react"
import Link from "next/link"
import { formatCurrency, formatReceiptDate, formatPaymentMethod } from "@/lib/utils/receipt-generator"

interface SalesHistoryClientProps {
  sales: any[]
  totalSales: number
  totalTransactions: number
}

export function SalesHistoryClient({
  sales,
  totalSales,
  totalTransactions,
}: SalesHistoryClientProps) {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">
            Sales History
          </h1>
          <p className="text-neutral-500 mt-1">
            View all uniform sales transactions
          </p>
        </div>
        <Button asChild className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white">
          <Link href="/dashboard/store/sales">
            <ShoppingBag className="w-4 h-4 mr-2" />
            New Sale
          </Link>
        </Button>
      </motion.div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="border border-neutral-200 bg-white rounded-lg p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-emerald-600 text-white">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-neutral-500">Total Sales</p>
              <p className="text-2xl font-bold">{formatCurrency(totalSales)}</p>
            </div>
          </div>
        </div>
        <div className="border border-neutral-200 bg-white rounded-lg p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-indigo-600 text-white">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-neutral-500">Total Transactions</p>
              <p className="text-2xl font-bold">{totalTransactions}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Sales Table */}
      <div className="border border-neutral-200 bg-white rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Recent Sales</h2>
        {sales.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sale Number</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Payment Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.map((sale, index) => (
                <motion.tr
                  key={sale.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="hover:bg-neutral-50"
                >
                  <TableCell className="font-medium">{sale.sale_number}</TableCell>
                  <TableCell>{formatReceiptDate(sale.sale_date)}</TableCell>
                  <TableCell>
                    {sale.students ? (
                      <span>
                        {sale.students.first_name} {sale.students.last_name}
                        {sale.students.admission_number && (
                          <span className="text-neutral-500 ml-1">
                            ({sale.students.admission_number})
                          </span>
                        )}
                      </span>
                    ) : (
                      <span>{sale.customer_name || "Walk-in Customer"}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{formatPaymentMethod(sale.payment_method)}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(sale.total_amount)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/dashboard/store/sales/${sale.id}/receipt`}>
                        <Eye className="w-4 h-4 mr-1" />
                        View Receipt
                      </Link>
                    </Button>
                  </TableCell>
                </motion.tr>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-12">
            <Receipt className="w-16 h-16 mx-auto mb-4 text-neutral-500" />
            <h3 className="text-lg font-semibold mb-2">No sales yet</h3>
            <p className="text-neutral-500 mb-4">Start recording sales to see them here</p>
            <Button asChild>
              <Link href="/dashboard/store/sales">
                <ShoppingBag className="w-4 h-4 mr-2" />
                Create First Sale
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}


