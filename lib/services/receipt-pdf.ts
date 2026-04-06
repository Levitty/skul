import { jsPDF } from "jspdf"
import "jspdf-autotable"

declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: any) => jsPDF
    lastAutoTable: { finalY: number }
  }
}

export interface ReceiptPDFData {
  schoolName: string
  schoolAddress?: string
  schoolPhone?: string
  schoolEmail?: string

  receiptNumber: string
  paymentDate: string
  studentName: string
  admissionNumber?: string
  invoiceReference?: string
  paymentMethod: string
  transactionRef?: string
  amount: number
}

export function generateReceiptPDF(data: ReceiptPDFData): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 15
  let y = margin

  // School header (centered)
  doc.setFontSize(16)
  doc.setFont("helvetica", "bold")
  doc.text(data.schoolName.toUpperCase(), pageWidth / 2, y, { align: "center" })
  y += 5
  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  if (data.schoolAddress) { doc.text(data.schoolAddress, pageWidth / 2, y, { align: "center" }); y += 4 }
  if (data.schoolPhone) { doc.text(`Tel: ${data.schoolPhone}`, pageWidth / 2, y, { align: "center" }); y += 4 }
  if (data.schoolEmail) { doc.text(`Email: ${data.schoolEmail}`, pageWidth / 2, y, { align: "center" }); y += 4 }

  // Divider
  y += 2
  doc.setDrawColor(0)
  doc.setLineWidth(0.5)
  doc.line(margin, y, pageWidth - margin, y)
  y += 8

  // Title
  doc.setFontSize(18)
  doc.setFont("helvetica", "bold")
  doc.text("PAYMENT RECEIPT", pageWidth / 2, y, { align: "center" })
  y += 10

  // Receipt details table
  const leftCol = margin + 10
  const valCol = leftCol + 55

  const rows: [string, string][] = [
    ["Receipt Number:", data.receiptNumber],
    ["Payment Date:", data.paymentDate],
    ["Student:", `${data.studentName}${data.admissionNumber ? ` (${data.admissionNumber})` : ""}`],
    ["Invoice Reference:", data.invoiceReference || "—"],
    ["Payment Method:", data.paymentMethod],
    ["Transaction Ref:", data.transactionRef || "—"],
  ]

  doc.setFontSize(10)
  for (const [label, value] of rows) {
    doc.setFont("helvetica", "bold")
    doc.text(label, leftCol, y)
    doc.setFont("helvetica", "normal")
    doc.text(value, valCol, y)
    y += 7
  }

  y += 6

  // Amount box
  const boxWidth = pageWidth - margin * 2 - 20
  const boxX = margin + 10
  doc.setFillColor(240, 240, 240)
  doc.setDrawColor(41, 128, 185)
  doc.setLineWidth(0.8)
  doc.roundedRect(boxX, y, boxWidth, 20, 3, 3, "FD")

  doc.setFontSize(12)
  doc.setFont("helvetica", "bold")
  doc.text("Amount Paid:", boxX + 10, y + 13)
  doc.setFontSize(16)
  doc.text(`KES ${data.amount.toLocaleString()}`, boxX + boxWidth - 10, y + 13, { align: "right" })

  y += 35

  // Stamp/sign area
  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.setDrawColor(0)
  doc.setLineWidth(0.3)
  doc.line(margin + 10, y, margin + 70, y)
  doc.text("Authorized Signature", margin + 10, y + 5)

  doc.line(pageWidth - margin - 70, y, pageWidth - margin - 10, y)
  doc.text("Official Stamp", pageWidth - margin - 70, y + 5)

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 10
  doc.setFontSize(7)
  doc.setTextColor(120)
  doc.text(
    `Generated on ${new Date().toLocaleDateString("en-KE")} | ${data.schoolName}`,
    pageWidth / 2, footerY, { align: "center" }
  )

  return doc
}
