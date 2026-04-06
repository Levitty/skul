"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Printer } from "lucide-react"
import { useEffect } from "react"

interface BulkPrintViewProps {
  reports: Array<{
    classId: string
    examType: string
    report: {
      classInfo: { id: string; name: string; level?: number | null }
      examType?: string
      sessions: Array<{
        id: string
        subject: string
        exam_date: string | null
        max_marks: number | null
        exams: { id: string; name: string; exam_type: string }
        exam_results: Array<{
          student_id: string
          marks_obtained: number | null
          students: { id: string; first_name: string; last_name: string; admission_number?: string | null }
        }>
      }>
      students: Array<{
        id: string
        name: string
        admissionNumber?: string | null
        totalMarks: number
        maxMarks: number
        average: number
        examsTaken: number
      }>
    }
  }>
}

const examTypeLabels: Record<string, string> = {
  opening: "Opening Exams",
  midterm: "Midterm Exams",
  endterm: "Endterm Exams",
  final: "Final Exams",
}

export function BulkPrintView({ reports }: BulkPrintViewProps) {
  useEffect(() => {
    // Auto-print when component mounts
    const timer = setTimeout(() => {
      window.print()
    }, 500)
    return () => clearTimeout(timer)
  }, [])

  const handlePrint = () => {
    window.print()
  }

  const getGrade = (percentage: number): string => {
    if (percentage >= 90) return "A+"
    if (percentage >= 85) return "A"
    if (percentage >= 80) return "B+"
    if (percentage >= 75) return "B"
    if (percentage >= 70) return "C+"
    if (percentage >= 65) return "C"
    if (percentage >= 60) return "D+"
    if (percentage >= 50) return "D"
    return "F"
  }

  const getStudentSubjectMarks = (studentId: string, sessions: any[]) => {
    const marks: Record<string, { marks: number; maxMarks: number; percentage: number }> = {}
    sessions.forEach(session => {
      const result = session.exam_results.find((r: any) => r.student_id === studentId)
      if (result && session.max_marks) {
        marks[session.subject] = {
          marks: Number(result.marks_obtained || 0),
          maxMarks: Number(session.max_marks),
          percentage: Math.round((Number(result.marks_obtained || 0) / Number(session.max_marks)) * 100),
        }
      }
    })
    return marks
  }

  return (
    <div className="space-y-8 p-6">
      {/* Print Button - Hidden when printing */}
      <div className="print:hidden flex justify-end mb-4">
        <Button onClick={handlePrint} className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white">
          <Printer className="w-4 h-4 mr-2" />
          Print All Reports
        </Button>
      </div>

      {reports.map(({ report, examType }, reportIndex) => {
        const rankedStudents = [...report.students].sort((a, b) => b.average - a.average)
        const classAverage = rankedStudents.length > 0
          ? rankedStudents.reduce((sum, s) => sum + s.average, 0) / rankedStudents.length
          : 0

        return (
          <div key={`${report.classInfo.id}-${examType}`} className="print:break-after-page">
            {/* Report Header */}
            <div className="mb-6 print:mb-4">
              <h1 className="text-3xl font-bold mb-2">Class Exam Report</h1>
              <div className="flex items-center gap-4 text-neutral-500">
                <p className="text-lg">{report.classInfo.name}</p>
                {examTypeLabels[examType] && (
                  <>
                    <span>•</span>
                    <p className="text-lg">{examTypeLabels[examType]}</p>
                  </>
                )}
              </div>
            </div>

            {/* Class Statistics */}
            <Card className="mb-6 print:mb-4 print:shadow-none print:border-none">
              <CardHeader>
                <CardTitle>Class Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-neutral-500">Class Average</p>
                    <p className="text-2xl font-bold">{classAverage.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-sm text-neutral-500">Highest Score</p>
                    <p className="text-2xl font-bold">
                      {rankedStudents.length > 0 ? rankedStudents[0].average.toFixed(1) : 0}%
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-neutral-500">Lowest Score</p>
                    <p className="text-2xl font-bold">
                      {rankedStudents.length > 0 ? rankedStudents[rankedStudents.length - 1].average.toFixed(1) : 0}%
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-neutral-500">Total Students</p>
                    <p className="text-2xl font-bold">{rankedStudents.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Results Table */}
            <Card className="print:shadow-none print:border-none">
              <CardHeader>
                <CardTitle>Results Summary</CardTitle>
              </CardHeader>
              <CardContent>
                {rankedStudents.length === 0 ? (
                  <p className="text-neutral-500">No results found for this class.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">Rank</TableHead>
                          <TableHead>Student</TableHead>
                          <TableHead>Admission No.</TableHead>
                          {report.sessions.length > 0 && report.sessions.map((session) => (
                            <TableHead key={session.id} className="text-center">
                              {session.subject}
                            </TableHead>
                          ))}
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="text-right">Max</TableHead>
                          <TableHead className="text-right">Average</TableHead>
                          <TableHead className="text-right">Grade</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rankedStudents.map((student, index) => {
                          const subjectMarks = getStudentSubjectMarks(student.id, report.sessions)
                          return (
                            <TableRow key={student.id}>
                              <TableCell className="font-bold">#{index + 1}</TableCell>
                              <TableCell className="font-medium">{student.name}</TableCell>
                              <TableCell>{student.admissionNumber || "-"}</TableCell>
                              {report.sessions.length > 0 && report.sessions.map((session) => {
                                const marks = subjectMarks[session.subject]
                                return (
                                  <TableCell key={session.id} className="text-center">
                                    {marks ? `${marks.marks}/${marks.maxMarks} (${marks.percentage}%)` : "-"}
                                  </TableCell>
                                )
                              })}
                              <TableCell className="text-right font-medium">{student.totalMarks.toFixed(1)}</TableCell>
                              <TableCell className="text-right">{student.maxMarks.toFixed(1)}</TableCell>
                              <TableCell className="text-right font-semibold">{student.average.toFixed(1)}%</TableCell>
                              <TableCell className="text-right">
                                <Badge variant={student.average >= 80 ? "default" : student.average >= 60 ? "secondary" : "destructive"}>
                                  {getGrade(student.average)}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Page Break (except for last report) */}
            {reportIndex < reports.length - 1 && (
              <div className="print:break-after-page" />
            )}
          </div>
        )
      })}

      <style jsx global>{`
        @media print {
          body {
            margin: 0;
            padding: 0;
          }
          .print\\:break-after-page {
            page-break-after: always;
          }
          .print\\:shadow-none {
            box-shadow: none;
            border: 1px solid #e5e7eb;
          }
          .print\\:mb-4 {
            margin-bottom: 1rem;
          }
          @page {
            margin: 1cm;
          }
        }
      `}</style>
    </div>
  )
}
