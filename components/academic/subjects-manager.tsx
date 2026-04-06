"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Plus, Pencil, Trash2, BookOpen } from "lucide-react"
import { createSubject, updateSubject, deleteSubject } from "@/lib/actions/subjects"
import { useRouter } from "next/navigation"

interface SubjectData {
  id: string
  name: string
  code: string | null
  description: string | null
  is_active: boolean
}

interface SubjectsManagerProps {
  initialSubjects: SubjectData[]
}

export function SubjectsManager({ initialSubjects }: SubjectsManagerProps) {
  const router = useRouter()
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [editingSubject, setEditingSubject] = useState<SubjectData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    description: "",
  })
  
  const resetForm = () => {
    setFormData({ name: "", code: "", description: "" })
  }
  
  const handleAdd = async () => {
    if (!formData.name.trim()) return
    
    setIsLoading(true)
    const fd = new FormData()
    fd.append("name", formData.name)
    if (formData.code) fd.append("code", formData.code)
    if (formData.description) fd.append("description", formData.description)
    
    const result = await createSubject(fd)
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
    if (!editingSubject || !formData.name.trim()) return
    
    setIsLoading(true)
    const fd = new FormData()
    fd.append("name", formData.name)
    if (formData.code) fd.append("code", formData.code)
    if (formData.description) fd.append("description", formData.description)
    
    const result = await updateSubject(editingSubject.id, fd)
    setIsLoading(false)
    
    if (result.error) {
      alert(result.error)
      return
    }
    
    setEditingSubject(null)
    resetForm()
    router.refresh()
  }
  
  const handleDelete = async (subjectId: string) => {
    if (!confirm("Are you sure you want to delete this subject?")) return
    
    const result = await deleteSubject(subjectId)
    if (result.error) {
      alert(result.error)
      return
    }
    router.refresh()
  }
  
  const openEditDialog = (subject: SubjectData) => {
    setEditingSubject(subject)
    setFormData({
      name: subject.name,
      code: subject.code || "",
      description: subject.description || "",
    })
  }
  
  const SubjectForm = () => (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label htmlFor="name">Subject Name *</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g., Mathematics, English, Science"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="code">Subject Code</Label>
        <Input
          id="code"
          value={formData.code}
          onChange={(e) => setFormData({ ...formData, code: e.target.value })}
          placeholder="e.g., MATH, ENG, SCI"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Brief description of the subject"
        />
      </div>
    </div>
  )
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Subjects</CardTitle>
            <CardDescription>{initialSubjects.length} subjects configured</CardDescription>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="mr-2 h-4 w-4" />
                Add Subject
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Subject</DialogTitle>
                <DialogDescription>Create a new subject for your school</DialogDescription>
              </DialogHeader>
              <SubjectForm />
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleAdd} disabled={isLoading || !formData.name.trim()}>
                  {isLoading ? "Creating..." : "Create Subject"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {initialSubjects.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <BookOpen className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>No subjects yet. Create your first subject to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialSubjects.map((subject) => (
                  <TableRow key={subject.id}>
                    <TableCell className="font-medium">{subject.name}</TableCell>
                    <TableCell>{subject.code || "-"}</TableCell>
                    <TableCell className="max-w-xs truncate">{subject.description || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={subject.is_active ? "default" : "secondary"}>
                        {subject.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(subject)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(subject.id)}>
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
      <Dialog open={!!editingSubject} onOpenChange={(open: boolean) => !open && setEditingSubject(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Subject</DialogTitle>
            <DialogDescription>Update subject details</DialogDescription>
          </DialogHeader>
          <SubjectForm />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingSubject(null)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={isLoading || !formData.name.trim()}>
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}


