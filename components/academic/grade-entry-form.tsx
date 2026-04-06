"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { saveExamResults } from "@/lib/actions/exams"
import { CheckCircle2, AlertCircle } from "lucide-react"

interface Student {
  id: string
  first_name: string
  last_name: string
  admission_number: string
}

interface ExistingResult {
  student_id: string
  marks_obtained: number | null
  grade: string | null
  remarks: string | null
}

interface GradeEntryFormProps {
  sessionId: string
  students: Student[]
  existingResults: ExistingResult[]
  maxMarks?: number | null
}

interface GradeEntry {
  studentId: string
  marks: number | null
  grade: string
  remarks: string
}

export function GradeEntryForm({
  sessionId,
  students,
  existingResults,
  maxMarks,
}: GradeEntryFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Initialize form with existing results
  const [grades, setGrades] = useState<GradeEntry[]>(
    students.map(student => {
      const existing = existingResults.find(r => r.student_id === student.id)
      return {
        studentId: student.id,
        marks: existing?.marks_obtained || null,
        grade: existing?.grade || "",
        remarks: existing?.remarks || "",
      }
    })
  )

  const updateGrade = (studentId: string, field: keyof GradeEntry, value: any) => {
    setGrades(prev =>
      prev.map(g =>
        g.studentId === studentId ? { ...g, [field]: value } : g
      )
    )
  }

  const getGradeFromMarks = (marks: number | null) => {
    if (marks === null) return ""
    const percentage = maxMarks && maxMarks > 0 ? (marks / maxMarks) * 100 : 0
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

  const handleAutoGrade = () => {
    setGrades(prev =>
      prev.map(g => ({
        ...g,
        grade: getGradeFromMarks(g.marks),
      }))
    )
  }

  const handleSave = async () => {
    const resultsToSave = grades
      .filter(g => g.marks !== null) // Only save entries with marks
      .map(g => ({
        student_id: g.studentId,
        marks_obtained: g.marks,
        grade: g.grade || getGradeFromMarks(g.marks),
        remarks: g.remarks || null,
      }))

    if (resultsToSave.length === 0) {
      alert("Please enter marks for at least one student")
      return
    }

    setIsLoading(true)
    const result = await saveExamResults(sessionId, resultsToSave)
    setIsLoading(false)

    if (result.error) {
      setSaveMessage({ type: "error", text: result.error })
      return
    }

    setSaveMessage({
      type: "success",
      text: `Grades saved successfully! Average: ${(result as any).stats?.average.toFixed(1)}%, Pass Rate: ${(result as any).stats?.passRate}%`,
    })

    // Refresh after 2 seconds
    setTimeout(() => {
      router.refresh()
    }, 2000)
  }

  const filledCount = grades.filter(g => g.marks !== null).length
  const marks = grades.map(g => g.marks).filter(m => m !== null) as number[]
  const stats = {
    count: marks.length,
    average: marks.length > 0 ? (marks.reduce((a, b) => a + b, 0) / marks.length).toFixed(1) : 0,
    highest: marks.length > 0 ? Math.max(...marks) : 0,
    lowest: marks.length > 0 ? Math.min(...marks) : 0,
  }

  return (
    <div className="space-y-6">
      {saveMessage && (
        <Alert variant={saveMessage.type === "success" ? "default" : "destructive"}>
          <div className="flex items-center gap-2">
            {saveMessage.type === "success" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            <AlertDescription>{saveMessage.text}</AlertDescription>
          </div>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Grade Entry</CardTitle>
          <CardDescription>Enter marks for {filledCount} of {students.length} students</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={handleAutoGrade} size="sm">
              Auto-Calculate Grades
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
            <div>
              <p className="text-sm text-muted-foreground">Filled Entries</p>
              <p className="text-2xl font-bold">{filledCount}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Average</p>
              <p className="text-2xl font-bold">{stats.average}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Highest</p>
              <p className="text-2xl font-bold">{stats.highest}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Lowest</p>
              <p className="text-2xl font-bold">{stats.lowest}</p>
            </div>
          </div>

          <div className="overflow-x-auto border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student Name</TableHead>
                  <TableHead>Admission No</TableHead>
                  <TableHead className="w-24">
                    Marks {maxMarks && `(out of ${maxMarks})`}
                  </TableHead>
                  <TableHead className="w-20">Grade</TableHead>
                  <TableHead>Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grades.map((grade) => {
                  const student = students.find(s => s.id === grade.studentId)
                  if (!student) return null

                  const displayGrade = grade.grade || getGradeFromMarks(grade.marks)
                  const gradeColor = displayGrade === "F" ? "destructive" : "default"

                  return (
                    <TableRow key={grade.studentId}>
                      <TableCell className="font-medium">
                        {student.first_name} {student.last_name}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {student.admission_number}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          max={maxMarks || undefined}
                          step="0.5"
                          value={grade.marks ?? ""}
                          onChange={(e) => {
                            const value = e.target.value === "" ? null : parseFloat(e.target.value)
                            updateGrade(grade.studentId, "marks", value)
                          }}
                          placeholder="0"
                          className="w-24"
                        />
                      </TableCell>
                      <TableCell>
                        {displayGrade ? (
                          <Badge variant={gradeColor}>
                            {displayGrade}
                          </Badge>
                        ) : (
                          <Badge variant="outline">-</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="text"
                          value={grade.remarks}
                          onChange={(e) => updateGrade(grade.studentId, "remarks", e.target.value)}
                          placeholder="Optional remarks"
                          className="w-32"
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" asChild>
              <a href="/dashboard/admin/academic/exams">Cancel</a>
            </Button>
            <Button onClick={handleSave} disabled={isLoading || filledCount === 0}>
              {isLoading ? "Saving..." : `Save Grades (${filledCount})`}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
