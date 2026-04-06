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
  Plus, Brain, Clock, ListChecks, CheckCircle,
  Trash2, Eye, HelpCircle
} from "lucide-react"
import { createQuiz, deleteQuiz } from "@/lib/actions/lms"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import Link from "next/link"

interface QuizData {
  id: string
  title: string
  description: string | null
  time_limit_minutes: number | null
  max_attempts: number | null
  passing_score: number | null
  shuffle_questions: boolean
  show_answers_after: boolean
  is_published: boolean
  created_at: string
  subject_id: string
  class_id: string
  subjects: { name: string } | null
  classes: { name: string } | null
  quiz_questions: { count: number }[]
}

interface QuizzesClientProps {
  initialQuizzes: QuizData[]
  subjects: { id: string; name: string }[]
  classes: { id: string; name: string }[]
  teacherId: string | null
}

const emptyForm = {
  title: "",
  subject_id: "",
  class_id: "",
  description: "",
  time_limit_minutes: "",
  max_attempts: "1",
  passing_score: "",
  shuffle_questions: false,
  show_answers_after: true,
}

export function QuizzesClient({ initialQuizzes, subjects, classes, teacherId }: QuizzesClientProps) {
  const router = useRouter()
  const { toast } = useToast()

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const totalQuizzes = initialQuizzes.length
  const publishedCount = initialQuizzes.filter((q) => q.is_published).length
  const totalQuestions = initialQuizzes.reduce((sum, q) => sum + (q.quiz_questions?.[0]?.count ?? 0), 0)

  const handleCreate = async () => {
    if (!form.title.trim() || !form.subject_id || !form.class_id) {
      toast({ title: "Missing fields", description: "Title, subject, and class are required", variant: "destructive" })
      return
    }

    setIsLoading(true)
    const result = await createQuiz({
      title: form.title,
      subject_id: form.subject_id,
      class_id: form.class_id,
      teacher_id: teacherId || undefined,
      description: form.description || undefined,
      time_limit_minutes: form.time_limit_minutes ? parseInt(form.time_limit_minutes) : undefined,
      max_attempts: parseInt(form.max_attempts) || 1,
      passing_score: form.passing_score ? parseInt(form.passing_score) : undefined,
      shuffle_questions: form.shuffle_questions,
      show_answers_after: form.show_answers_after,
    })
    setIsLoading(false)

    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    toast({ title: "Quiz created" })
    setIsDialogOpen(false)
    setForm(emptyForm)
    router.refresh()
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this quiz? This cannot be undone.")) return

    const result = await deleteQuiz(id)
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }
    toast({ title: "Quiz deleted" })
    router.refresh()
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-neutral-900 mb-2">
            Quizzes
          </h1>
          <p className="text-lg text-neutral-500">
            Create and manage quizzes for your students
          </p>
        </div>
        <Button onClick={() => { setForm(emptyForm); setIsDialogOpen(true) }}>
          <Plus className="mr-2 h-4 w-4" />
          Create Quiz
        </Button>
      </div>

      <Card className="border-0 shadow-xl bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 text-white">
        <CardContent className="p-6">
          <div className="grid grid-cols-3 gap-6">
            <div className="text-center">
              <Brain className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold">{totalQuizzes}</p>
              <p className="text-white/70 text-sm">Total Quizzes</p>
            </div>
            <div className="text-center">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold">{publishedCount}</p>
              <p className="text-white/70 text-sm">Published</p>
            </div>
            <div className="text-center">
              <HelpCircle className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold">{totalQuestions}</p>
              <p className="text-white/70 text-sm">Total Questions</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {initialQuizzes.length === 0 ? (
        <Card className="border-0 shadow-xl">
          <CardContent className="py-12 text-center text-neutral-500">
            <Brain className="mx-auto h-12 w-12 mb-4 opacity-50" />
            <p>No quizzes yet. Create your first quiz to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {initialQuizzes.map((quiz) => {
            const questionCount = quiz.quiz_questions?.[0]?.count ?? 0

            return (
              <Card
                key={quiz.id}
                className="border-0 shadow-xl hover:shadow-2xl transition-all duration-200 hover:-translate-y-1"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">{quiz.title}</CardTitle>
                      <CardDescription className="truncate">
                        {quiz.subjects?.name || "No subject"} &middot; {quiz.classes?.name || "No class"}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      {quiz.is_published ? (
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
                  {quiz.description && (
                    <p className="text-sm text-neutral-500 line-clamp-2">{quiz.description}</p>
                  )}
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-1.5">
                      <ListChecks className="h-3.5 w-3.5 text-neutral-500" />
                      <span className="text-neutral-500">
                        {questionCount} question{questionCount !== 1 && "s"}
                      </span>
                    </div>
                    {quiz.time_limit_minutes && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-neutral-500" />
                        <span className="text-neutral-500">{quiz.time_limit_minutes} min</span>
                      </div>
                    )}
                    {quiz.max_attempts && (
                      <div className="flex items-center gap-1.5">
                        <Brain className="h-3.5 w-3.5 text-neutral-500" />
                        <span className="text-neutral-500">
                          {quiz.max_attempts} attempt{quiz.max_attempts !== 1 && "s"}
                        </span>
                      </div>
                    )}
                    {quiz.passing_score !== null && quiz.passing_score !== undefined && (
                      <div className="flex items-center gap-1.5">
                        <CheckCircle className="h-3.5 w-3.5 text-neutral-500" />
                        <span className="text-neutral-500">Pass: {quiz.passing_score}%</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/dashboard/teacher/quizzes/${quiz.id}`}>
                        <Eye className="h-3 w-3 mr-1" />
                        Manage
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(quiz.id)}
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
            <DialogTitle>Create Quiz</DialogTitle>
            <DialogDescription>Create a new quiz for your students</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Quiz title"
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
                placeholder="Brief description of the quiz"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Time Limit (minutes)</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.time_limit_minutes}
                  onChange={(e) => setForm({ ...form, time_limit_minutes: e.target.value })}
                  placeholder="No limit"
                />
              </div>
              <div className="space-y-2">
                <Label>Max Attempts</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.max_attempts}
                  onChange={(e) => setForm({ ...form, max_attempts: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Passing Score (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={form.passing_score}
                  onChange={(e) => setForm({ ...form, passing_score: e.target.value })}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="shuffle"
                  checked={form.shuffle_questions}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, shuffle_questions: checked === true })
                  }
                />
                <label htmlFor="shuffle" className="text-sm font-medium cursor-pointer">
                  Shuffle questions
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="show_answers"
                  checked={form.show_answers_after}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, show_answers_after: checked === true })
                  }
                />
                <label htmlFor="show_answers" className="text-sm font-medium cursor-pointer">
                  Show answers after submission
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={isLoading || !form.title.trim() || !form.subject_id || !form.class_id}
            >
              {isLoading ? "Creating..." : "Create Quiz"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
