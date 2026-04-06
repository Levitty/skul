"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Plus, FileText, Calendar, Users, CheckCircle,
  Clock, Trash2, Eye, BookOpen
} from "lucide-react"
import { createAssignment, updateAssignment, deleteAssignment } from "@/lib/actions/lms"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import Link from "next/link"

interface AssignmentData {
  id: string
  title: string
  description: string | null
  instructions: string | null
  due_date: string | null
  max_score: number | null
  is_published: boolean
  allow_late_submission: boolean
  created_at: string
  subject_id: string
  class_id: string
  subjects: { name: string } | null
  classes: { name: string } | null
  assignment_submissions: { count: number }[]
}

interface AssignmentsClientProps {
  initialAssignments: AssignmentData[]
  subjects: { id: string; name: string }[]
  classes: { id: string; name: string }[]
  teacherId: string | null
}

const emptyForm = {
  title: "",
  subject_id: "",
  class_id: "",
  description: "",
  instructions: "",
  due_date: "",
  max_score: "100",
  allow_late_submission: false,
}

export function AssignmentsClient({ initialAssignments, subjects, classes, teacherId }: AssignmentsClientProps) {
  const router = useRouter()
  const { toast } = useToast()

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const totalAssignments = initialAssignments.length
  const publishedCount = initialAssignments.filter((a) => a.is_published).length
  const pendingGrading = initialAssignments.reduce((sum, a) => {
    const submissionCount = a.assignment_submissions?.[0]?.count ?? 0
    return sum + (a.is_published ? submissionCount : 0)
  }, 0)

  const handleCreate = async () => {
    if (!form.title.trim() || !form.subject_id || !form.class_id) {
      toast({ title: "Missing fields", description: "Title, subject, and class are required", variant: "destructive" })
      return
    }

    setIsLoading(true)
    const result = await createAssignment({
      title: form.title,
      subject_id: form.subject_id,
      class_id: form.class_id,
      teacher_id: teacherId || undefined,
      description: form.description || undefined,
      instructions: form.instructions || undefined,
      due_date: form.due_date || undefined,
      max_score: parseInt(form.max_score) || 100,
      allow_late_submission: form.allow_late_submission,
    })
    setIsLoading(false)

    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    toast({ title: "Assignment created" })
    setIsDialogOpen(false)
    setForm(emptyForm)
    router.refresh()
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this assignment? This cannot be undone.")) return

    const result = await deleteAssignment(id)
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }
    toast({ title: "Assignment deleted" })
    router.refresh()
  }

  const handleTogglePublish = async (id: string, currentlyPublished: boolean) => {
    const result = await updateAssignment(id, { is_published: !currentlyPublished })
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }
    toast({ title: currentlyPublished ? "Assignment unpublished" : "Assignment published" })
    router.refresh()
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-neutral-900 mb-2">
            Assignments
          </h1>
          <p className="text-lg text-neutral-500">
            Create, manage, and grade student assignments
          </p>
        </div>
        <Button onClick={() => { setForm(emptyForm); setIsDialogOpen(true) }}>
          <Plus className="mr-2 h-4 w-4" />
          Create Assignment
        </Button>
      </div>

      <Card className="border-0 shadow-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500 text-white">
        <CardContent className="p-6">
          <div className="grid grid-cols-3 gap-6">
            <div className="text-center">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold">{totalAssignments}</p>
              <p className="text-white/70 text-sm">Total Assignments</p>
            </div>
            <div className="text-center">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold">{publishedCount}</p>
              <p className="text-white/70 text-sm">Published</p>
            </div>
            <div className="text-center">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold">{pendingGrading}</p>
              <p className="text-white/70 text-sm">Submissions</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {initialAssignments.length === 0 ? (
        <Card className="border-0 shadow-xl">
          <CardContent className="py-12 text-center text-neutral-500">
            <BookOpen className="mx-auto h-12 w-12 mb-4 opacity-50" />
            <p>No assignments yet. Create your first assignment to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {initialAssignments.map((assignment) => {
            const submissionCount = assignment.assignment_submissions?.[0]?.count ?? 0
            const isOverdue = assignment.due_date && new Date(assignment.due_date) < new Date()

            return (
              <Card
                key={assignment.id}
                className="border-0 shadow-xl hover:shadow-2xl transition-all duration-200 hover:-translate-y-1"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">{assignment.title}</CardTitle>
                      <CardDescription className="truncate">
                        {assignment.subjects?.name || "No subject"} &middot; {assignment.classes?.name || "No class"}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      {assignment.is_published ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                          Published
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-neutral-500">Draft</Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {assignment.description && (
                    <p className="text-sm text-neutral-500 line-clamp-2">{assignment.description}</p>
                  )}
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-neutral-500" />
                      <span className={isOverdue ? "text-red-600 dark:text-red-400 font-medium" : "text-neutral-500"}>
                        {assignment.due_date
                          ? new Date(assignment.due_date).toLocaleDateString()
                          : "No due date"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-neutral-500" />
                      <span className="text-neutral-500">
                        {submissionCount} submission{submissionCount !== 1 && "s"}
                      </span>
                    </div>
                    {assignment.max_score && (
                      <div className="flex items-center gap-1.5">
                        <CheckCircle className="h-3.5 w-3.5 text-neutral-500" />
                        <span className="text-neutral-500">Max: {assignment.max_score} pts</span>
                      </div>
                    )}
                    {assignment.allow_late_submission && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-neutral-500" />
                        <span className="text-neutral-500">Late OK</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/dashboard/teacher/assignments/${assignment.id}`}>
                        <Eye className="h-3 w-3 mr-1" />
                        View
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTogglePublish(assignment.id, assignment.is_published)}
                    >
                      {assignment.is_published ? "Unpublish" : "Publish"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(assignment.id)}
                      className="ml-auto text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Assignment</DialogTitle>
            <DialogDescription>Create a new assignment for your students</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Assignment title"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Subject *</Label>
                <Select
                  value={form.subject_id}
                  onValueChange={(v) => setForm({ ...form, subject_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                  <SelectContent>
                    {subjects.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Class *</Label>
                <Select
                  value={form.class_id}
                  onValueChange={(v) => setForm({ ...form, class_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Brief description of the assignment"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Instructions</Label>
              <Textarea
                value={form.instructions}
                onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                placeholder="Detailed instructions for students..."
                rows={4}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input
                  type="datetime-local"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Max Score</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.max_score}
                  onChange={(e) => setForm({ ...form, max_score: e.target.value })}
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="allow_late"
                checked={form.allow_late_submission}
                onCheckedChange={(checked) =>
                  setForm({ ...form, allow_late_submission: checked === true })
                }
              />
              <label htmlFor="allow_late" className="text-sm font-medium cursor-pointer">
                Allow late submissions
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={isLoading || !form.title.trim() || !form.subject_id || !form.class_id}
            >
              {isLoading ? "Creating..." : "Create Assignment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
