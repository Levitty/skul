"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Download, FileText, Eye } from "lucide-react"
import { generateReportCard, getClassReportCards } from "@/lib/actions/exams"
import { ReportCardViewer } from "./report-card-viewer"
import jsPDF from "jspdf"

interface ReportCardsManagerProps {
  academicYears: Array<{ id: string; name: string; is_current: boolean }>
  classes: Array<{ id: string; name: string; level: number | null }>
  terms: Array<{ id: string; name: string; academic_year_id: string }>
}

export function ReportCardsManager({
  academicYears,
  classes,
  terms,
}: ReportCardsManagerProps) {
  const [selectedAcademicYear, setSelectedAcademicYear] = useState(
    academicYears.find(y => y.is_current)?.id || academicYears[0]?.id || ""
  )
  const [selectedClass, setSelectedClass] = useState("")
  const [selectedTerm, setSelectedTerm] = useState("")
  const [classReports, setClassReports] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null)
  const [selectedReport, setSelectedReport] = useState<any | null>(null)
  const [isViewerOpen, setIsViewerOpen] = useState(false)

  const availableTerms = terms.filter(t => t.academic_year_id === selectedAcademicYear)

  const handleGenerateClassReport = async () => {
    if (!selectedClass || !selectedTerm) {
      alert("Please select both class and term")
      return
    }

    setIsLoading(true)
    const result = await getClassReportCards(selectedClass, selectedTerm)
    setIsLoading(false)

    if (result.error) {
      alert(result.error)
      return
    }

    setClassReports(result.data?.students || [])
  }

  const handleViewStudentReport = async (studentId: string) => {
    if (!selectedTerm) return

    setIsLoading(true)
    const result = await generateReportCard(studentId, selectedTerm)
    setIsLoading(false)

    if (result.error) {
      alert(result.error)
      return
    }

    setSelectedReport(result.data)
    setIsViewerOpen(true)
  }

  const handleDownloadPDF = async (studentId: string) => {
    if (!selectedTerm) return

    setIsLoading(true)
    const result = await generateReportCard(studentId, selectedTerm)
    setIsLoading(false)

    if (result.error) {
      alert(result.error)
      return
    }

    const data = result.data
    if (!data) return

    // Create PDF
    const pdf = new jsPDF()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const pageWidth = pdf.internal.pageSize.getWidth()
    let yPosition = 20

    // Header
    pdf.setFontSize(18)
    pdf.text("STUDENT REPORT CARD", pageWidth / 2, yPosition, { align: "center" })
    yPosition += 15

    // Student Info
    pdf.setFontSize(11)
    pdf.text(`Name: ${(data.student as any).first_name} ${(data.student as any).last_name}`, 20, yPosition)
    yPosition += 7
    pdf.text(`Admission No: ${(data.student as any).admission_number}`, 20, yPosition)
    yPosition += 7
    pdf.text(`Term: ${(data.term as any).name}`, 20, yPosition)
    yPosition += 7
    pdf.text(`Academic Year: ${(data.term as any).academic_years?.name || ""}`, 20, yPosition)
    yPosition += 15

    // Exam Results by Subject
    pdf.setFontSize(12)
    pdf.text("Exam Results by Subject", 20, yPosition)
    yPosition += 10

    Object.keys(data.resultsBySubject).forEach(subject => {
      const subjectResults = data.resultsBySubject[subject]
      const average = data.subjectAverages[subject]?.average || 0

      pdf.setFontSize(10)
      pdf.text(`${subject}`, 25, yPosition)
      yPosition += 6

      // Subject exams
      subjectResults.forEach((result: any) => {
        const sessionInfo = result.sessionInfo
        const marks = result.marks_obtained || 0
        const maxMarks = sessionInfo?.max_marks || 0
        const percentage = maxMarks > 0 ? ((marks / maxMarks) * 100).toFixed(1) : "N/A"

        pdf.setFontSize(9)
        pdf.text(
          `  ${sessionInfo?.exams?.name} - ${marks}/${maxMarks} (${percentage}%)`,
          30,
          yPosition
        )
        yPosition += 5

        if (yPosition > pageHeight - 20) {
          pdf.addPage()
          yPosition = 20
        }
      })

      pdf.setFontSize(10)
      pdf.text(`  Average: ${average.toFixed(1)}%`, 30, yPosition)
      yPosition += 7

      if (yPosition > pageHeight - 20) {
        pdf.addPage()
        yPosition = 20
      }
    })

    // Summary
    yPosition += 5
    pdf.setFontSize(12)
    pdf.text("Summary", 20, yPosition)
    yPosition += 10

    pdf.setFontSize(10)
    pdf.text(`Overall Average: ${data.overallAverage}%`, 25, yPosition)
    yPosition += 6
    pdf.text(`Overall Grade: ${data.overallGrade}`, 25, yPosition)
    yPosition += 6
    pdf.text(`Total Marks: ${data.totalMarks}/${data.totalMaxMarks}`, 25, yPosition)

    // Save PDF
    pdf.save(`${(data.student as any).first_name}_${(data.student as any).last_name}_ReportCard.pdf`)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Generate Report Cards</CardTitle>
          <CardDescription>Select class and term to generate report cards</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Academic Year</label>
              <Select value={selectedAcademicYear} onValueChange={setSelectedAcademicYear}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {academicYears.map((year) => (
                    <SelectItem key={year.id} value={year.id}>
                      {year.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Class</label>
              <Select value={selectedClass} onValueChange={setSelectedClass}>
                <SelectTrigger>
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Term</label>
              <Select value={selectedTerm} onValueChange={setSelectedTerm}>
                <SelectTrigger>
                  <SelectValue placeholder="Select term" />
                </SelectTrigger>
                <SelectContent>
                  {availableTerms.map((term) => (
                    <SelectItem key={term.id} value={term.id}>
                      {term.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={handleGenerateClassReport} disabled={isLoading || !selectedClass || !selectedTerm}>
            {isLoading ? "Generating..." : "Generate Report Cards"}
          </Button>
        </CardContent>
      </Card>

      {classReports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Class Report Cards</CardTitle>
            <CardDescription>{classReports.length} students in report</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student Name</TableHead>
                    <TableHead>Admission No</TableHead>
                    <TableHead>Average (%)</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {classReports.map((report: any) => (
                    <TableRow key={report.student.id}>
                      <TableCell className="font-medium">
                        {report.student.first_name} {report.student.last_name}
                      </TableCell>
                      <TableCell>{report.student.admission_number}</TableCell>
                      <TableCell>{report.average}%</TableCell>
                      <TableCell>
                        <Badge variant={report.average >= 70 ? "default" : "secondary"}>
                          {report.grade}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Dialog open={isViewerOpen && selectedReport?.student.id === report.student.id} onOpenChange={setIsViewerOpen}>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleViewStudentReport((report as any).student.id)}
                              disabled={isLoading}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Report Card - {(report as any).student.first_name} {(report as any).student.last_name}</DialogTitle>
                            </DialogHeader>
                            {selectedReport && (
                              <ReportCardViewer reportData={selectedReport} />
                            )}
                          </DialogContent>
                        </Dialog>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDownloadPDF((report as any).student.id)}
                          disabled={isLoading}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
