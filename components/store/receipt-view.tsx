"use client"

import { motion } from "framer-motion"
import { GlassCard } from "@/components/ui/glass-card"
import { Button } from "@/components/ui/button"
import { 
  Receipt, 
  Printer, 
  Download,
  ArrowLeft
} from "lucide-react"
import { 
  formatReceiptNumber, 
  formatCurrency, 
  formatReceiptDate,
  getCustomerDisplayName,
  formatPaymentMethod,
  calculateReceiptTotals
} from "@/lib/utils/receipt-generator"
import { useRouter } from "next/navigation"
import Link from "next/link"

interface ReceiptViewProps {
  receiptData: {
    sale: any
    school: any
    receipt_number: string
  }
}

export function ReceiptView({ receiptData }: ReceiptViewProps) {
  const router = useRouter()
  const { sale, school, receipt_number } = receiptData
  const totals = calculateReceiptTotals(sale.items || [])

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="p-6">
      {/* Action Bar */}
      <div className="mb-6 flex items-center justify-between">
        <Button variant="outline" asChild>
          <Link href="/dashboard/store/sales/history">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to History
          </Link>
        </Button>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" />
            Print
          </Button>
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Download PDF
          </Button>
        </div>
      </div>

      {/* Receipt */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl mx-auto"
      >
        <GlassCard variant="default" className="p-8 print:shadow-none print:border-none">
          {/* School Header */}
          <div className="text-center mb-8 pb-6 border-b">
            {school?.logo_url && (
              <img 
                src={school.logo_url} 
                alt={school.name}
                className="h-20 mx-auto mb-4"
              />
            )}
            <h1 className="text-2xl font-bold">{school?.name || "School"}</h1>
            {school?.address && (
              <p className="text-sm text-muted-foreground mt-1">{school.address}</p>
            )}
            {(school?.phone || school?.email) && (
              <div className="flex items-center justify-center gap-4 mt-2 text-xs text-muted-foreground">
                {school.phone && <span>Tel: {school.phone}</span>}
                {school.email && <span>Email: {school.email}</span>}
              </div>
            )}
          </div>

          {/* Receipt Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Receipt Number</span>
              <span className="font-semibold">{receipt_number}</span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Sale Number</span>
              <span className="font-semibold">{sale.sale_number}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Date</span>
              <span className="font-semibold">{formatReceiptDate(sale.sale_date)}</span>
            </div>
          </div>

          {/* Customer Info */}
          <div className="mb-6 p-4 rounded-lg bg-muted">
            <h3 className="font-semibold mb-2">Customer</h3>
            <p className="text-sm">{getCustomerDisplayName(receiptData)}</p>
            {sale.customer_phone && (
              <p className="text-sm text-muted-foreground mt-1">Phone: {sale.customer_phone}</p>
            )}
          </div>

          {/* Items Table */}
          <div className="mb-6">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 text-sm font-semibold">Item</th>
                  <th className="text-center py-2 text-sm font-semibold">Size</th>
                  <th className="text-center py-2 text-sm font-semibold">Color</th>
                  <th className="text-right py-2 text-sm font-semibold">Qty</th>
                  <th className="text-right py-2 text-sm font-semibold">Unit Price</th>
                  <th className="text-right py-2 text-sm font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {sale.items?.map((item: any, index: number) => (
                  <tr key={index} className="border-b">
                    <td className="py-3 text-sm">
                      {item.uniform_variants?.uniform_products?.name || "Product"}
                    </td>
                    <td className="py-3 text-center text-sm">{item.uniform_variants?.size}</td>
                    <td className="py-3 text-center text-sm">{item.uniform_variants?.color}</td>
                    <td className="py-3 text-right text-sm">{item.quantity}</td>
                    <td className="py-3 text-right text-sm">{formatCurrency(item.unit_price)}</td>
                    <td className="py-3 text-right text-sm font-semibold">{formatCurrency(item.total_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="mb-6 space-y-2">
            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span className="font-semibold">{formatCurrency(totals.subtotal)}</span>
            </div>
            {totals.tax > 0 && (
              <div className="flex justify-between text-sm">
                <span>Tax</span>
                <span className="font-semibold">{formatCurrency(totals.tax)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold pt-2 border-t">
              <span>Total</span>
              <span className="text-emerald-600 dark:text-emerald-400">{formatCurrency(totals.total)}</span>
            </div>
          </div>

          {/* Payment Info */}
          <div className="mb-6 p-4 rounded-lg bg-muted">
            <div className="flex justify-between mb-2">
              <span className="text-sm text-muted-foreground">Payment Method</span>
              <span className="text-sm font-semibold">{formatPaymentMethod(sale.payment_method)}</span>
            </div>
            {sale.transaction_ref && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Transaction Reference</span>
                <span className="text-sm font-semibold">{sale.transaction_ref}</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="text-center pt-6 border-t">
            <p className="text-xs text-muted-foreground">
              Thank you for your purchase!
            </p>
            {sale.sold_by?.full_name && (
              <p className="text-xs text-muted-foreground mt-2">
                Served by: {sale.sold_by.full_name}
              </p>
            )}
          </div>
        </GlassCard>
      </motion.div>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print\\:shadow-none,
          .print\\:shadow-none * {
            visibility: visible;
          }
          .print\\:shadow-none {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  )
}


