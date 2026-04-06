"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  ArrowLeft, Calendar, CheckCircle, FileText,
  Star, Clock, Users
} from "lucide-react"
import { gradeSubmission, updateAssignment } from "@/lib/actions/lms"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import Link from "next/link"

interface SubmissionData {
  id: string
  student_id: string
  submitted_at: string | null
  status: string
  score: number | null
  feedback: string | null
  submission_text: string | null
  file_url: string | null
  students: { first_name: string; last_name: string; admission_number: string } | null
}

interface AssignmentDetailProps {
  assignment: {
    id: string
    title: string
    description: string | null
    instructions: string | null
    due_date: string | null
    max_score: number | null
    is_published: boolean
    allow_late_submission: boolean
    subjects: { name: string } | null
    classes: { name: string } | null
    assignment_submissions: SubmissionData[]
  }
}

export function AssignmentDetailClient({ assignment }: AssignmentDetailProps) {
  const router = useRouter()
  const { toast } = useToast()

  const [isGradeOpen, setIsGradeOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionData | null>(null)
  const [gradeForm, setGradeForm] = useState({ score: "", feedback: "" })

  const submissions = assignment.assignment_submissions || []
  const gradedCount = submissions.filter((s) => s.status === "graded").length
  const pendingCount = submissions.filter((s) => s.status !== "graded").length

  const handleTogglePublish = async () => {
    const result = await updateAssignment(assignment.id, { is_published: !assignment.is_published })
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }
    toast({ title: assignment.is_published ? "Assignment unpublished" : "Assignment published" })
    router.refresh()
  }

  const openGradeDialog = (submission: SubmissionData) => {
    setSelectedSubmission(submission)
    setGradeForm({
      score: submission.score?.toString() || "",
      feedback: submission.feedback || "",
    })
    setIsGradeOpen(true)
  }

  const handleGrade = async () => {
    if (!selectedSubmission) return

    const score = parseFloat(gradeForm.score)
    if (isNaN(score) || score < 0) {
      toast({ title: "Invalid score", description: "Please enter a valid score", variant: "destructive" })
      return
    }

    if (assignment.max_score && score > assignment.max_score) {
      toast({ title: "Score too high", description: `Maximum score is ${assignment.max_score}`, variant: "destructive" })
      return
    }

    setIsLoading(true)
    const result = await gradeSubmission(selectedSubmission.id, {
      score,
      feedback: gradeForm.feedback || undefined,
    })
    setIsLoading(false)

    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    toast({ title: "Submission graded" })
    setIsGradeOpen(false)
    setSelectedSubmission(null)
    router.refresh()
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "graded":
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Graded</Badge>
      case "submitted":
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Submitted</Badge>
      case "late":
        return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">Late</Badge>
      default:
        return <Badge variant="outline" className="text-neutral-500">Pending</Badge>
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/teacher/assignments">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Link>
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-bold text-neutral-900 mb-2">
            {assignment.title}
          </h1>
          <div className="flex items-center gap-3 text-neutral-500">
            <span className="flex items-center gap-1">
              <FileText className="h-4 w-4" />
              {assignment.subjects?.name || "No subject"}
            </span>
            <span>&middot;</span>
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {assignment.classes?.name || "No class"}
            </span>
            {assignment.due_date && (
              <>
                <span>&middot;</span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  Due: {new Date(assignment.due_date).toLocaleDateString()}
                </span>
              </>
            )}
            {assignment.max_score && (
              <>
                <span>&middot;</span>
                <span className="flex items-center gap-1">
                  <Star className="h-4 w-4" />
                  Max: {assignment.max_score} pts
                </span>
              </>
            )}
          </div>
        </div>
        <Button
          variant={assignment.is_published ? "outline" : "default"}
          onClick={handleTogglePublish}
        >
          {assignment.is_published ? "Unpublish" : "Publish"}
        </Button>
      </div>

      {assignment.description && (
        <Card className="border-0 shadow-lg">
          <CardContent className="p-4">
            <p className="text-sm text-neutral-500">{assignment.description}</p>
          </CardContent>
        </Card>
      )}

      <Card className="border-0 shadow-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-white">
        <CardContent className="p-6">
          <div className="grid grid-cols-3 gap-6">
            <div className="text-center">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold">{submissions.length}</p>
              <p className="text-white/70 text-sm">Total Submissions</p>
            </div>
            <div className="text-center">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold">{gradedCount}</p>
              <p className="text-white/70 text-sm">Graded</p>
            </div>
            <div className="text-center">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold">{pendingCount}</p>
              <p className="text-white/70 text-sm">Pending</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-xl">
        <CardHeader>
          <CardTitle>Submissions</CardTitle>
          <CardDescription>Student submissions for this assignment</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {submissions.length === 0 ? (
            <div className="py-12 text-center text-neutral-500">
              <FileText className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>No submissions yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Submitted At</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell className="font-medium">
                      {sub.students
                        ? `${sub.students.first_name} ${sub.students.last_name}`
                        : "Unknown"}
                      {sub.students && (
                        <span className="block text-xs text-neutral-500">
                          {sub.students.admission_number}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {sub.submitted_at
                        ? new Date(sub.submitted_at).toLocaleString()
                        : "—"}
                    </TableCell>
                    <TableCell>{getStatusBadge(sub.status)}</TableCell>
                    <TableCell>
                      {sub.score !== null ? (
                        <span className="font-semibold">
                          {sub.score}{assignment.max_score ? `/${assignment.max_score}` : ""}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openGradeDialog(sub)}
                      >
                        <Star className="h-3 w-3 mr-1" />
                        Grade
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isGradeOpen} onOpenChange={setIsGradeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Grade Submission</DialogTitle>
            <DialogDescription>
              {selectedSubmission?.students
                ? `Grading ${selectedSubmission.students.first_name} ${selectedSubmission.students.last_name}'s submission`
                : "Grade this submission"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedSubmission?.submission_text && (
              <div className="space-y-2">
                <Label>Student&apos;s Answer</Label>
                <div className="p-3 bg-neutral-100 rounded-lg text-sm whitespace-pre-wrap">
                  {selectedSubmission.submission_text}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Score {assignment.max_score ? `(out of ${assignment.max_score})` : ""} *</Label>
              <Input
                type="number"
                min="0"
                max={assignment.max_score || undefined}
                value={gradeForm.score}
                onChange={(e) => setGradeForm({ ...gradeForm, score: e.target.value })}
                placeholder="Enter score"
              />
            </div>
            <div className="space-y-2">
              <Label>Feedback</Label>
              <Textarea
                value={gradeForm.feedback}
                onChange={(e) => setGradeForm({ ...gradeForm, feedback: e.target.value })}
                placeholder="Optional feedback for the student..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsGradeOpen(false)}>Cancel</Button>
            <Button
              onClick={handleGrade}
              disabled={isLoading || !gradeForm.score}
            >
              {isLoading ? "Saving..." : "Save Grade"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
