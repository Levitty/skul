"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Plus, Pencil, Trash2, FileText } from "lucide-react"
import { createHomework, updateHomework, deleteHomework } from "@/lib/actions/homework"
import { useRouter } from "next/navigation"

interface HomeworkData {
  id: string
  title: string
  description: string | null
  due_date: string
  status: string
  is_graded: boolean
  max_marks: number | null
  class?: { id: string; name: string }
  section?: { id: string; name: string }
  subject?: { id: string; name: string }
}

interface HomeworkManagerProps {
  initialHomework: HomeworkData[]
  subjects: { id: string; name: string }[]
  classes: { id: string; name: string; sections?: { id: string; name: string }[] }[]
  currentAcademicYear?: { id: string; name: string; terms?: { id: string; name: string; is_current: boolean }[] }
}

export function HomeworkManager({ initialHomework, subjects, classes, currentAcademicYear }: HomeworkManagerProps) {
  const router = useRouter()
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [editingHomework, setEditingHomework] = useState<HomeworkData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedClass, setSelectedClass] = useState<string>("")
  
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    class_id: "",
    section_id: "",
    subject_id: "",
    due_date: "",
    max_marks: "",
    is_graded: false,
    status: "active",
  })
  
  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      class_id: "",
      section_id: "",
      subject_id: "",
      due_date: "",
      max_marks: "",
      is_graded: false,
      status: "active",
    })
    setSelectedClass("")
  }
  
  const handleClassChange = (classId: string) => {
    setSelectedClass(classId)
    setFormData({ ...formData, class_id: classId, section_id: "" })
  }
  
  const selectedClassSections = classes.find(c => c.id === selectedClass)?.sections || []
  const currentTerm = currentAcademicYear?.terms?.find(t => t.is_current)
  
  const handleAdd = async () => {
    if (!formData.title.trim() || !formData.class_id || !formData.due_date) return
    
    setIsLoading(true)
    const fd = new FormData()
    fd.append("title", formData.title)
    fd.append("class_id", formData.class_id)
    fd.append("due_date", formData.due_date)
    if (formData.description) fd.append("description", formData.description)
    if (formData.section_id) fd.append("section_id", formData.section_id)
    if (formData.subject_id) fd.append("subject_id", formData.subject_id)
    if (formData.max_marks) fd.append("max_marks", formData.max_marks)
    fd.append("is_graded", formData.is_graded.toString())
    fd.append("status", formData.status)
    if (currentAcademicYear?.id) fd.append("academic_year_id", currentAcademicYear.id)
    if (currentTerm?.id) fd.append("term_id", currentTerm.id)
    
    const result = await createHomework(fd)
    setIsLoading(false)
    
    if (result.error) {
      alert(result.error)
      return
    }
    
    setIsAddDialogOpen(false)
    resetForm()
    router.refresh()
  }
  
  const handleUpdate = async () => {
    if (!editingHomework || !formData.title.trim()) return
    
    setIsLoading(true)
    const fd = new FormData()
    fd.append("title", formData.title)
    fd.append("due_date", formData.due_date)
    if (formData.description) fd.append("description", formData.description)
    if (formData.max_marks) fd.append("max_marks", formData.max_marks)
    fd.append("is_graded", formData.is_graded.toString())
    fd.append("status", formData.status)
    
    const result = await updateHomework(editingHomework.id, fd)
    setIsLoading(false)
    
    if (result.error) {
      alert(result.error)
      return
    }
    
    setEditingHomework(null)
    resetForm()
    router.refresh()
  }
  
  const handleDelete = async (homeworkId: string) => {
    if (!confirm("Are you sure you want to delete this homework?")) return
    
    const result = await deleteHomework(homeworkId)
    if (result.error) {
      alert(result.error)
      return
    }
    router.refresh()
  }
  
  const openEditDialog = (homework: HomeworkData) => {
    setEditingHomework(homework)
    setFormData({
      title: homework.title,
      description: homework.description || "",
      class_id: homework.class?.id || "",
      section_id: homework.section?.id || "",
      subject_id: homework.subject?.id || "",
      due_date: homework.due_date,
      max_marks: homework.max_marks?.toString() || "",
      is_graded: homework.is_graded,
      status: homework.status,
    })
  }
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Homework</CardTitle>
            <CardDescription>{initialHomework.length} homework assignments</CardDescription>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="mr-2 h-4 w-4" />
                Add Homework
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Homework</DialogTitle>
                <DialogDescription>Assign homework to students</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Title *</Label>
                  <Input
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Homework title"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Class *</Label>
                    <Select value={formData.class_id} onValueChange={handleClassChange}>
                      <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                      <SelectContent>
                        {classes.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Section</Label>
                    <Select value={formData.section_id} onValueChange={(v) => setFormData({ ...formData, section_id: v })}>
                      <SelectTrigger><SelectValue placeholder="All sections" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">All sections</SelectItem>
                        {selectedClassSections.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Subject</Label>
                    <Select value={formData.subject_id} onValueChange={(v) => setFormData({ ...formData, subject_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">General</SelectItem>
                        {subjects.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Due Date *</Label>
                    <Input
                      type="date"
                      value={formData.due_date}
                      onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Homework instructions and details"
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Max Marks (if graded)</Label>
                    <Input
                      type="number"
                      value={formData.max_marks}
                      onChange={(e) => setFormData({ ...formData, max_marks: e.target.value })}
                      placeholder="100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleAdd} disabled={isLoading || !formData.title.trim() || !formData.class_id || !formData.due_date}>
                  {isLoading ? "Creating..." : "Create Homework"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {initialHomework.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>No homework yet. Create your first assignment.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialHomework.map((hw) => (
                  <TableRow key={hw.id}>
                    <TableCell className="font-medium">{hw.title}</TableCell>
                    <TableCell>
                      {hw.class?.name}
                      {hw.section && ` - ${hw.section.name}`}
                    </TableCell>
                    <TableCell>{hw.subject?.name || "-"}</TableCell>
                    <TableCell>{new Date(hw.due_date).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Badge variant={
                        hw.status === "active" ? "default" :
                        hw.status === "closed" ? "secondary" : "outline"
                      }>
                        {hw.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(hw)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(hw.id)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      
      {/* Edit Dialog */}
      <Dialog open={!!editingHomework} onOpenChange={(open: boolean) => !open && setEditingHomework(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Homework</DialogTitle>
            <DialogDescription>Update homework details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Due Date *</Label>
              <Input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingHomework(null)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={isLoading || !formData.title.trim()}>
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}


