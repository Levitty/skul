"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Calendar, BookOpen, Clock } from "lucide-react"
import { createExam, getExams, createExamSession, getExamSessions } from "@/lib/actions/exams"
import { EXAM_TYPES, type ExamType } from "@/lib/types/exams"
import { useRouter } from "next/navigation"

interface Exam {
  id: string
  name: string
  exam_type: ExamType
  weight: number | null
  academic_years: { id: string; name: string } | null
}

interface ExamSession {
  id: string
  exam_id: string
  class_id: string
  subject: string
  exam_date: string | null
  start_time: string | null
  end_time: string | null
  max_marks: number | null
  exams: { id: string; name: string; exam_type: ExamType }
  classes: { id: string; name: string }
}

interface ExamsManagerProps {
  initialExams: Exam[]
  initialSessions: ExamSession[]
  academicYears: Array<{ id: string; name: string }>
  classes: Array<{ id: string; name: string }>
  currentAcademicYearId?: string
}

export function ExamsManager({ 
  initialExams, 
  initialSessions, 
  academicYears,
  classes,
  currentAcademicYearId 
}: ExamsManagerProps) {
  const router = useRouter()
  const [exams, setExams] = useState<Exam[]>(initialExams)
  const [sessions, setSessions] = useState<ExamSession[]>(initialSessions)
  const [isExamDialogOpen, setIsExamDialogOpen] = useState(false)
  const [isSessionDialogOpen, setIsSessionDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>(currentAcademicYearId || academicYears[0]?.id || "")
  
  const [examFormData, setExamFormData] = useState({
    name: "",
    exam_type: "midterm" as ExamType,
    academic_year_id: currentAcademicYearId || academicYears[0]?.id || "",
    weight: "",
  })

  const [sessionFormData, setSessionFormData] = useState({
    exam_id: "",
    class_id: "",
    subject: "",
    exam_date: "",
    start_time: "",
    end_time: "",
    max_marks: "",
  })

  useEffect(() => {
    if (selectedAcademicYear) {
      loadExamsAndSessions()
    }
  }, [selectedAcademicYear])

  const loadExamsAndSessions = async () => {
    const examsResult = await getExams(selectedAcademicYear)
    if (examsResult.data) {
      setExams(examsResult.data as Exam[])
    }
    const sessionsResult = await getExamSessions()
    if (sessionsResult.data) {
      setSessions(sessionsResult.data as ExamSession[])
    }
  }

  const resetExamForm = () => {
    setExamFormData({
      name: "",
      exam_type: "midterm",
      academic_year_id: selectedAcademicYear,
      weight: "",
    })
  }

  const resetSessionForm = () => {
    setSessionFormData({
      exam_id: "",
      class_id: "",
      subject: "",
      exam_date: "",
      start_time: "",
      end_time: "",
      max_marks: "",
    })
  }

  const handleCreateExam = async () => {
    if (!examFormData.name.trim() || !examFormData.academic_year_id) return

    setIsLoading(true)
    const fd = new FormData()
    fd.append("name", examFormData.name)
    fd.append("exam_type", examFormData.exam_type)
    fd.append("academic_year_id", examFormData.academic_year_id)
    if (examFormData.weight) fd.append("weight", examFormData.weight)

    const result = await createExam(fd)
    setIsLoading(false)

    if (result.error) {
      alert(result.error)
      return
    }

    setIsExamDialogOpen(false)
    resetExamForm()
    await loadExamsAndSessions()
    router.refresh()
  }

  const handleCreateSession = async () => {
    if (!sessionFormData.exam_id || !sessionFormData.class_id || !sessionFormData.subject.trim()) return

    setIsLoading(true)
    const fd = new FormData()
    fd.append("exam_id", sessionFormData.exam_id)
    fd.append("class_id", sessionFormData.class_id)
    fd.append("subject", sessionFormData.subject)
    if (sessionFormData.exam_date) fd.append("exam_date", sessionFormData.exam_date)
    if (sessionFormData.start_time) fd.append("start_time", sessionFormData.start_time)
    if (sessionFormData.end_time) fd.append("end_time", sessionFormData.end_time)
    if (sessionFormData.max_marks) fd.append("max_marks", sessionFormData.max_marks)

    const result = await createExamSession(fd)
    setIsLoading(false)

    if (result.error) {
      alert(result.error)
      return
    }

    setIsSessionDialogOpen(false)
    resetSessionForm()
    await loadExamsAndSessions()
    router.refresh()
  }

  const getExamTypeLabel = (type: ExamType) => {
    const labels: Record<ExamType, string> = {
      opening: "Opening Exam",
      midterm: "Midterm Exam",
      endterm: "Endterm Exam",
      final: "Final Exam",
      continuous_assessment: "Continuous Assessment",
      quiz: "Quiz",
      assignment: "Assignment",
    }
    return labels[type] || type
  }

  const getExamTypeColor = (type: ExamType) => {
    const colors: Record<ExamType, string> = {
      opening: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      midterm: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
      endterm: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
      final: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      continuous_assessment: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      quiz: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
      assignment: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
    }
    return colors[type] || "bg-gray-100 text-gray-700"
  }

  const filteredExams = exams.filter(e => e.academic_years?.id === selectedAcademicYear)
  const filteredSessions = sessions.filter(s => 
    filteredExams.some(e => e.id === s.exam_id)
  )

  return (
    <div className="space-y-6">
      {/* Academic Year Filter */}
      <Card>
        <CardHeader>
          <CardTitle>Academic Year</CardTitle>
          <CardDescription>Select academic year to view exams</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedAcademicYear} onValueChange={setSelectedAcademicYear}>
            <SelectTrigger className="w-full max-w-md">
              <SelectValue placeholder="Select academic year" />
            </SelectTrigger>
            <SelectContent>
              {academicYears.map((year) => (
                <SelectItem key={year.id} value={year.id}>
                  {year.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Exams Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Exams</CardTitle>
            <CardDescription>{filteredExams.length} exam{filteredExams.length !== 1 ? "s" : ""} configured</CardDescription>
          </div>
          <Dialog open={isExamDialogOpen} onOpenChange={setIsExamDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetExamForm}>
                <Plus className="mr-2 h-4 w-4" />
                Create Exam
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Exam</DialogTitle>
                <DialogDescription>Add a new exam for the selected academic year</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="exam-name">Exam Name *</Label>
                  <Input
                    id="exam-name"
                    value={examFormData.name}
                    onChange={(e) => setExamFormData({ ...examFormData, name: e.target.value })}
                    placeholder="e.g., Term 1 Midterm Exam"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="exam-type">Exam Type *</Label>
                  <Select
                    value={examFormData.exam_type}
                    onValueChange={(value) => setExamFormData({ ...examFormData, exam_type: value as ExamType })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXAM_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {getExamTypeLabel(type)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="exam-weight">Weight (%)</Label>
                  <Input
                    id="exam-weight"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={examFormData.weight}
                    onChange={(e) => setExamFormData({ ...examFormData, weight: e.target.value })}
                    placeholder="e.g., 30"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsExamDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateExam} disabled={isLoading}>
                  {isLoading ? "Creating..." : "Create Exam"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {filteredExams.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No exams created yet. Create your first exam to get started.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredExams.map((exam) => (
                <Card key={exam.id} className="border-2">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <BookOpen className="w-5 h-5 text-muted-foreground" />
                        <div>
                          <CardTitle className="text-lg">{exam.name}</CardTitle>
                          <CardDescription>
                            {exam.academic_years?.name}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge className={getExamTypeColor(exam.exam_type)}>
                        {getExamTypeLabel(exam.exam_type)}
                      </Badge>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Exam Sessions Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Exam Sessions</CardTitle>
            <CardDescription>{filteredSessions.length} session{filteredSessions.length !== 1 ? "s" : ""} scheduled</CardDescription>
          </div>
          <Dialog open={isSessionDialogOpen} onOpenChange={setIsSessionDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetSessionForm} disabled={filteredExams.length === 0}>
                <Plus className="mr-2 h-4 w-4" />
                Schedule Session
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Schedule Exam Session</DialogTitle>
                <DialogDescription>Create an exam session for a specific class and subject</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="session-exam">Exam *</Label>
                  <Select
                    value={sessionFormData.exam_id}
                    onValueChange={(value) => setSessionFormData({ ...sessionFormData, exam_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select exam" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredExams.map((exam) => (
                        <SelectItem key={exam.id} value={exam.id}>
                          {exam.name} ({getExamTypeLabel(exam.exam_type)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="session-class">Class *</Label>
                  <Select
                    value={sessionFormData.class_id}
                    onValueChange={(value) => setSessionFormData({ ...sessionFormData, class_id: value })}
                  >
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
                  <Label htmlFor="session-subject">Subject *</Label>
                  <Input
                    id="session-subject"
                    value={sessionFormData.subject}
                    onChange={(e) => setSessionFormData({ ...sessionFormData, subject: e.target.value })}
                    placeholder="e.g., Mathematics, English"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="session-date">Exam Date</Label>
                  <Input
                    id="session-date"
                    type="date"
                    value={sessionFormData.exam_date}
                    onChange={(e) => setSessionFormData({ ...sessionFormData, exam_date: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="session-start-time">Start Time</Label>
                    <Input
                      id="session-start-time"
                      type="time"
                      value={sessionFormData.start_time}
                      onChange={(e) => setSessionFormData({ ...sessionFormData, start_time: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="session-end-time">End Time</Label>
                    <Input
                      id="session-end-time"
                      type="time"
                      value={sessionFormData.end_time}
                      onChange={(e) => setSessionFormData({ ...sessionFormData, end_time: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="session-max-marks">Maximum Marks</Label>
                  <Input
                    id="session-max-marks"
                    type="number"
                    min="0"
                    step="0.01"
                    value={sessionFormData.max_marks}
                    onChange={(e) => setSessionFormData({ ...sessionFormData, max_marks: e.target.value })}
                    placeholder="e.g., 100"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsSessionDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateSession} disabled={isLoading}>
                  {isLoading ? "Creating..." : "Create Session"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {filteredSessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No exam sessions scheduled yet. Create a session to start entering results.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Exam</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Max Marks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge className={getExamTypeColor(session.exams.exam_type)}>
                          {getExamTypeLabel(session.exams.exam_type)}
                        </Badge>
                        <span className="font-medium">{session.exams.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>{session.classes.name}</TableCell>
                    <TableCell>{session.subject}</TableCell>
                    <TableCell>
                      {session.exam_date ? (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {new Date(session.exam_date).toLocaleDateString()}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Not set</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {session.start_time || session.end_time ? (
                        <div className="flex items-center gap-1 text-sm">
                          <Clock className="w-4 h-4" />
                          {session.start_time || "?"} - {session.end_time || "?"}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Not set</span>
                      )}
                    </TableCell>
                    <TableCell>{session.max_marks || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
