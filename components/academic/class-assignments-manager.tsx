"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Plus, Pencil, Trash2, Users, BookOpen, BarChart3 } from "lucide-react"
import {
  getClassesForAssignment,
  getTeachersForAssignment,
  getSubjectsForAssignment,
  createClassAssignment,
  updateClassAssignment,
  deleteClassAssignment,
  getAssignmentStats,
} from "@/lib/actions/class-assignments"

interface Assignment {
  id: string
  class_id: string
  subject: string
  teacher_id: string | null
  classes?: { id: string; name: string; level: number | null }
  employees?: { id: string; first_name: string; last_name: string; email: string }
}

interface ClassAssignmentsManagerProps {
  initialAssignments: Assignment[]
  initialStats: {
    totalAssignments: number
    teachersAssigned: number
    classesCovered: number
    unassignedSubjects: number
  }
}

export function ClassAssignmentsManager({
  initialAssignments,
  initialStats,
}: ClassAssignmentsManagerProps) {
  const router = useRouter()
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [assignments, setAssignments] = useState<Assignment[]>(initialAssignments)
  const [stats, setStats] = useState(initialStats)
  const [filterView, setFilterView] = useState<"all" | "class" | "teacher">("all")
  const [searchTerm, setSearchTerm] = useState("")

  const [classes, setClasses] = useState<any[]>([])
  const [teachers, setTeachers] = useState<any[]>([])
  const [subjects, setSubjects] = useState<any[]>([])

  const [formData, setFormData] = useState({
    class_id: "",
    subject: "",
    teacher_id: "",
  })

  const [errorMessage, setErrorMessage] = useState("")

  useEffect(() => {
    loadSelectOptions()
  }, [])

  const loadSelectOptions = async () => {
    const [classesRes, teachersRes, subjectsRes] = await Promise.all([
      getClassesForAssignment(),
      getTeachersForAssignment(),
      getSubjectsForAssignment(),
    ])

    if (classesRes.data) setClasses(classesRes.data)
    if (teachersRes.data) setTeachers(teachersRes.data)
    if (subjectsRes.data) setSubjects(subjectsRes.data)
  }

  const resetForm = () => {
    setFormData({ class_id: "", subject: "", teacher_id: "" })
    setErrorMessage("")
  }

  const handleAdd = async () => {
    if (!formData.class_id || !formData.subject) {
      setErrorMessage("Class and Subject are required")
      return
    }

    setIsLoading(true)
    const fd = new FormData()
    fd.append("class_id", formData.class_id)
    fd.append("subject", formData.subject)
    if (formData.teacher_id) fd.append("teacher_id", formData.teacher_id)

    const result = await createClassAssignment(fd)
    setIsLoading(false)

    if (result.error) {
      setErrorMessage(result.error)
      return
    }

    setIsAddDialogOpen(false)
    resetForm()
    router.refresh()

    // Refresh stats
    const statsRes = await getAssignmentStats()
    if (statsRes.data) setStats(statsRes.data)
  }

  const handleUpdate = async () => {
    if (!editingAssignment || !formData.class_id || !formData.subject) {
      setErrorMessage("Class and Subject are required")
      return
    }

    setIsLoading(true)
    const fd = new FormData()
    fd.append("subject", formData.subject)
    if (formData.teacher_id) fd.append("teacher_id", formData.teacher_id)

    const result = await updateClassAssignment(editingAssignment.id, fd)
    setIsLoading(false)

    if (result.error) {
      setErrorMessage(result.error)
      return
    }

    setEditingAssignment(null)
    resetForm()
    router.refresh()

    // Refresh stats
    const statsRes = await getAssignmentStats()
    if (statsRes.data) setStats(statsRes.data)
  }

  const handleDelete = async (assignmentId: string) => {
    if (!confirm("Are you sure you want to delete this assignment?")) return

    const result = await deleteClassAssignment(assignmentId)
    if (result.error) {
      setErrorMessage(result.error)
      return
    }
    router.refresh()

    // Refresh stats
    const statsRes = await getAssignmentStats()
    if (statsRes.data) setStats(statsRes.data)
  }

  const openEditDialog = (assignment: Assignment) => {
    setEditingAssignment(assignment)
    setFormData({
      class_id: assignment.class_id,
      subject: assignment.subject,
      teacher_id: assignment.teacher_id || "",
    })
    setErrorMessage("")
  }

  const getTeacherName = (teacherId: string | null) => {
    if (!teacherId) return "Unassigned"
    const teacher = teachers.find(t => t.id === teacherId)
    return teacher ? `${teacher.first_name} ${teacher.last_name}` : "Unknown"
  }

  const getClassName = (classId: string) => {
    const cls = classes.find(c => c.id === classId)
    return cls ? cls.name : "Unknown"
  }

  const filteredAssignments = assignments.filter(a => {
    const searchStr = searchTerm.toLowerCase()
    const className = getClassName(a.class_id).toLowerCase()
    const teacherName = getTeacherName(a.teacher_id).toLowerCase()
    const subject = (a.subject || "").toLowerCase()

    return (
      className.includes(searchStr) ||
      teacherName.includes(searchStr) ||
      subject.includes(searchStr)
    )
  })

  const StatCard = ({ icon: Icon, label, value }: any) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  )

  const AssignmentForm = () => (
    <div className="space-y-4 py-4">
      {errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="class">Class *</Label>
        <Select
          value={formData.class_id}
          onValueChange={(value) =>
            setFormData({ ...formData, class_id: value })
          }
          disabled={!!editingAssignment}
        >
          <SelectTrigger id="class">
            <SelectValue placeholder="Select a class" />
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
        <Select
          value={formData.subject}
          onValueChange={(value) =>
            setFormData({ ...formData, subject: value })
          }
        >
          <SelectTrigger id="subject">
            <SelectValue placeholder="Select a subject" />
          </SelectTrigger>
          <SelectContent>
            {subjects.map((subj) => (
              <SelectItem key={subj.id} value={subj.name}>
                {subj.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="teacher">Teacher (Optional)</Label>
        <Select
          value={formData.teacher_id}
          onValueChange={(value) =>
            setFormData({ ...formData, teacher_id: value })
          }
        >
          <SelectTrigger id="teacher">
            <SelectValue placeholder="Select a teacher or leave unassigned" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Unassigned</SelectItem>
            {teachers.map((teacher) => (
              <SelectItem key={teacher.id} value={teacher.id}>
                {teacher.first_name} {teacher.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Dashboard Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          icon={BarChart3}
          label="Total Assignments"
          value={stats.totalAssignments}
        />
        <StatCard
          icon={Users}
          label="Teachers Assigned"
          value={stats.teachersAssigned}
        />
        <StatCard
          icon={BookOpen}
          label="Classes Covered"
          value={stats.classesCovered}
        />
        <StatCard
          icon={AlertDescription}
          label="Unassigned Subjects"
          value={stats.unassignedSubjects}
        />
      </div>

      {/* Main Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Class-Teacher Assignments</CardTitle>
            <CardDescription>
              {filteredAssignments.length} assignment(s)
            </CardDescription>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="mr-2 h-4 w-4" />
                Add Assignment
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Assignment</DialogTitle>
                <DialogDescription>
                  Assign a teacher to teach a subject in a class
                </DialogDescription>
              </DialogHeader>
              <AssignmentForm />
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsAddDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button onClick={handleAdd} disabled={isLoading}>
                  {isLoading ? "Creating..." : "Create Assignment"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Search and Filter */}
          <div className="flex gap-4 mb-4">
            <Input
              placeholder="Search by class, teacher, or subject..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1"
            />
            <Select value={filterView} onValueChange={(v) => setFilterView(v as any)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Assignments</SelectItem>
                <SelectItem value="class">View by Class</SelectItem>
                <SelectItem value="teacher">View by Teacher</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Assignments Table */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Teacher</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAssignments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No assignments found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAssignments.map((assignment) => (
                    <TableRow key={assignment.id}>
                      <TableCell className="font-medium">
                        {getClassName(assignment.class_id)}
                      </TableCell>
                      <TableCell>{assignment.subject}</TableCell>
                      <TableCell>
                        {getTeacherName(assignment.teacher_id)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            assignment.teacher_id ? "default" : "secondary"
                          }
                        >
                          {assignment.teacher_id ? "Assigned" : "Unassigned"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(assignment)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(assignment.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      {editingAssignment && (
        <Dialog
          open={!!editingAssignment}
          onOpenChange={(open) => {
            if (!open) {
              setEditingAssignment(null)
              resetForm()
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Assignment</DialogTitle>
              <DialogDescription>
                Update the teacher assignment for {editingAssignment.subject} in{" "}
                {getClassName(editingAssignment.class_id)}
              </DialogDescription>
            </DialogHeader>
            <AssignmentForm />
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setEditingAssignment(null)
                  resetForm()
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleUpdate} disabled={isLoading}>
                {isLoading ? "Updating..." : "Update Assignment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
