"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertCircle, CheckCircle2, ChevronRight } from "lucide-react"
import { GradeEntryWorksheet } from "./grade-entry-worksheet"
import {
  getExamsForGradeEntry,
  getOrCreateExamSession,
  getStudentsForGradeEntry,
  saveGradeEntries,
} from "@/lib/actions/teacher-grades"

interface ClassInfo {
  id: string
  name: string
  level: number | null
  subjects: string[]
}

interface GradeEntryClientProps {
  teacherId: string
  currentAcademicYearId: string
  initialClasses: ClassInfo[]
}

interface Exam {
  id: string
  name: string
  exam_type: string
  weight: number | null
}

interface Student {
  id: string
  first_name: string
  last_name: string
  admission_number: string
  existingGrade?: any
}

export function GradeEntryClient({
  teacherId,
  currentAcademicYearId,
  initialClasses,
}: GradeEntryClientProps) {
  const [step, setStep] = useState(1)
  const [selectedClass, setSelectedClass] = useState("")
  const [selectedSubject, setSelectedSubject] = useState("")
  const [selectedExam, setSelectedExam] = useState("")
  const [examSessionId, setExamSessionId] = useState("")

  const [exams, setExams] = useState<Exam[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [successMessage, setSuccessMessage] = useState("")

  useEffect(() => {
    loadExams()
  }, [])

  const loadExams = async () => {
    if (!currentAcademicYearId) return

    const { data, error } = await getExamsForGradeEntry(currentAcademicYearId)
    if (error) {
      setErrorMessage(error)
      return
    }
    setExams(data || [])
  }

  const handleProceedToStep2 = () => {
    if (!selectedClass) {
      setErrorMessage("Please select a class")
      return
    }
    setErrorMessage("")
    setStep(2)
  }

  const handleProceedToStep3 = async () => {
    if (!selectedSubject) {
      setErrorMessage("Please select a subject")
      return
    }
    if (!selectedExam) {
      setErrorMessage("Please select an exam")
      return
    }

    setLoading(true)
    setErrorMessage("")

    try {
      const { data: session, error } = await getOrCreateExamSession(
        selectedExam,
        selectedClass,
        selectedSubject
      )

      if (error) {
        setErrorMessage(error)
        setLoading(false)
        return
      }

      setExamSessionId(session.id)

      // Load students
      const { data: studentsList, error: studentsError } = await getStudentsForGradeEntry(
        selectedClass,
        session.id,
        currentAcademicYearId
      )

      if (studentsError) {
        setErrorMessage(studentsError)
        setLoading(false)
        return
      }

      setStudents(studentsList || [])
      setStep(3)
    } catch (error: any) {
      setErrorMessage(error.message || "Error loading students")
    } finally {
      setLoading(false)
    }
  }

  const handleSaveGrades = async (
    grades: Array<{
      student_id: string
      marks_obtained: number | null
      grade: string
      remarks?: string | null
    }>
  ) => {
    try {
      const result = await saveGradeEntries(examSessionId, grades)
      if (result.error) {
        return { error: result.error }
      }

      setSuccessMessage("Grades saved successfully!")
      setTimeout(() => setSuccessMessage(""), 3000)

      return { success: true, stats: result.stats }
    } catch (error: any) {
      return { error: error.message || "Error saving grades" }
    }
  }

  const getSelectedClassName = () => {
    const cls = initialClasses.find(c => c.id === selectedClass)
    return cls?.name || ""
  }

  const getSubjectsForClass = () => {
    const cls = initialClasses.find(c => c.id === selectedClass)
    return cls?.subjects || []
  }

  const getSelectedExamName = () => {
    const exam = exams.find(e => e.id === selectedExam)
    return exam?.name || ""
  }

  return (
    <div className="space-y-6">
      {errorMessage && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {successMessage && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue={`step-${step}`} value={`step-${step}`}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="step-1" disabled={step < 1}>
            Class
          </TabsTrigger>
          <TabsTrigger value="step-2" disabled={step < 2}>
            Subject
          </TabsTrigger>
          <TabsTrigger value="step-3" disabled={step < 3}>
            Exam
          </TabsTrigger>
          <TabsTrigger value="step-4" disabled={step < 4}>
            Grades
          </TabsTrigger>
        </TabsList>

        {/* Step 1: Select Class */}
        <TabsContent value="step-1" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Step 1: Select Class</CardTitle>
              <CardDescription>
                Choose the class for which you want to enter grades
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Class *</label>
                <Select value={selectedClass} onValueChange={setSelectedClass}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a class" />
                  </SelectTrigger>
                  <SelectContent>
                    {initialClasses.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.name} (Level {cls.level || "N/A"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleProceedToStep2} disabled={!selectedClass}>
                  Next: Select Subject
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Step 2: Select Subject and Exam */}
        <TabsContent value="step-2" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Step 2: Select Subject & Exam</CardTitle>
              <CardDescription>
                Choose the subject and exam for grade entry
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Class display */}
              <div className="bg-muted p-3 rounded-lg">
                <p className="text-sm font-medium">Selected Class</p>
                <p className="text-lg font-bold">{getSelectedClassName()}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Subject *</label>
                  <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a subject" />
                    </SelectTrigger>
                    <SelectContent>
                      {getSubjectsForClass().map((subject) => (
                        <SelectItem key={subject} value={subject}>
                          {subject}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Exam *</label>
                  <Select value={selectedExam} onValueChange={setSelectedExam}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an exam" />
                    </SelectTrigger>
                    <SelectContent>
                      {exams.map((exam) => (
                        <SelectItem key={exam.id} value={exam.id}>
                          {exam.name} ({exam.exam_type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button
                  onClick={handleProceedToStep3}
                  disabled={!selectedSubject || !selectedExam || loading}
                >
                  {loading ? "Loading..." : "Next: Enter Grades"}
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Step 3: Grade Entry */}
        <TabsContent value="step-3" className="space-y-4">
          <div className="bg-muted p-3 rounded-lg mb-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Class</p>
                <p className="font-semibold">{getSelectedClassName()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Subject</p>
                <p className="font-semibold">{selectedSubject}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Exam</p>
                <p className="font-semibold">{getSelectedExamName()}</p>
              </div>
            </div>
          </div>

          {students.length > 0 ? (
            <GradeEntryWorksheet
              students={students}
              maxMarks={100}
              onSave={handleSaveGrades}
              isLoading={loading}
            />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No students found in this class for the selected academic year
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
