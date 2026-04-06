import { jsPDF } from "jspdf"
import "jspdf-autotable"

declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: any) => jsPDF
    lastAutoTable: { finalY: number }
  }
}

export interface StatementEntry {
  date: string
  description: string
  debit: number
  credit: number
  balance: number
}

export interface FeeStatementPDFData {
  schoolName: string
  schoolAddress?: string
  schoolPhone?: string
  schoolEmail?: string

  studentName: string
  admissionNumber?: string
  className?: string

  entries: StatementEntry[]
  totalDebits: number
  totalCredits: number
  closingBalance: number
  generatedDate: string
}

export function generateFeeStatementPDF(data: FeeStatementPDFData): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 15
  let y = margin

  // School header
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
  y += 6

  // Title
  doc.setFontSize(14)
  doc.setFont("helvetica", "bold")
  doc.text("FEE STATEMENT", pageWidth / 2, y, { align: "center" })
  y += 8

  // Student info
  doc.setFontSize(10)
  const leftCol = margin
  const rightCol = pageWidth / 2 + 10

  doc.setFont("helvetica", "bold")
  doc.text("Student:", leftCol, y)
  doc.setFont("helvetica", "normal")
  doc.text(data.studentName, leftCol + 25, y)

  doc.setFont("helvetica", "bold")
  doc.text("Date:", rightCol, y)
  doc.setFont("helvetica", "normal")
  doc.text(data.generatedDate, rightCol + 20, y)
  y += 5

  if (data.admissionNumber) {
    doc.setFont("helvetica", "bold")
    doc.text("Adm No:", leftCol, y)
    doc.setFont("helvetica", "normal")
    doc.text(data.admissionNumber, leftCol + 25, y)
  }
  if (data.className) {
    doc.setFont("helvetica", "bold")
    doc.text("Class:", rightCol, y)
    doc.setFont("helvetica", "normal")
    doc.text(data.className, rightCol + 20, y)
  }
  y += 8

  // Statement table
  const tableBody = data.entries.map((e) => [
    e.date,
    e.description,
    e.debit > 0 ? `KES ${e.debit.toLocaleString()}` : "",
    e.credit > 0 ? `KES ${e.credit.toLocaleString()}` : "",
    `KES ${e.balance.toLocaleString()}`,
  ])

  doc.autoTable({
    startY: y,
    head: [["Date", "Description", "Debit (KES)", "Credit (KES)", "Balance (KES)"]],
    body: tableBody,
    foot: [[
      "",
      "TOTALS",
      `KES ${data.totalDebits.toLocaleString()}`,
      `KES ${data.totalCredits.toLocaleString()}`,
      `KES ${data.closingBalance.toLocaleString()}`,
    ]],
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 25 },
      1: { cellWidth: "auto" },
      2: { cellWidth: 30, halign: "right" },
      3: { cellWidth: 30, halign: "right" },
      4: { cellWidth: 30, halign: "right" },
    },
  })

  y = doc.lastAutoTable.finalY + 10

  // Closing balance box
  const boxWidth = 80
  const boxX = pageWidth - margin - boxWidth
  doc.setFillColor(240, 240, 240)
  doc.setDrawColor(41, 128, 185)
  doc.setLineWidth(0.8)
  doc.roundedRect(boxX, y, boxWidth, 16, 3, 3, "FD")

  doc.setFontSize(10)
  doc.setFont("helvetica", "bold")
  doc.text("Closing Balance:", boxX + 5, y + 10)
  doc.setFontSize(12)
  doc.text(`KES ${data.closingBalance.toLocaleString()}`, boxX + boxWidth - 5, y + 10, { align: "right" })

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 10
  doc.setFontSize(7)
  doc.setTextColor(120)
  doc.text(
    `Generated on ${data.generatedDate} | ${data.schoolName}`,
    pageWidth / 2, footerY, { align: "center" }
  )

  return doc
}
