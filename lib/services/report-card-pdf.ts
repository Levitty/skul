/**
 * Report Card PDF Generation
 *
 * Generates a clean, printable report card PDF using jsPDF.
 * Designed for Kenyan school format with subject table, ranks, and remarks.
 */

import { jsPDF } from "jspdf"
import "jspdf-autotable"

// Extend jsPDF type for autotable
declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: any) => jsPDF
    lastAutoTable: { finalY: number }
  }
}

export interface ReportCardPDFData {
  schoolName: string
  schoolAddress?: string
  schoolPhone?: string

  studentName: string
  admissionNumber: string
  className: string
  termName: string
  academicYear: string

  subjects: {
    name: string
    marks: number
    maxMarks: number
    percentage: number
    grade: string
    teacherName?: string
  }[]

  overallPercentage: number
  overallGrade: string
  classRank: number
  classSize: number

  attendancePresent: number
  attendanceTotal: number
  attendancePercentage: number

  teacherRemarks: string | null
  principalRemarks: string | null
}

const GRADE_SCALE = [
  { grade: "A", range: "80-100", comment: "Excellent" },
  { grade: "B", range: "70-79", comment: "Good" },
  { grade: "C", range: "60-69", comment: "Average" },
  { grade: "D", range: "50-59", comment: "Below Average" },
  { grade: "E", range: "40-49", comment: "Weak" },
  { grade: "F", range: "0-39", comment: "Very Weak" },
]

/**
 * Generate a report card PDF and return it as a Buffer.
 */
export function generateReportCardPDF(data: ReportCardPDFData): Buffer {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 15
  let y = margin

  // ── School Header ──
  doc.setFontSize(16)
  doc.setFont("helvetica", "bold")
  doc.text(data.schoolName.toUpperCase(), pageWidth / 2, y, { align: "center" })
  y += 6

  if (data.schoolAddress) {
    doc.setFontSize(9)
    doc.setFont("helvetica", "normal")
    doc.text(data.schoolAddress, pageWidth / 2, y, { align: "center" })
    y += 4
  }

  if (data.schoolPhone) {
    doc.text(`Tel: ${data.schoolPhone}`, pageWidth / 2, y, { align: "center" })
    y += 4
  }

  // Divider
  y += 2
  doc.setDrawColor(0)
  doc.setLineWidth(0.5)
  doc.line(margin, y, pageWidth - margin, y)
  y += 4

  // ── Report Card Title ──
  doc.setFontSize(13)
  doc.setFont("helvetica", "bold")
  doc.text("STUDENT REPORT CARD", pageWidth / 2, y, { align: "center" })
  y += 3
  doc.setFontSize(10)
  doc.setFont("helvetica", "normal")
  doc.text(`${data.termName} — ${data.academicYear}`, pageWidth / 2, y, { align: "center" })
  y += 8

  // ── Student Info ──
  doc.setFontSize(10)
  const leftCol = margin
  const rightCol = pageWidth / 2 + 10

  doc.setFont("helvetica", "bold")
  doc.text("Name:", leftCol, y)
  doc.setFont("helvetica", "normal")
  doc.text(data.studentName, leftCol + 22, y)

  doc.setFont("helvetica", "bold")
  doc.text("Class:", rightCol, y)
  doc.setFont("helvetica", "normal")
  doc.text(data.className, rightCol + 22, y)
  y += 5

  doc.setFont("helvetica", "bold")
  doc.text("Adm No:", leftCol, y)
  doc.setFont("helvetica", "normal")
  doc.text(data.admissionNumber || "—", leftCol + 22, y)

  doc.setFont("helvetica", "bold")
  doc.text("Rank:", rightCol, y)
  doc.setFont("helvetica", "normal")
  doc.text(`${data.classRank} of ${data.classSize}`, rightCol + 22, y)
  y += 8

  // ── Subject Marks Table ──
  const tableBody = data.subjects.map((s, i) => [
    i + 1,
    s.name,
    s.marks,
    s.maxMarks,
    `${s.percentage}%`,
    s.grade,
  ])

  // Add totals row
  const totalMarks = data.subjects.reduce((sum, s) => sum + s.marks, 0)
  const totalMax = data.subjects.reduce((sum, s) => sum + s.maxMarks, 0)
  tableBody.push(["", "TOTAL", totalMarks, totalMax, `${data.overallPercentage}%`, data.overallGrade])

  doc.autoTable({
    startY: y,
    head: [["#", "Subject", "Marks", "Out of", "%", "Grade"]],
    body: tableBody,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 9,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [41, 128, 185],
      textColor: 255,
      fontStyle: "bold",
    },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 20, halign: "center" },
      3: { cellWidth: 20, halign: "center" },
      4: { cellWidth: 20, halign: "center" },
      5: { cellWidth: 18, halign: "center" },
    },
    // Bold the totals row
    didParseCell: (hookData: any) => {
      if (hookData.row.index === tableBody.length - 1) {
        hookData.cell.styles.fontStyle = "bold"
      }
    },
  })

  y = doc.lastAutoTable.finalY + 8

  // ── Attendance ──
  doc.setFontSize(10)
  doc.setFont("helvetica", "bold")
  doc.text("Attendance:", leftCol, y)
  doc.setFont("helvetica", "normal")
  doc.text(
    `${data.attendancePresent} of ${data.attendanceTotal} days (${data.attendancePercentage}%)`,
    leftCol + 28,
    y
  )
  y += 8

  // ── Remarks ──
  if (data.teacherRemarks) {
    doc.setFont("helvetica", "bold")
    doc.text("Class Teacher's Remarks:", leftCol, y)
    y += 5
    doc.setFont("helvetica", "normal")
    const lines = doc.splitTextToSize(data.teacherRemarks, pageWidth - margin * 2)
    doc.text(lines, leftCol, y)
    y += lines.length * 4.5 + 4
  }

  if (data.principalRemarks) {
    doc.setFont("helvetica", "bold")
    doc.text("Principal's Remarks:", leftCol, y)
    y += 5
    doc.setFont("helvetica", "normal")
    const lines = doc.splitTextToSize(data.principalRemarks, pageWidth - margin * 2)
    doc.text(lines, leftCol, y)
    y += lines.length * 4.5 + 4
  }

  // ── Grade Scale ──
  y += 4
  doc.autoTable({
    startY: y,
    head: [["Grade", "Range", "Remark"]],
    body: GRADE_SCALE.map((g) => [g.grade, g.range, g.comment]),
    margin: { left: margin, right: pageWidth / 2 },
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [149, 165, 166], textColor: 255, fontStyle: "bold" },
    tableWidth: 80,
  })

  // ── Signature Lines ──
  const sigY = doc.lastAutoTable.finalY + 15
  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.line(leftCol, sigY, leftCol + 50, sigY)
  doc.text("Class Teacher", leftCol, sigY + 4)

  doc.line(rightCol, sigY, rightCol + 50, sigY)
  doc.text("Principal", rightCol, sigY + 4)

  // ── Footer ──
  const footerY = doc.internal.pageSize.getHeight() - 10
  doc.setFontSize(7)
  doc.setTextColor(120)
  doc.text(
    `Generated on ${new Date().toLocaleDateString("en-KE")} | ${data.schoolName}`,
    pageWidth / 2,
    footerY,
    { align: "center" }
  )

  // Return as Buffer
  const output = doc.output("arraybuffer")
  return Buffer.from(output)
}
