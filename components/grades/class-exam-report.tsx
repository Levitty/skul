"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Printer, Download } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface ClassExamReportProps {
  className: string
  examTypeLabel?: string
  students: Array<{
    id: string
    name: string
    admissionNumber?: string | null
    totalMarks: number
    maxMarks: number
    average: number
    examsTaken: number
  }>
  sessions?: Array<{
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
}

export function ClassExamReport({ className, examTypeLabel, students, sessions = [] }: ClassExamReportProps) {
  const handlePrint = () => {
    window.print()
  }

  // Calculate class statistics
  const classAverage = students.length > 0
    ? students.reduce((sum, s) => sum + s.average, 0) / students.length
    : 0
  const highestScore = students.length > 0
    ? Math.max(...students.map(s => s.average))
    : 0
  const lowestScore = students.length > 0
    ? Math.min(...students.map(s => s.average))
    : 0

  // Sort students by average (ranked)
  const rankedStudents = [...students].sort((a, b) => b.average - a.average)

  // Get subject breakdown for each student
  const getStudentSubjectMarks = (studentId: string) => {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-3xl font-bold">Class Exam Report</h1>
          <p className="text-muted-foreground">
            {className}
            {examTypeLabel ? ` • ${examTypeLabel}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" />
            Print
          </Button>
        </div>
      </div>

      {/* Class Statistics */}
      <Card className="print:shadow-none print:border-none">
        <CardHeader>
          <CardTitle>Class Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Class Average</p>
              <p className="text-2xl font-bold">{classAverage.toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Highest Score</p>
              <p className="text-2xl font-bold">{highestScore.toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Lowest Score</p>
              <p className="text-2xl font-bold">{lowestScore.toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Students</p>
              <p className="text-2xl font-bold">{students.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="print:shadow-none print:border-none">
        <CardHeader>
          <CardTitle>Results Summary</CardTitle>
        </CardHeader>
        <CardContent>
          {rankedStudents.length === 0 ? (
            <p className="text-muted-foreground">No results found for this class.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Rank</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Admission No.</TableHead>
                    {sessions.length > 0 && sessions.map((session) => (
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
                    const subjectMarks = getStudentSubjectMarks(student.id)
                    return (
                      <TableRow key={student.id}>
                        <TableCell className="font-bold">#{index + 1}</TableCell>
                        <TableCell className="font-medium">{student.name}</TableCell>
                        <TableCell>{student.admissionNumber || "-"}</TableCell>
                        {sessions.length > 0 && sessions.map((session) => {
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
