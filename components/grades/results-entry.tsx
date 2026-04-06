"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Save, Edit, CheckCircle } from "lucide-react"
import { getExamSessions, getStudentsByClass, saveExamResults, getExamResults } from "@/lib/actions/exams"
import { useRouter } from "next/navigation"

interface ExamSession {
  id: string
  exam_id: string
  class_id: string
  subject: string
  exam_date: string | null
  start_time: string | null
  end_time: string | null
  max_marks: number | null
  exams: { id: string; name: string; exam_type: string }
  classes: { id: string; name: string }
}

interface Student {
  id: string
  first_name: string
  last_name: string
  admission_number: string | null
}

interface ExamResult {
  student_id: string
  marks_obtained: number | null
  grade?: string | null
  remarks?: string | null
}

interface ResultsEntryProps {
  initialSessions: ExamSession[]
  classes: Array<{ id: string; name: string }>
}

export function ResultsEntry({ initialSessions, classes }: ResultsEntryProps) {
  const router = useRouter()
  const [sessions, setSessions] = useState<ExamSession[]>(initialSessions)
  const [selectedSession, setSelectedSession] = useState<ExamSession | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [results, setResults] = useState<Map<string, ExamResult>>(new Map())
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [maxMarks, setMaxMarks] = useState<number | null>(null)

  useEffect(() => {
    if (selectedSession) {
      loadStudentsAndResults()
    }
  }, [selectedSession])

  const loadStudentsAndResults = async () => {
    if (!selectedSession) return

    setIsLoading(true)
    const studentsResult = await getStudentsByClass(selectedSession.class_id)
    setIsLoading(false)

    if (studentsResult.error) {
      alert(studentsResult.error)
      return
    }

    if (studentsResult.data) {
      const studentsList = studentsResult.data as Student[]
      setStudents(studentsList)
      setMaxMarks(selectedSession.max_marks)

      // Load existing results
      const resultsResult = await getExamResults(selectedSession.id)
      const existingResults = (resultsResult.data || []) as any[]
      
      const resultsMap = new Map<string, ExamResult>()
      studentsList.forEach((student) => {
        const existingResult = existingResults.find(
          (r: any) => r.student_id === student.id
        )
        resultsMap.set(student.id, {
          student_id: student.id,
          marks_obtained: existingResult?.marks_obtained || null,
          grade: existingResult?.grade || null,
          remarks: existingResult?.remarks || null,
        })
      })
      setResults(resultsMap)
    }
  }

  const calculateGrade = (marks: number | null, maxMarks: number | null): string | null => {
    if (marks === null || maxMarks === null || maxMarks === 0) return null
    const percentage = (marks / maxMarks) * 100
    
    if (percentage >= 90) return "A+"
    if (percentage >= 80) return "A"
    if (percentage >= 75) return "B+"
    if (percentage >= 70) return "B"
    if (percentage >= 65) return "C+"
    if (percentage >= 60) return "C"
    if (percentage >= 55) return "D+"
    if (percentage >= 50) return "D"
    return "F"
  }

  const handleMarksChange = (studentId: string, value: string) => {
    const marks = value === "" ? null : parseFloat(value)
    const grade = calculateGrade(marks, maxMarks)
    
    setResults((prev) => {
      const newMap = new Map(prev)
      newMap.set(studentId, {
        ...(newMap.get(studentId) || { student_id: studentId }),
        marks_obtained: marks,
        grade: grade || null,
      })
      return newMap
    })
  }

  const handleSave = async () => {
    if (!selectedSession) return

    setIsSaving(true)
    const resultsArray = Array.from(results.values())
    const result = await saveExamResults(selectedSession.id, resultsArray)
    setIsSaving(false)

    if (result.error) {
      alert(result.error)
      return
    }

    alert("Results saved successfully!")
    setIsDialogOpen(false)
    router.refresh()
  }

  const openResultsDialog = (session: ExamSession) => {
    setSelectedSession(session)
    setIsDialogOpen(true)
  }

  const filteredSessions = sessions.filter(s => 
    classes.some(c => c.id === s.class_id)
  )

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Enter Exam Results</CardTitle>
          <CardDescription>Select an exam session to enter student marks</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredSessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No exam sessions available. Create exam sessions first.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Exam</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Max Marks</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell>
                      <div className="font-medium">{session.exams.name}</div>
                      <div className="text-sm text-muted-foreground">{session.exams.exam_type}</div>
                    </TableCell>
                    <TableCell>{session.classes.name}</TableCell>
                    <TableCell>{session.subject}</TableCell>
                    <TableCell>
                      {session.exam_date 
                        ? new Date(session.exam_date).toLocaleDateString()
                        : "Not set"
                      }
                    </TableCell>
                    <TableCell>{session.max_marks || "-"}</TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openResultsDialog(session)}
                      >
                        <Edit className="w-4 h-4 mr-2" />
                        Enter Results
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Results Entry Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Enter Results - {selectedSession?.exams.name}
            </DialogTitle>
            <DialogDescription>
              {selectedSession?.classes.name} - {selectedSession?.subject}
              {selectedSession?.max_marks && ` (Max: ${selectedSession.max_marks} marks)`}
            </DialogDescription>
          </DialogHeader>
          
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading students...</div>
          ) : (
            <div className="space-y-4 py-4">
              {selectedSession && (
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <Label className="text-sm font-medium">Maximum Marks</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={maxMarks || ""}
                      onChange={(e) => {
                        const newMax = e.target.value === "" ? null : parseFloat(e.target.value)
                        setMaxMarks(newMax)
                        // Recalculate grades for all students
                        setResults((prev) => {
                          const newMap = new Map()
                          prev.forEach((result, studentId) => {
                            const grade = calculateGrade(result.marks_obtained, newMax)
                            newMap.set(studentId, {
                              ...result,
                              grade: grade || null,
                            })
                          })
                          return newMap
                        })
                      }}
                      className="w-32 mt-1"
                      placeholder="Max marks"
                    />
                  </div>
                </div>
              )}

              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Admission #</TableHead>
                      <TableHead>Student Name</TableHead>
                      <TableHead>Marks</TableHead>
                      <TableHead>Grade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students.map((student) => {
                      const result = results.get(student.id) || {
                        student_id: student.id,
                        marks_obtained: null,
                        grade: null,
                      }
                      return (
                        <TableRow key={student.id}>
                          <TableCell className="font-mono text-sm">
                            {student.admission_number || "-"}
                          </TableCell>
                          <TableCell>
                            {student.first_name} {student.last_name}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              max={maxMarks || undefined}
                              value={result.marks_obtained === null ? "" : result.marks_obtained}
                              onChange={(e) => handleMarksChange(student.id, e.target.value)}
                              className="w-24"
                              placeholder="0"
                            />
                          </TableCell>
                          <TableCell>
                            {result.grade ? (
                              <span className="px-2 py-1 rounded bg-muted font-medium">
                                {result.grade}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || isLoading}>
              {isSaving ? (
                "Saving..."
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Results
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
