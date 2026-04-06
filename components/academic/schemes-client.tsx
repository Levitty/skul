"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, Eye, FileText, BookOpen, CheckCircle, Clock } from "lucide-react"
import { createScheme, deleteScheme } from "@/lib/actions/schemes-of-work"
import { useToast } from "@/hooks/use-toast"

interface SchemeData {
  id: string
  title: string
  description: string | null
  status: string
  created_at: string
  subjects: { name: string } | null
  classes: { name: string } | null
  terms: { name: string } | null
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

interface SchemesClientProps {
  initialSchemes: SchemeData[]
  subjects: DropdownItem[]
  classes: DropdownItem[]
  terms: DropdownItem[]
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

export function SchemesClient({
  initialSchemes,
  subjects,
  classes,
  terms,
  teachers,
}: SchemesClientProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const [formData, setFormData] = useState({
    title: "",
    subject_id: "",
    class_id: "",
    term_id: "",
    teacher_id: "",
    description: "",
  })

  const resetForm = () => {
    setFormData({ title: "", subject_id: "", class_id: "", term_id: "", teacher_id: "", description: "" })
  }

  const draftCount = initialSchemes.filter((s) => s.status === "draft").length
  const submittedCount = initialSchemes.filter((s) => s.status === "submitted").length
  const approvedCount = initialSchemes.filter((s) => s.status === "approved").length

  const handleCreate = async () => {
    if (!formData.title.trim() || !formData.subject_id || !formData.class_id || !formData.term_id) {
      toast({ title: "Missing fields", description: "Please fill in all required fields.", variant: "destructive" })
      return
    }

    setIsLoading(true)
    const result = await createScheme({
      title: formData.title,
      subject_id: formData.subject_id,
      class_id: formData.class_id,
      term_id: formData.term_id,
      teacher_id: formData.teacher_id || undefined,
      description: formData.description || undefined,
    })
    setIsLoading(false)

    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    toast({ title: "Success", description: "Scheme of work created." })
    setIsDialogOpen(false)
    resetForm()
    router.refresh()
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this scheme?")) return

    const result = await deleteScheme(id)
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    toast({ title: "Deleted", description: "Scheme removed." })
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Schemes of Work</h1>
          <p className="text-muted-foreground">
            Manage term-based teaching plans and weekly breakdowns
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="mr-2 h-4 w-4" />
              New Scheme
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>New Scheme of Work</DialogTitle>
              <DialogDescription>Create a new scheme for a subject, class, and term.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., Mathematics Term 1 Scheme"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Subject *</Label>
                  <Select value={formData.subject_id} onValueChange={(v) => setFormData({ ...formData, subject_id: v })}>
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
                  <Select value={formData.class_id} onValueChange={(v) => setFormData({ ...formData, class_id: v })}>
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
                  <Label>Term *</Label>
                  <Select value={formData.term_id} onValueChange={(v) => setFormData({ ...formData, term_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select term" /></SelectTrigger>
                    <SelectContent>
                      {terms.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Teacher</Label>
                  <Select value={formData.teacher_id} onValueChange={(v) => setFormData({ ...formData, teacher_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select teacher" /></SelectTrigger>
                    <SelectContent>
                      {teachers.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.first_name} {t.last_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of the scheme..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={isLoading || !formData.title.trim()}>
                {isLoading ? "Creating..." : "Create Scheme"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Schemes</CardDescription>
            <CardTitle className="text-3xl">{initialSchemes.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-xs text-muted-foreground">
              <FileText className="mr-1 h-3.5 w-3.5" />
              All schemes
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Draft</CardDescription>
            <CardTitle className="text-3xl">{draftCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-xs text-muted-foreground">
              <Clock className="mr-1 h-3.5 w-3.5" />
              In progress
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Submitted</CardDescription>
            <CardTitle className="text-3xl">{submittedCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-xs text-muted-foreground">
              <BookOpen className="mr-1 h-3.5 w-3.5" />
              Pending review
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Approved</CardDescription>
            <CardTitle className="text-3xl">{approvedCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-xs text-muted-foreground">
              <CheckCircle className="mr-1 h-3.5 w-3.5" />
              Ready to use
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Schemes Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Schemes</CardTitle>
          <CardDescription>{initialSchemes.length} schemes of work</CardDescription>
        </CardHeader>
        <CardContent>
          {initialSchemes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>No schemes yet. Create your first scheme of work to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Teacher</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialSchemes.map((scheme) => (
                  <TableRow key={scheme.id}>
                    <TableCell className="font-medium">{scheme.title}</TableCell>
                    <TableCell>{scheme.subjects?.name || "-"}</TableCell>
                    <TableCell>{scheme.classes?.name || "-"}</TableCell>
                    <TableCell>{scheme.terms?.name || "-"}</TableCell>
                    <TableCell>
                      {scheme.employees
                        ? `${scheme.employees.first_name} ${scheme.employees.last_name}`
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={scheme.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/dashboard/admin/academic/schemes/${scheme.id}`}>
                          <Button variant="ghost" size="icon">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(scheme.id)}>
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
    </div>
  )
}
