import { jsPDF } from "jspdf"
import "jspdf-autotable"

declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: any) => jsPDF
    lastAutoTable: { finalY: number }
  }
}

export interface VoucherPDFData {
  schoolName: string
  schoolAddress?: string
  schoolPhone?: string
  schoolEmail?: string
  voucherNumber: string
  date: string
  payee: string
  amount: number
  description: string
  category: string
  paymentMethod: string
  referenceNumber?: string
  approvedBy?: string
  preparedBy?: string
}

export function generateVoucherPDF(data: VoucherPDFData): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 15
  let y = margin

  // School header (centered, bold, large)
  doc.setFontSize(16)
  doc.setFont("helvetica", "bold")
  doc.text(data.schoolName.toUpperCase(), pageWidth / 2, y, { align: "center" })
  y += 5

  // Title
  doc.setFontSize(18)
  doc.text("PAYMENT VOUCHER", pageWidth / 2, y, { align: "center" })
  y += 6

  // School address/phone/email
  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  const contactParts: string[] = []
  if (data.schoolAddress) contactParts.push(data.schoolAddress)
  if (data.schoolPhone) contactParts.push(`Tel: ${data.schoolPhone}`)
  if (data.schoolEmail) contactParts.push(`Email: ${data.schoolEmail}`)
  if (contactParts.length > 0) {
    doc.text(contactParts.join(" | "), pageWidth / 2, y, { align: "center" })
    y += 5
  }

  // Horizontal line separator
  y += 2
  doc.setDrawColor(0)
  doc.setLineWidth(0.5)
  doc.line(margin, y, pageWidth - margin, y)
  y += 10

  // Voucher details
  const leftCol = margin + 10
  const valCol = leftCol + 55
  const rightCol = pageWidth - margin - 55

  doc.setFontSize(10)

  // Voucher No / Date (side by side)
  doc.setFont("helvetica", "bold")
  doc.text("Voucher No:", leftCol, y)
  doc.setFont("helvetica", "normal")
  doc.text(data.voucherNumber, valCol, y)
  doc.setFont("helvetica", "bold")
  doc.text("Date:", rightCol, y)
  doc.setFont("helvetica", "normal")
  doc.text(data.date, rightCol + 25, y)
  y += 8

  // Pay To
  doc.setFont("helvetica", "bold")
  doc.text("Pay To:", leftCol, y)
  doc.setFont("helvetica", "normal")
  doc.text(data.payee, valCol, y)
  y += 8

  // Description
  doc.setFont("helvetica", "bold")
  doc.text("Description:", leftCol, y)
  doc.setFont("helvetica", "normal")
  doc.text(data.description, valCol, y)
  y += 8

  // Category
  doc.setFont("helvetica", "bold")
  doc.text("Category:", leftCol, y)
  doc.setFont("helvetica", "normal")
  doc.text(data.category, valCol, y)
  y += 8

  // Payment Method / Reference
  doc.setFont("helvetica", "bold")
  doc.text("Payment Method:", leftCol, y)
  doc.setFont("helvetica", "normal")
  doc.text(data.paymentMethod, valCol, y)
  doc.setFont("helvetica", "bold")
  doc.text("Reference:", rightCol, y)
  doc.setFont("helvetica", "normal")
  doc.text(data.referenceNumber || "—", rightCol + 25, y)
  y += 12

  // Amount in large bold
  const amountStr = `KES ${data.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  doc.setFontSize(16)
  doc.setFont("helvetica", "bold")
  doc.text(amountStr, pageWidth / 2, y, { align: "center" })
  y += 20

  // Signature section
  const sigLineY = y + 20
  const leftSigX = margin + 40
  const rightSigX = pageWidth - margin - 40

  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.text("Prepared By", leftSigX, y, { align: "center" })
  doc.setDrawColor(0)
  doc.setLineWidth(0.3)
  doc.line(leftSigX - 30, sigLineY, leftSigX + 30, sigLineY)
  if (data.preparedBy) {
    doc.setFontSize(8)
    doc.text(data.preparedBy, leftSigX, sigLineY + 4, { align: "center" })
  }

  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text("Approved By", rightSigX, y, { align: "center" })
  doc.line(rightSigX - 30, sigLineY, rightSigX + 30, sigLineY)
  if (data.approvedBy) {
    doc.setFontSize(8)
    doc.text(data.approvedBy, rightSigX, sigLineY + 4, { align: "center" })
  }

  return doc
}
