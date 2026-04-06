"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle2, AlertCircle, BarChart3 } from "lucide-react"

interface Student {
  id: string
  first_name: string
  last_name: string
  admission_number: string
  existingGrade?: {
    marks_obtained: number | null
    grade: string | null
    remarks: string | null
  }
}

interface GradeEntryWorksheetProps {
  students: Student[]
  maxMarks?: number | null
  onSave: (grades: Array<{
    student_id: string
    marks_obtained: number | null
    grade: string
    remarks?: string | null
  }>) => Promise<{ error?: string; success?: boolean; stats?: any }>
  isLoading?: boolean
}

interface GradeEntry {
  studentId: string
  marksObtained: number | null
  outOf: number
  grade: string
  remarks: string
}

export function GradeEntryWorksheet({
  students,
  maxMarks = 100,
  onSave,
  isLoading = false,
}: GradeEntryWorksheetProps) {
  const [grades, setGrades] = useState<GradeEntry[]>([])
  const [stats, setStats] = useState<any>(null)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    // Initialize grades from students
    const initialGrades = students.map(student => ({
      studentId: student.id,
      marksObtained: student.existingGrade?.marks_obtained || null,
      outOf: maxMarks || 100,
      grade: student.existingGrade?.grade || "",
      remarks: student.existingGrade?.remarks || "",
    }))
    setGrades(initialGrades)
    calculateStats(initialGrades)
  }, [students, maxMarks])

  const calculateStats = (gradesList: GradeEntry[]) => {
    const filledMarks = gradesList
      .map(g => g.marksObtained)
      .filter(m => m !== null) as number[]

    if (filledMarks.length === 0) {
      setStats(null)
      return
    }

    const average = filledMarks.reduce((a, b) => a + b, 0) / filledMarks.length
    const passRate = ((filledMarks.filter(m => m >= 50).length / filledMarks.length) * 100)

    setStats({
      totalFilled: filledMarks.length,
      average: average.toFixed(1),
      highest: Math.max(...filledMarks),
      lowest: Math.min(...filledMarks),
      passRate: passRate.toFixed(1),
      percentage: ((average / (maxMarks || 100)) * 100).toFixed(1),
    })
  }

  const updateGrade = (studentId: string, field: keyof GradeEntry, value: any) => {
    const updatedGrades = grades.map(g => {
      if (g.studentId === studentId) {
        const updated = { ...g, [field]: value }

        // Auto-calculate grade if marks changed
        if (field === "marksObtained" && value !== null) {
          updated.grade = calculateGradeFromMarks(value, updated.outOf)
        }

        return updated
      }
      return g
    })

    setGrades(updatedGrades)
    calculateStats(updatedGrades)
  }

  const calculateGradeFromMarks = (marks: number | null, outOf: number = 100) => {
    if (marks === null) return ""
    const percentage = (marks / outOf) * 100

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
    const updatedGrades = grades.map(g => ({
      ...g,
      grade: g.marksObtained !== null ? calculateGradeFromMarks(g.marksObtained, g.outOf) : "",
    }))
    setGrades(updatedGrades)
    calculateStats(updatedGrades)
  }

  const handleSave = async () => {
    const gradesToSave = grades
      .filter(g => g.marksObtained !== null)
      .map(g => ({
        student_id: g.studentId,
        marks_obtained: g.marksObtained,
        grade: g.grade,
        remarks: g.remarks || null,
      }))

    if (gradesToSave.length === 0) {
      setSaveMessage({
        type: "error",
        text: "Please enter marks for at least one student",
      })
      return
    }

    setIsSaving(true)
    try {
      const result = await onSave(gradesToSave)
      setIsSaving(false)

      if (result.error) {
        setSaveMessage({ type: "error", text: result.error })
        return
      }

      setSaveMessage({
        type: "success",
        text: `Grades saved! Average: ${result.stats?.average}%, Pass Rate: ${result.stats?.passRate}%`,
      })

      setTimeout(() => setSaveMessage(null), 5000)
    } catch (error) {
      setIsSaving(false)
      setSaveMessage({
        type: "error",
        text: "Error saving grades",
      })
    }
  }

  const getRowHighlight = (marksObtained: number | null) => {
    if (marksObtained === null) return "bg-yellow-50"
    if (marksObtained < 50) return "bg-red-50"
    if (marksObtained >= 80) return "bg-green-50"
    return ""
  }

  const getStudentName = (studentId: string) => {
    const student = students.find(s => s.id === studentId)
    return student ? `${student.first_name} ${student.last_name}` : "Unknown"
  }

  const getAdmissionNumber = (studentId: string) => {
    const student = students.find(s => s.id === studentId)
    return student?.admission_number || "-"
  }

  return (
    <div className="space-y-6">
      {/* Statistics Card */}
      {stats && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Real-time Statistics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Filled</div>
                <div className="text-2xl font-bold">
                  {stats.totalFilled}/{students.length}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Average</div>
                <div className="text-2xl font-bold">{stats.average}%</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Highest</div>
                <div className="text-2xl font-bold">{stats.highest}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Lowest</div>
                <div className="text-2xl font-bold">{stats.lowest}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Pass Rate</div>
                <div className="text-2xl font-bold">{stats.passRate}%</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Messages */}
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

      {/* Grade Entry Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Grade Entry Worksheet</CardTitle>
            <CardDescription>
              Enter marks and grades for {students.length} student(s)
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleAutoGrade}
              disabled={isSaving || isLoading}
            >
              Auto-Grade
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || isLoading}
            >
              {isSaving ? "Saving..." : "Save Grades"}
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted">
                  <TableHead className="w-[200px]">Student Name</TableHead>
                  <TableHead className="w-[120px]">Admission No</TableHead>
                  <TableHead className="w-[100px]">Score</TableHead>
                  <TableHead className="w-[80px]">Out Of</TableHead>
                  <TableHead className="w-[80px]">Grade</TableHead>
                  <TableHead className="flex-1">Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grades.map((grade) => (
                  <TableRow
                    key={grade.studentId}
                    className={`${getRowHighlight(grade.marksObtained)}`}
                  >
                    <TableCell className="font-medium">
                      {getStudentName(grade.studentId)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {getAdmissionNumber(grade.studentId)}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        max={grade.outOf}
                        value={grade.marksObtained ?? ""}
                        onChange={(e) => {
                          const val = e.target.value === "" ? null : parseFloat(e.target.value)
                          updateGrade(grade.studentId, "marksObtained", val)
                        }}
                        placeholder="0"
                        className="w-full"
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      {grade.outOf}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {grade.grade || "-"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="text"
                        value={grade.remarks}
                        onChange={(e) =>
                          updateGrade(grade.studentId, "remarks", e.target.value)
                        }
                        placeholder="Optional remarks"
                        className="text-sm"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Legend */}
          <div className="mt-4 flex gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-yellow-100 border border-yellow-200 rounded" />
              <span>Empty</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-100 border border-red-200 rounded" />
              <span>Failed (&lt;50)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-100 border border-green-200 rounded" />
              <span>High Score (≥80)</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
