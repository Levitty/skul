"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Trash2, Edit } from "lucide-react"
import { createExam, createExamSession, deleteExam } from "@/lib/actions/exams"
import Link from "next/link"

interface Exam {
  id: string
  name: string
  exam_type: string
  weight: number | null
  academic_year_id: string
  exam_sessions?: Array<{
    id: string
    class_id: string
    subject: string
    exam_date: string | null
    max_marks: number | null
    classes?: { name: string }
  }>
}

interface ExamsManagerProps {
  initialExams: Exam[]
  academicYears: Array<{ id: string; name: string; is_current: boolean }>
  classes: Array<{ id: string; name: string; level: number | null }>
}

export function ExamsManager({ initialExams, academicYears, classes }: ExamsManagerProps) {
  const router = useRouter()
  const [exams, setExams] = useState<Exam[]>(initialExams)
  const [isAddExamOpen, setIsAddExamOpen] = useState(false)
  const [isAddSessionOpen, setIsAddSessionOpen] = useState(false)
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const [examForm, setExamForm] = useState({
    name: "",
    exam_type: "midterm",
    academic_year_id: academicYears.find(y => y.is_current)?.id || "",
    weight: "",
  })

  const [sessionForm, setSessionForm] = useState({
    class_id: "",
    subject: "",
    exam_date: "",
    start_time: "",
    end_time: "",
    max_marks: "",
  })

  const resetExamForm = () => {
    setExamForm({
      name: "",
      exam_type: "midterm",
      academic_year_id: academicYears.find(y => y.is_current)?.id || "",
      weight: "",
    })
  }

  const resetSessionForm = () => {
    setSessionForm({
      class_id: "",
      subject: "",
      exam_date: "",
      start_time: "",
      end_time: "",
      max_marks: "",
    })
  }

  const handleAddExam = async () => {
    if (!examForm.name.trim() || !examForm.academic_year_id) return

    setIsLoading(true)
    const fd = new FormData()
    fd.append("name", examForm.name)
    fd.append("exam_type", examForm.exam_type)
    fd.append("academic_year_id", examForm.academic_year_id)
    if (examForm.weight) fd.append("weight", examForm.weight)

    const result = await createExam(fd)
    setIsLoading(false)

    if (result.error) {
      alert(result.error)
      return
    }

    setIsAddExamOpen(false)
    resetExamForm()
    router.refresh()
  }

  const handleAddSession = async () => {
    if (!selectedExam || !sessionForm.class_id || !sessionForm.subject || !sessionForm.exam_date) {
      alert("Please fill in all required fields")
      return
    }

    setIsLoading(true)
    const fd = new FormData()
    fd.append("exam_id", selectedExam.id)
    fd.append("class_id", sessionForm.class_id)
    fd.append("subject", sessionForm.subject)
    fd.append("exam_date", sessionForm.exam_date)
    if (sessionForm.start_time) fd.append("start_time", sessionForm.start_time)
    if (sessionForm.end_time) fd.append("end_time", sessionForm.end_time)
    if (sessionForm.max_marks) fd.append("max_marks", sessionForm.max_marks)

    const result = await createExamSession(fd)
    setIsLoading(false)

    if (result.error) {
      alert(result.error)
      return
    }

    setIsAddSessionOpen(false)
    resetSessionForm()
    router.refresh()
  }

  const handleDeleteExam = async (examId: string) => {
    if (!confirm("Are you sure you want to delete this exam and all its sessions?")) return

    const result = await deleteExam(examId)
    if (result.error) {
      alert(result.error)
      return
    }
    router.refresh()
  }

  const examTypeColors: { [key: string]: string } = {
    midterm: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    final: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    continuous_assessment: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    quiz: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    assignment: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="exams" className="w-full">
        <TabsList>
          <TabsTrigger value="exams">Exams</TabsTrigger>
          <TabsTrigger value="grades">Grade Entry</TabsTrigger>
          <TabsTrigger value="reports">Report Cards</TabsTrigger>
        </TabsList>

        <TabsContent value="exams" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Exams</CardTitle>
                <CardDescription>{exams.length} exams configured</CardDescription>
              </div>
              <Dialog open={isAddExamOpen} onOpenChange={setIsAddExamOpen}>
                <DialogTrigger asChild>
                  <Button onClick={resetExamForm}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Exam
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Exam</DialogTitle>
                    <DialogDescription>Set up a new exam for your school</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="exam-name">Exam Name *</Label>
                      <Input
                        id="exam-name"
                        value={examForm.name}
                        onChange={(e) => setExamForm({ ...examForm, name: e.target.value })}
                        placeholder="e.g., Mid-Term 1, Final Exam"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="exam-type">Exam Type *</Label>
                      <Select value={examForm.exam_type} onValueChange={(value) => setExamForm({ ...examForm, exam_type: value })}>
                        <SelectTrigger id="exam-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="midterm">Mid-Term</SelectItem>
                          <SelectItem value="final">Final</SelectItem>
                          <SelectItem value="continuous_assessment">Continuous Assessment</SelectItem>
                          <SelectItem value="quiz">Quiz</SelectItem>
                          <SelectItem value="assignment">Assignment</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="academic-year">Academic Year *</Label>
                      <Select value={examForm.academic_year_id} onValueChange={(value) => setExamForm({ ...examForm, academic_year_id: value })}>
                        <SelectTrigger id="academic-year">
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
                      <Label htmlFor="weight">Weight (%)</Label>
                      <Input
                        id="weight"
                        type="number"
                        step="0.01"
                        value={examForm.weight}
                        onChange={(e) => setExamForm({ ...examForm, weight: e.target.value })}
                        placeholder="e.g., 20, 30, 40"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddExamOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleAddExam} disabled={isLoading || !examForm.name.trim()}>
                      {isLoading ? "Creating..." : "Create Exam"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>

            <CardContent>
              {exams.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No exams yet. Create one to get started.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {exams.map((exam) => (
                    <Card key={exam.id} className="p-4 border">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-semibold">{exam.name}</h4>
                          <div className="flex gap-2 mt-2">
                            <Badge className={examTypeColors[exam.exam_type] || "bg-gray-100"}>
                              {exam.exam_type.replace(/_/g, " ")}
                            </Badge>
                            {exam.weight && <Badge variant="outline">Weight: {exam.weight}%</Badge>}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteExam(exam.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>

                      <div className="mt-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">
                            {(exam.exam_sessions || []).length} sessions
                          </span>
                          <Dialog open={selectedExam?.id === exam.id && isAddSessionOpen} onOpenChange={(open) => {
                            if (open) {
                              setSelectedExam(exam)
                              setIsAddSessionOpen(true)
                            } else {
                              setIsAddSessionOpen(false)
                            }
                          }}>
                            <DialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedExam(exam)
                                  resetSessionForm()
                                }}
                              >
                                <Plus className="h-4 w-4 mr-1" />
                                Add Session
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Add Exam Session</DialogTitle>
                                <DialogDescription>Create a class-specific exam session for {exam.name}</DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                  <Label htmlFor="class">Class *</Label>
                                  <Select value={sessionForm.class_id} onValueChange={(value) => setSessionForm({ ...sessionForm, class_id: value })}>
                                    <SelectTrigger id="class">
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
                                  <Label htmlFor="subject">Subject *</Label>
                                  <Input
                                    id="subject"
                                    value={sessionForm.subject}
                                    onChange={(e) => setSessionForm({ ...sessionForm, subject: e.target.value })}
                                    placeholder="e.g., Mathematics, English"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="exam-date">Exam Date *</Label>
                                  <Input
                                    id="exam-date"
                                    type="date"
                                    value={sessionForm.exam_date}
                                    onChange={(e) => setSessionForm({ ...sessionForm, exam_date: e.target.value })}
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <Label htmlFor="start-time">Start Time</Label>
                                    <Input
                                      id="start-time"
                                      type="time"
                                      value={sessionForm.start_time}
                                      onChange={(e) => setSessionForm({ ...sessionForm, start_time: e.target.value })}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label htmlFor="end-time">End Time</Label>
                                    <Input
                                      id="end-time"
                                      type="time"
                                      value={sessionForm.end_time}
                                      onChange={(e) => setSessionForm({ ...sessionForm, end_time: e.target.value })}
                                    />
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="max-marks">Max Marks</Label>
                                  <Input
                                    id="max-marks"
                                    type="number"
                                    value={sessionForm.max_marks}
                                    onChange={(e) => setSessionForm({ ...sessionForm, max_marks: e.target.value })}
                                    placeholder="e.g., 100"
                                  />
                                </div>
                              </div>
                              <DialogFooter>
                                <Button variant="outline" onClick={() => setIsAddSessionOpen(false)}>
                                  Cancel
                                </Button>
                                <Button onClick={handleAddSession} disabled={isLoading}>
                                  {isLoading ? "Adding..." : "Add Session"}
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </div>

                        {(exam.exam_sessions || []).length > 0 && (
                          <div className="mt-3 space-y-2">
                            {(exam.exam_sessions || []).map((session) => (
                              <div key={session.id} className="text-sm text-muted-foreground p-2 bg-muted rounded flex items-center justify-between">
                                <span>
                                  <span className="font-medium">{session.subject}</span> - {session.classes?.name} {session.max_marks && `(${session.max_marks} marks)`}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  asChild
                                >
                                  <Link href={`/dashboard/admin/academic/exams/grade-entry?sessionId=${session.id}`}>
                                    <Edit className="h-3 w-3" />
                                  </Link>
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="grades">
          <Card>
            <CardHeader>
              <CardTitle>Grade Entry</CardTitle>
              <CardDescription>Enter and manage student grades for exam sessions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <p>Select an exam session from the Exams tab to enter grades</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports">
          <Card>
            <CardHeader>
              <CardTitle>Report Cards</CardTitle>
              <CardDescription>Generate and view student report cards</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <p>Report card generation is available from the separate Report Cards page</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
