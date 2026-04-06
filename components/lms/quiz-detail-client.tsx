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
import {
  ArrowLeft, Plus, Pencil, Trash2, CheckCircle,
  Brain, HelpCircle, ListChecks, XCircle
} from "lucide-react"
import {
  updateQuiz, addQuizQuestion, updateQuizQuestion, deleteQuizQuestion,
} from "@/lib/actions/lms"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import Link from "next/link"

interface QuizOption {
  id: string
  option_text: string
  is_correct: boolean
  order_index: number
}

interface QuizQuestion {
  id: string
  question_text: string
  question_type: string
  points: number
  explanation: string | null
  order_index: number
  quiz_options: QuizOption[]
}

interface QuizDetailProps {
  quiz: {
    id: string
    title: string
    description: string | null
    time_limit_minutes: number | null
    max_attempts: number | null
    passing_score: number | null
    shuffle_questions: boolean
    show_answers_after: boolean
    is_published: boolean
    subjects: { name: string } | null
    classes: { name: string } | null
    quiz_questions: QuizQuestion[]
  }
}

interface OptionInput {
  option_text: string
  is_correct: boolean
}

const emptyQuestionForm = {
  question_text: "",
  question_type: "multiple_choice",
  points: "1",
  explanation: "",
}

export function QuizDetailClient({ quiz }: QuizDetailProps) {
  const router = useRouter()
  const { toast } = useToast()

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [form, setForm] = useState(emptyQuestionForm)
  const [options, setOptions] = useState<OptionInput[]>([
    { option_text: "", is_correct: true },
    { option_text: "", is_correct: false },
  ])
  const [editingQuestion, setEditingQuestion] = useState<QuizQuestion | null>(null)
  const [editForm, setEditForm] = useState(emptyQuestionForm)

  const questions = quiz.quiz_questions || []
  const totalPoints = questions.reduce((sum, q) => sum + (q.points || 0), 0)

  const handleTogglePublish = async () => {
    const result = await updateQuiz(quiz.id, { is_published: !quiz.is_published })
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }
    toast({ title: quiz.is_published ? "Quiz unpublished" : "Quiz published" })
    router.refresh()
  }

  const handleAddOption = () => {
    setOptions([...options, { option_text: "", is_correct: false }])
  }

  const handleRemoveOption = (index: number) => {
    if (options.length <= 2) return
    const newOptions = options.filter((_, i) => i !== index)
    if (!newOptions.some((o) => o.is_correct)) {
      newOptions[0].is_correct = true
    }
    setOptions(newOptions)
  }

  const handleOptionChange = (index: number, field: string, value: string | boolean) => {
    const newOptions = [...options]
    if (field === "is_correct") {
      newOptions.forEach((o, i) => { o.is_correct = i === index })
    } else {
      (newOptions[index] as any)[field] = value
    }
    setOptions(newOptions)
  }

  const resetAddForm = () => {
    setForm(emptyQuestionForm)
    setOptions([
      { option_text: "", is_correct: true },
      { option_text: "", is_correct: false },
    ])
  }

  const handleQuestionTypeChange = (type: string) => {
    setForm({ ...form, question_type: type })
    if (type === "true_false") {
      setOptions([
        { option_text: "True", is_correct: true },
        { option_text: "False", is_correct: false },
      ])
    } else if (type === "multiple_choice") {
      setOptions([
        { option_text: "", is_correct: true },
        { option_text: "", is_correct: false },
      ])
    }
  }

  const handleAddQuestion = async () => {
    if (!form.question_text.trim()) {
      toast({ title: "Missing fields", description: "Question text is required", variant: "destructive" })
      return
    }

    let questionOptions: OptionInput[] | undefined
    if (form.question_type === "multiple_choice") {
      const validOptions = options.filter((o) => o.option_text.trim())
      if (validOptions.length < 2) {
        toast({ title: "Need more options", description: "At least 2 options are required", variant: "destructive" })
        return
      }
      if (!validOptions.some((o) => o.is_correct)) {
        toast({ title: "No correct answer", description: "Mark one option as correct", variant: "destructive" })
        return
      }
      questionOptions = validOptions
    } else if (form.question_type === "true_false") {
      questionOptions = options
    }

    setIsLoading(true)
    const result = await addQuizQuestion(quiz.id, {
      question_text: form.question_text,
      question_type: form.question_type,
      points: parseInt(form.points) || 1,
      explanation: form.explanation || undefined,
      options: questionOptions,
    })
    setIsLoading(false)

    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    toast({ title: "Question added" })
    setIsAddOpen(false)
    resetAddForm()
    router.refresh()
  }

  const openEditDialog = (question: QuizQuestion) => {
    setEditingQuestion(question)
    setEditForm({
      question_text: question.question_text,
      question_type: question.question_type,
      points: String(question.points),
      explanation: question.explanation || "",
    })
    setIsEditOpen(true)
  }

  const handleEditQuestion = async () => {
    if (!editingQuestion) return

    setIsLoading(true)
    const result = await updateQuizQuestion(editingQuestion.id, {
      question_text: editForm.question_text,
      question_type: editForm.question_type,
      points: parseInt(editForm.points) || 1,
      explanation: editForm.explanation || undefined,
    })
    setIsLoading(false)

    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    toast({ title: "Question updated" })
    setIsEditOpen(false)
    setEditingQuestion(null)
    router.refresh()
  }

  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm("Delete this question?")) return

    const result = await deleteQuizQuestion(questionId)
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }
    toast({ title: "Question deleted" })
    router.refresh()
  }

  const getQuestionTypeBadge = (type: string) => {
    switch (type) {
      case "multiple_choice":
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Multiple Choice</Badge>
      case "true_false":
        return <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">True / False</Badge>
      case "short_answer":
        return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">Short Answer</Badge>
      default:
        return <Badge variant="outline">{type}</Badge>
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/teacher/quizzes">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Link>
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-bold text-neutral-900 mb-2">
            {quiz.title}
          </h1>
          <div className="flex items-center gap-3 text-neutral-500">
            <span className="flex items-center gap-1">
              <Brain className="h-4 w-4" />
              {quiz.subjects?.name || "No subject"}
            </span>
            <span>&middot;</span>
            <span>{quiz.classes?.name || "No class"}</span>
            {quiz.time_limit_minutes && (
              <>
                <span>&middot;</span>
                <span>{quiz.time_limit_minutes} min</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={quiz.is_published ? "outline" : "default"}
            onClick={handleTogglePublish}
          >
            {quiz.is_published ? "Unpublish" : "Publish"}
          </Button>
        </div>
      </div>

      <Card className="border-0 shadow-xl bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 text-white">
        <CardContent className="p-6">
          <div className="grid grid-cols-3 gap-6">
            <div className="text-center">
              <ListChecks className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold">{questions.length}</p>
              <p className="text-white/70 text-sm">Questions</p>
            </div>
            <div className="text-center">
              <HelpCircle className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold">{totalPoints}</p>
              <p className="text-white/70 text-sm">Total Points</p>
            </div>
            <div className="text-center">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold">{quiz.is_published ? "Live" : "Draft"}</p>
              <p className="text-white/70 text-sm">Status</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Questions</h2>
        <Button onClick={() => { resetAddForm(); setIsAddOpen(true) }}>
          <Plus className="mr-2 h-4 w-4" />
          Add Question
        </Button>
      </div>

      {questions.length === 0 ? (
        <Card className="border-0 shadow-xl">
          <CardContent className="py-12 text-center text-neutral-500">
            <HelpCircle className="mx-auto h-12 w-12 mb-4 opacity-50" />
            <p>No questions yet. Add your first question to this quiz.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {questions.map((question, index) => (
            <Card key={question.id} className="border-0 shadow-xl">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-md">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base">{question.question_text}</CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        {getQuestionTypeBadge(question.question_type)}
                        <span className="text-sm text-neutral-500">
                          {question.points} pt{question.points !== 1 && "s"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(question)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteQuestion(question.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {(question.question_type === "multiple_choice" || question.question_type === "true_false") &&
                question.quiz_options?.length > 0 && (
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    {question.quiz_options
                      .sort((a, b) => a.order_index - b.order_index)
                      .map((option) => (
                        <div
                          key={option.id}
                          className={`flex items-center gap-2 p-2.5 rounded-lg text-sm ${
                            option.is_correct
                              ? "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800"
                              : "bg-neutral-50 border border-transparent"
                          }`}
                        >
                          {option.is_correct ? (
                            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                          ) : (
                            <XCircle className="h-4 w-4 text-neutral-500 shrink-0" />
                          )}
                          <span className={option.is_correct ? "font-medium text-green-800 dark:text-green-200" : ""}>
                            {option.option_text}
                          </span>
                        </div>
                      ))}
                  </div>
                  {question.explanation && (
                    <p className="mt-3 text-sm text-neutral-500 italic">
                      Explanation: {question.explanation}
                    </p>
                  )}
                </CardContent>
              )}
              {question.question_type === "short_answer" && question.explanation && (
                <CardContent className="pt-0">
                  <p className="text-sm text-neutral-500 italic">
                    Explanation: {question.explanation}
                  </p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Add Question Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Question</DialogTitle>
            <DialogDescription>Add a new question to this quiz</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Question Text *</Label>
              <Textarea
                value={form.question_text}
                onChange={(e) => setForm({ ...form, question_text: e.target.value })}
                placeholder="Enter your question..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Question Type *</Label>
                <Select
                  value={form.question_type}
                  onValueChange={handleQuestionTypeChange}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                    <SelectItem value="true_false">True / False</SelectItem>
                    <SelectItem value="short_answer">Short Answer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Points</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.points}
                  onChange={(e) => setForm({ ...form, points: e.target.value })}
                />
              </div>
            </div>

            {form.question_type === "multiple_choice" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Options</Label>
                  <Button type="button" variant="outline" size="sm" onClick={handleAddOption}>
                    <Plus className="h-3 w-3 mr-1" />
                    Add Option
                  </Button>
                </div>
                {options.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="correct_option"
                      checked={opt.is_correct}
                      onChange={() => handleOptionChange(idx, "is_correct", true)}
                      className="h-4 w-4 accent-green-600"
                    />
                    <Input
                      value={opt.option_text}
                      onChange={(e) => handleOptionChange(idx, "option_text", e.target.value)}
                      placeholder={`Option ${idx + 1}`}
                      className="flex-1"
                    />
                    {options.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveOption(idx)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <p className="text-xs text-neutral-500">
                  Select the radio button next to the correct answer
                </p>
              </div>
            )}

            {form.question_type === "true_false" && (
              <div className="space-y-3">
                <Label>Correct Answer</Label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="tf_correct"
                      checked={options[0]?.is_correct === true}
                      onChange={() => setOptions([
                        { option_text: "True", is_correct: true },
                        { option_text: "False", is_correct: false },
                      ])}
                      className="h-4 w-4 accent-green-600"
                    />
                    <span className="text-sm font-medium">True</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="tf_correct"
                      checked={options[1]?.is_correct === true}
                      onChange={() => setOptions([
                        { option_text: "True", is_correct: false },
                        { option_text: "False", is_correct: true },
                      ])}
                      className="h-4 w-4 accent-green-600"
                    />
                    <span className="text-sm font-medium">False</span>
                  </label>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Explanation (optional)</Label>
              <Textarea
                value={form.explanation}
                onChange={(e) => setForm({ ...form, explanation: e.target.value })}
                placeholder="Explain the correct answer..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button
              onClick={handleAddQuestion}
              disabled={isLoading || !form.question_text.trim()}
            >
              {isLoading ? "Adding..." : "Add Question"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Question Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Question</DialogTitle>
            <DialogDescription>Update question details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Question Text *</Label>
              <Textarea
                value={editForm.question_text}
                onChange={(e) => setEditForm({ ...editForm, question_text: e.target.value })}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Question Type</Label>
                <Select
                  value={editForm.question_type}
                  onValueChange={(v) => setEditForm({ ...editForm, question_type: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                    <SelectItem value="true_false">True / False</SelectItem>
                    <SelectItem value="short_answer">Short Answer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Points</Label>
                <Input
                  type="number"
                  min="1"
                  value={editForm.points}
                  onChange={(e) => setEditForm({ ...editForm, points: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Explanation</Label>
              <Textarea
                value={editForm.explanation}
                onChange={(e) => setEditForm({ ...editForm, explanation: e.target.value })}
                placeholder="Explain the correct answer..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button
              onClick={handleEditQuestion}
              disabled={isLoading || !editForm.question_text.trim()}
            >
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
