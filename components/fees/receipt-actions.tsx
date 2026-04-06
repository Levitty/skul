"use client"

import { Button } from "@/components/ui/button"
import { Printer, Download } from "lucide-react"
import { generateReceiptPDF, type ReceiptPDFData } from "@/lib/services/receipt-pdf"

interface ReceiptActionsProps {
  receiptData: ReceiptPDFData
}

export function ReceiptActions({ receiptData }: ReceiptActionsProps) {
  const handlePrint = () => {
    window.print()
  }

  const handleDownload = () => {
    const doc = generateReceiptPDF(receiptData)
    doc.save(`Receipt-${receiptData.receiptNumber}.pdf`)
  }

  return (
    <div className="flex gap-2">
      <Button variant="outline" onClick={handlePrint}>
        <Printer className="mr-2 h-4 w-4" />
        Print
      </Button>
      <Button variant="outline" onClick={handleDownload}>
        <Download className="mr-2 h-4 w-4" />
        Download PDF
      </Button>
    </div>
  )
}
