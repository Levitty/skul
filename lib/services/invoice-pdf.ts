import { jsPDF } from "jspdf"
import "jspdf-autotable"

declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: any) => jsPDF
    lastAutoTable: { finalY: number }
  }
}

export interface InvoicePDFData {
  schoolName: string
  schoolAddress?: string
  schoolPhone?: string
  schoolEmail?: string

  reference: string
  issuedDate: string
  dueDate?: string
  status: string
  termName?: string
  academicYear?: string

  guardianName?: string
  guardianPhone?: string
  guardianEmail?: string
  studentName: string
  admissionNumber?: string

  items: { description: string; amount: number }[]
  totalAmount: number

  payments: {
    date: string
    method: string
    ref?: string
    amount: number
  }[]
  totalPaid: number
  balance: number
}

export function generateInvoicePDF(data: InvoicePDFData): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 15
  let y = margin

  // School header
  doc.setFontSize(16)
  doc.setFont("helvetica", "bold")
  doc.text(data.schoolName.toUpperCase(), margin, y)
  y += 5
  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  if (data.schoolAddress) { doc.text(data.schoolAddress, margin, y); y += 4 }
  if (data.schoolPhone) { doc.text(`Tel: ${data.schoolPhone}`, margin, y); y += 4 }
  if (data.schoolEmail) { doc.text(`Email: ${data.schoolEmail}`, margin, y); y += 4 }

  // Invoice title (right-aligned)
  doc.setFontSize(20)
  doc.setFont("helvetica", "bold")
  doc.text("INVOICE", pageWidth - margin, margin, { align: "right" })
  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.text(`Ref: ${data.reference}`, pageWidth - margin, margin + 7, { align: "right" })
  doc.text(`Date: ${data.issuedDate}`, pageWidth - margin, margin + 11, { align: "right" })
  if (data.dueDate) {
    doc.text(`Due: ${data.dueDate}`, pageWidth - margin, margin + 15, { align: "right" })
  }

  // Divider
  y += 2
  doc.setDrawColor(0)
  doc.setLineWidth(0.5)
  doc.line(margin, y, pageWidth - margin, y)
  y += 8

  // Bill To
  doc.setFontSize(10)
  doc.setFont("helvetica", "bold")
  doc.text("Bill To:", margin, y)
  y += 5
  doc.setFont("helvetica", "normal")
  if (data.guardianName) { doc.text(data.guardianName, margin, y); y += 4 }
  if (data.guardianPhone) { doc.text(`Phone: ${data.guardianPhone}`, margin, y); y += 4 }
  if (data.guardianEmail) { doc.text(`Email: ${data.guardianEmail}`, margin, y); y += 4 }
  doc.text(`Student: ${data.studentName}${data.admissionNumber ? ` (${data.admissionNumber})` : ""}`, margin, y)
  y += 8

  // Items table
  const tableBody = data.items.map((item) => [
    item.description,
    `KES ${item.amount.toLocaleString()}`,
  ])

  doc.autoTable({
    startY: y,
    head: [["Description", "Amount (KES)"]],
    body: tableBody,
    foot: [["Total", `KES ${data.totalAmount.toLocaleString()}`]],
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 45, halign: "right" },
    },
  })

  y = doc.lastAutoTable.finalY + 8

  // Payment history
  if (data.payments.length > 0) {
    doc.setFontSize(10)
    doc.setFont("helvetica", "bold")
    doc.text("Payment History", margin, y)
    y += 2

    const paymentBody = data.payments.map((p) => [
      p.date,
      p.method,
      p.ref || "—",
      `KES ${p.amount.toLocaleString()}`,
    ])

    doc.autoTable({
      startY: y,
      head: [["Date", "Method", "Reference", "Amount"]],
      body: paymentBody,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [149, 165, 166], textColor: 255, fontStyle: "bold" },
      columnStyles: {
        3: { halign: "right" },
      },
    })

    y = doc.lastAutoTable.finalY + 6
  }

  // Summary box
  const boxWidth = 70
  const boxX = pageWidth - margin - boxWidth
  doc.setDrawColor(0)
  doc.setLineWidth(0.3)
  doc.rect(boxX, y, boxWidth, 22)

  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.text("Total Paid:", boxX + 4, y + 6)
  doc.text(`KES ${data.totalPaid.toLocaleString()}`, boxX + boxWidth - 4, y + 6, { align: "right" })

  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.text("Balance:", boxX + 4, y + 16)
  doc.text(`KES ${data.balance.toLocaleString()}`, boxX + boxWidth - 4, y + 16, { align: "right" })

  y += 30

  // Status
  doc.setFontSize(10)
  doc.setFont("helvetica", "bold")
  doc.text(`Status: ${data.status.toUpperCase()}`, margin, y)
  if (data.termName) {
    doc.setFont("helvetica", "normal")
    doc.text(`Term: ${data.termName}${data.academicYear ? ` — ${data.academicYear}` : ""}`, margin, y + 5)
  }

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
