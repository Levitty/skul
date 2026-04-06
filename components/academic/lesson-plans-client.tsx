"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, Calendar, Clock, BookOpen } from "lucide-react"
import { createLessonPlan, deleteLessonPlan } from "@/lib/actions/schemes-of-work"
import { useToast } from "@/hooks/use-toast"

interface LessonPlanData {
  id: string
  title: string
  lesson_date: string | null
  duration_minutes: number | null
  status: string
  strand: string | null
  sub_strand: string | null
  subjects: { name: string } | null
  classes: { name: string } | null
  employees: { first_name: string; last_name: string } | null
}

interface DropdownItem {
  id: string
  name: string
}

interface TeacherItem {
  id: string
  first_name: string
  last_name: string
}

interface LessonPlansClientProps {
  initialPlans: LessonPlanData[]
  subjects: DropdownItem[]
  classes: DropdownItem[]
  teachers: TeacherItem[]
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  submitted: "bg-blue-100 text-blue-700 border-blue-200",
  approved: "bg-green-100 text-green-700 border-green-200",
  revision_needed: "bg-amber-100 text-amber-700 border-amber-200",
}

function StatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status] || STATUS_COLORS.draft}`}>
      {label}
    </span>
  )
}

const emptyForm = {
  title: "",
  subject_id: "",
  class_id: "",
  teacher_id: "",
  lesson_date: "",
  duration_minutes: "40",
  strand: "",
  sub_strand: "",
  learning_indicators: "",
  introduction: "",
  lesson_development: "",
  conclusion: "",
  teaching_aids: "",
  assessment_method: "",
}

export function LessonPlansClient({
  initialPlans,
  subjects,
  classes,
  teachers,
}: LessonPlansClientProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState(emptyForm)

  const resetForm = () => setFormData(emptyForm)

  const handleCreate = async () => {
    if (!formData.title.trim() || !formData.subject_id || !formData.class_id) {
      toast({ title: "Missing fields", description: "Title, subject, and class are required.", variant: "destructive" })
      return
    }

    setIsLoading(true)
    const result = await createLessonPlan({
      title: formData.title,
      subject_id: formData.subject_id,
      class_id: formData.class_id,
      teacher_id: formData.teacher_id || undefined,
      lesson_date: formData.lesson_date || undefined,
      duration_minutes: parseInt(formData.duration_minutes) || 40,
      strand: formData.strand || undefined,
      sub_strand: formData.sub_strand || undefined,
      learning_indicators: formData.learning_indicators || undefined,
      introduction: formData.introduction || undefined,
      lesson_development: formData.lesson_development || undefined,
      conclusion: formData.conclusion || undefined,
      teaching_aids: formData.teaching_aids || undefined,
      assessment_method: formData.assessment_method || undefined,
    })
    setIsLoading(false)

    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    toast({ title: "Success", description: "Lesson plan created." })
    setIsDialogOpen(false)
    resetForm()
    router.refresh()
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this lesson plan?")) return

    const result = await deleteLessonPlan(id)
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    toast({ title: "Deleted", description: "Lesson plan removed." })
    router.refresh()
  }

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Lesson Plans</h1>
          <p className="text-muted-foreground">
            Create and manage daily lesson plans
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="mr-2 h-4 w-4" />
              New Lesson Plan
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New Lesson Plan</DialogTitle>
              <DialogDescription>Plan a lesson with objectives, activities, and assessment.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="lp-title">Title *</Label>
                <Input
                  id="lp-title"
                  value={formData.title}
                  onChange={(e) => updateField("title", e.target.value)}
                  placeholder="e.g., Introduction to Fractions"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Subject *</Label>
                  <Select value={formData.subject_id} onValueChange={(v) => updateField("subject_id", v)}>
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
                  <Select value={formData.class_id} onValueChange={(v) => updateField("class_id", v)}>
                    <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                    <SelectContent>
                      {classes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Teacher</Label>
                  <Select value={formData.teacher_id} onValueChange={(v) => updateField("teacher_id", v)}>
                    <SelectTrigger><SelectValue placeholder="Select teacher" /></SelectTrigger>
                    <SelectContent>
                      {teachers.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.first_name} {t.last_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lp-date">Lesson Date</Label>
                  <Input
                    id="lp-date"
                    type="date"
                    value={formData.lesson_date}
                    onChange={(e) => updateField("lesson_date", e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="lp-duration">Duration (minutes)</Label>
                  <Input
                    id="lp-duration"
                    type="number"
                    min={1}
                    value={formData.duration_minutes}
                    onChange={(e) => updateField("duration_minutes", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lp-strand">Strand</Label>
                  <Input
                    id="lp-strand"
                    value={formData.strand}
                    onChange={(e) => updateField("strand", e.target.value)}
                    placeholder="Curriculum strand"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="lp-substrand">Sub-strand</Label>
                  <Input
                    id="lp-substrand"
                    value={formData.sub_strand}
                    onChange={(e) => updateField("sub_strand", e.target.value)}
                    placeholder="Curriculum sub-strand"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lp-indicators">Learning Indicators</Label>
                  <Input
                    id="lp-indicators"
                    value={formData.learning_indicators}
                    onChange={(e) => updateField("learning_indicators", e.target.value)}
                    placeholder="Expected learning indicators"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lp-intro">Introduction</Label>
                <Textarea
                  id="lp-intro"
                  value={formData.introduction}
                  onChange={(e) => updateField("introduction", e.target.value)}
                  placeholder="How the lesson begins..."
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lp-development">Lesson Development</Label>
                <Textarea
                  id="lp-development"
                  value={formData.lesson_development}
                  onChange={(e) => updateField("lesson_development", e.target.value)}
                  placeholder="Main teaching activities and content..."
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lp-conclusion">Conclusion</Label>
                <Textarea
                  id="lp-conclusion"
                  value={formData.conclusion}
                  onChange={(e) => updateField("conclusion", e.target.value)}
                  placeholder="How the lesson wraps up..."
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="lp-aids">Teaching Aids</Label>
                  <Input
                    id="lp-aids"
                    value={formData.teaching_aids}
                    onChange={(e) => updateField("teaching_aids", e.target.value)}
                    placeholder="Materials and aids"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lp-assessment">Assessment Method</Label>
                  <Input
                    id="lp-assessment"
                    value={formData.assessment_method}
                    onChange={(e) => updateField("assessment_method", e.target.value)}
                    placeholder="How learning is assessed"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={isLoading || !formData.title.trim()}>
                {isLoading ? "Creating..." : "Create Lesson Plan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Lesson Plan Cards */}
      {initialPlans.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <BookOpen className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>No lesson plans yet. Create your first lesson plan to get started.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {initialPlans.map((plan) => (
            <Card key={plan.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base leading-snug">{plan.title}</CardTitle>
                  <StatusBadge status={plan.status} />
                </div>
                <CardDescription>
                  {plan.subjects?.name || "No subject"} &middot; {plan.classes?.name || "No class"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  {plan.lesson_date && (
                    <div className="flex items-center text-muted-foreground">
                      <Calendar className="mr-2 h-3.5 w-3.5" />
                      {new Date(plan.lesson_date).toLocaleDateString("en-US", {
                        weekday: "short",
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                  )}
                  {plan.duration_minutes && (
                    <div className="flex items-center text-muted-foreground">
                      <Clock className="mr-2 h-3.5 w-3.5" />
                      {plan.duration_minutes} minutes
                    </div>
                  )}
                  {plan.employees && (
                    <p className="text-muted-foreground">
                      {plan.employees.first_name} {plan.employees.last_name}
                    </p>
                  )}
                </div>
                <div className="flex justify-end mt-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(plan.id)}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
