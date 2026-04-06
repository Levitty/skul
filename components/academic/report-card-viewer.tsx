"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface ReportCardViewerProps {
  reportData: {
    student: {
      first_name: string
      last_name: string
      admission_number: string
      email: string
      status: string
    }
    term: {
      name: string
      academic_years: {
        name: string
      }
    }
    resultsBySubject: { [key: string]: any[] }
    subjectAverages: { [key: string]: { average: number; maxMarks: number } }
    overallAverage: number
    overallGrade: string
    totalMarks: number
    totalMaxMarks: number
  }
}

export function ReportCardViewer({ reportData }: ReportCardViewerProps) {
  const getGradeColor = (percentage: number) => {
    if (percentage >= 90) return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
    if (percentage >= 80) return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
    if (percentage >= 70) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
    if (percentage >= 60) return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200"
    return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
  }

  return (
    <div className="space-y-6 py-4">
      {/* Student Information */}
      <Card>
        <CardHeader>
          <CardTitle>Student Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Name</p>
              <p className="font-semibold">{reportData.student.first_name} {reportData.student.last_name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Admission Number</p>
              <p className="font-semibold">{reportData.student.admission_number}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Term</p>
              <p className="font-semibold">{reportData.term.name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Academic Year</p>
              <p className="font-semibold">{reportData.term.academic_years.name}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subject Performance */}
      <Card>
        <CardHeader>
          <CardTitle>Subject Performance</CardTitle>
          <CardDescription>Performance breakdown by subject</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Object.keys(reportData.resultsBySubject).map((subject) => {
              const results = reportData.resultsBySubject[subject]
              const subjectAverage = reportData.subjectAverages[subject]?.average || 0
              const maxMarks = reportData.subjectAverages[subject]?.maxMarks || 0

              return (
                <div key={subject} className="space-y-2 p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">{subject}</h4>
                    <Badge className={getGradeColor(subjectAverage)}>
                      {subjectAverage.toFixed(1)}%
                    </Badge>
                  </div>

                  <div className="bg-gray-100 dark:bg-gray-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-blue-500 h-full"
                      style={{ width: `${Math.min(subjectAverage, 100)}%` }}
                    />
                  </div>

                  <div className="space-y-1 text-sm">
                    {results.map((result: any, idx: number) => {
                      const marks = result.marks_obtained || 0
                      const percentage = maxMarks > 0 ? ((marks / maxMarks) * 100).toFixed(1) : "N/A"
                      return (
                        <div key={idx} className="flex justify-between text-muted-foreground">
                          <span>{result.sessionInfo?.exams?.name}:</span>
                          <span className="font-medium">{marks}/{maxMarks} ({percentage}%)</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Overall Performance Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Overall Average</p>
              <p className="text-2xl font-bold">{reportData.overallAverage}%</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Overall Grade</p>
              <Badge className={getGradeColor(reportData.overallAverage)} variant="default">
                <span className="text-lg">{reportData.overallGrade}</span>
              </Badge>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Total Marks</p>
              <p className="text-2xl font-bold">{reportData.totalMarks}/{reportData.totalMaxMarks}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Performance</p>
              <p className="text-lg font-semibold">
                {reportData.overallAverage >= 80 && "Excellent"}
                {reportData.overallAverage >= 70 && reportData.overallAverage < 80 && "Good"}
                {reportData.overallAverage >= 60 && reportData.overallAverage < 70 && "Satisfactory"}
                {reportData.overallAverage >= 50 && reportData.overallAverage < 60 && "Average"}
                {reportData.overallAverage < 50 && "Need Improvement"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
