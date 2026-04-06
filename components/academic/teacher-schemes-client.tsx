"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
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
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import {
  Plus, ArrowRight, BookOpen, Trash2,
} from "lucide-react"
import { createTeacherScheme, deleteTeacherScheme, getTeacherSchemesStats } from "@/lib/actions/teacher-schemes"

interface Subject {
  id: string
  name: string
}

interface Class {
  id: string
  name: string
}

interface Term {
  id: string
  name: string
}

interface SchemeEntry {
  id: string
}

interface Scheme {
  id: string
  title: string
  description: string | null
  status: string
  subjects: { name: string } | null
  classes: { name: string } | null
  terms: { name: string } | null
  employees: { first_name: string; last_name: string } | null
  scheme_entries: SchemeEntry[]
}

interface TeacherSchemesClientProps {
  initialSchemes: Scheme[]
  subjects: Subject[]
  classes: Class[]
  terms: Term[]
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  revision_needed: "bg-amber-100 text-amber-700",
}

function StatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  return (
    <Badge className={STATUS_COLORS[status] || STATUS_COLORS.draft}>
      {label}
    </Badge>
  )
}

export function TeacherSchemesClient({
  initialSchemes,
  subjects,
  classes,
  terms,
}: TeacherSchemesClientProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [schemes, setSchemes] = useState<Scheme[]>(initialSchemes)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [stats, setStats] = useState({ total: 0, draft: 0, submitted: 0, approved: 0 })

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    subject_id: "",
    class_id: "",
    term_id: "",
  })

  const [filters, setFilters] = useState({
    subject_id: "",
    class_id: "",
    term_id: "",
    status: "",
  })

  // Calculate stats on mount/change
  useMemo(() => {
    const total = schemes.length
    const draft = schemes.filter((s) => s.status === "draft").length
    const submitted = schemes.filter((s) => s.status === "submitted").length
    const approved = schemes.filter((s) => s.status === "approved").length
    setStats({ total, draft, submitted, approved })
  }, [schemes])

  const filteredSchemes = useMemo(() => {
    return schemes.filter((scheme) => {
      if (filters.subject_id && scheme.subjects?.name !== subjects.find((s) => s.id === filters.subject_id)?.name) return false
      if (filters.class_id && scheme.classes?.name !== classes.find((c) => c.id === filters.class_id)?.name) return false
      if (filters.term_id && scheme.terms?.name !== terms.find((t) => t.id === filters.term_id)?.name) return false
      if (filters.status && scheme.status !== filters.status) return false
      return true
    })
  }, [schemes, filters, subjects, classes, terms])

  const handleCreateScheme = async () => {
    if (!formData.title || !formData.subject_id || !formData.class_id || !formData.term_id) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    const result = await createTeacherScheme({
      title: formData.title,
      description: formData.description || undefined,
      subject_id: formData.subject_id,
      class_id: formData.class_id,
      term_id: formData.term_id,
    })
    setIsLoading(false)

    if (result.error) {
      toast({
        title: "Error",
        description: result.error,
        variant: "destructive",
      })
      return
    }

    toast({
      title: "Success",
      description: "Scheme of work created successfully",
    })

    setFormData({ title: "", description: "", subject_id: "", class_id: "", term_id: "" })
    setIsCreateOpen(false)
    router.refresh()
  }

  const handleDeleteScheme = async (schemeId: string) => {
    if (!confirm("Are you sure you want to delete this scheme?")) return

    setIsLoading(true)
    const result = await deleteTeacherScheme(schemeId)
    setIsLoading(false)

    if (result.error) {
      toast({
        title: "Error",
        description: result.error,
        variant: "destructive",
      })
      return
    }

    toast({
      title: "Success",
      description: "Scheme deleted successfully",
    })

    setSchemes(schemes.filter((s) => s.id !== schemeId))
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Schemes of Work</h1>
          <p className="text-muted-foreground mt-2">
            Create and manage your teaching schemes for the term
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Create New Scheme
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Scheme of Work</DialogTitle>
              <DialogDescription>
                Fill in the details to create a new scheme of work for your class
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="subject">Subject *</Label>
                  <Select value={formData.subject_id} onValueChange={(value) => setFormData({ ...formData, subject_id: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select subject" />
                    </SelectTrigger>
                    <SelectContent>
                      {subjects.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="class">Class *</Label>
                  <Select value={formData.class_id} onValueChange={(value) => setFormData({ ...formData, class_id: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent>
                      {classes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="term">Term *</Label>
                <Select value={formData.term_id} onValueChange={(value) => setFormData({ ...formData, term_id: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select term" />
                  </SelectTrigger>
                  <SelectContent>
                    {terms.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g., Biology Form 2 - Term 1"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Add any notes or description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateScheme} disabled={isLoading}>
                {isLoading ? "Creating..." : "Create Scheme"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Schemes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Draft</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">{stats.draft}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Submitted</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.submitted}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Approved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-3">
            <Select value={filters.subject_id} onValueChange={(value) => setFilters({ ...filters, subject_id: value })}>
              <SelectTrigger>
                <SelectValue placeholder="All Subjects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Subjects</SelectItem>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.class_id} onValueChange={(value) => setFilters({ ...filters, class_id: value })}>
              <SelectTrigger>
                <SelectValue placeholder="All Classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Classes</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.term_id} onValueChange={(value) => setFilters({ ...filters, term_id: value })}>
              <SelectTrigger>
                <SelectValue placeholder="All Terms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Terms</SelectItem>
                {terms.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.status} onValueChange={(value) => setFilters({ ...filters, status: value })}>
              <SelectTrigger>
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="revision_needed">Revision Needed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Schemes Table */}
      <Card>
        <CardHeader>
          <CardTitle>Your Schemes</CardTitle>
          <CardDescription>
            {filteredSchemes.length} scheme{filteredSchemes.length !== 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Term</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Entries</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSchemes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    <BookOpen className="w-12 h-12 mx-auto mb-2 opacity-20" />
                    No schemes found. Create one to get started!
                  </TableCell>
                </TableRow>
              ) : (
                filteredSchemes.map((scheme) => (
                  <TableRow key={scheme.id}>
                    <TableCell className="font-medium">{scheme.subjects?.name || "-"}</TableCell>
                    <TableCell>{scheme.classes?.name || "-"}</TableCell>
                    <TableCell>{scheme.terms?.name || "-"}</TableCell>
                    <TableCell>
                      <StatusBadge status={scheme.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-sm text-muted-foreground">{scheme.scheme_entries?.length || 0}</span>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Link href={`/dashboard/teacher/schemes/${scheme.id}`}>
                        <Button variant="outline" size="sm" className="gap-1">
                          <ArrowRight className="w-3 h-3" />
                          View
                        </Button>
                      </Link>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteScheme(scheme.id)}
                        disabled={isLoading}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
