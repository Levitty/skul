"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  Plus, Pencil, Trash2, AlertTriangle, CheckCircle, Shield,
  Star, Users, FileWarning, Tag, Search
} from "lucide-react"
import {
  createIncident, updateIncident,
  createCategory, updateCategory, deleteCategory,
  awardMeritPoints, getMeritPoints,
} from "@/lib/actions/discipline"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"

// ── Types ──

interface StudentData {
  id: string
  first_name: string
  last_name: string
  admission_number: string
}

interface CategoryData {
  id: string
  name: string
  severity: string
  default_action: string | null
  points: number | null
}

interface IncidentData {
  id: string
  student_id: string
  category_id: string | null
  incident_date: string
  description: string
  location: string | null
  witnesses: string | null
  severity: string
  action_taken: string | null
  punishment: string | null
  status: string
  reported_by: string | null
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
  students?: { first_name: string; last_name: string; admission_number: string } | null
  discipline_categories?: { name: string; severity: string } | null
}

interface MeritData {
  id: string
  student_id: string
  points: number
  reason: string
  awarded_by: string | null
  created_at: string
  students?: { id: string; first_name: string; last_name: string; admission_number: string } | null
}

interface DisciplineClientProps {
  initialIncidents: IncidentData[]
  initialCategories: CategoryData[]
  students: StudentData[]
}

const SEVERITY_OPTIONS = ["minor", "moderate", "major", "critical"] as const

const emptyIncidentForm = {
  student_id: "",
  category_id: "",
  incident_date: new Date().toISOString().split("T")[0],
  description: "",
  location: "",
  witnesses: "",
  severity: "minor",
  action_taken: "",
}

const emptyCategoryForm = {
  name: "",
  severity: "minor",
  default_action: "",
  points: "0",
}

const emptyMeritForm = {
  student_id: "",
  points: "1",
  reason: "",
}

export function DisciplineClient({ initialIncidents, initialCategories, students }: DisciplineClientProps) {
  const router = useRouter()
  const { toast } = useToast()

  const [activeTab, setActiveTab] = useState<"incidents" | "merit" | "categories">("incidents")
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  // Incident state
  const [isIncidentOpen, setIsIncidentOpen] = useState(false)
  const [incidentForm, setIncidentForm] = useState(emptyIncidentForm)

  // Category state
  const [isCategoryOpen, setIsCategoryOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<CategoryData | null>(null)
  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm)

  // Merit state
  const [isMeritOpen, setIsMeritOpen] = useState(false)
  const [meritForm, setMeritForm] = useState(emptyMeritForm)
  const [meritRecords, setMeritRecords] = useState<MeritData[]>([])
  const [meritLoaded, setMeritLoaded] = useState(false)

  // ── Stats ──

  const openIncidents = initialIncidents.filter((i) => i.status === "open").length
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]
  const resolvedThisMonth = initialIncidents.filter(
    (i) => i.status === "resolved" && i.resolved_at && i.resolved_at >= monthStart
  ).length

  // ── Incidents ──

  const filteredIncidents = initialIncidents.filter((i) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    const name = `${i.students?.first_name} ${i.students?.last_name}`.toLowerCase()
    return (
      name.includes(q) ||
      i.description.toLowerCase().includes(q) ||
      i.discipline_categories?.name.toLowerCase().includes(q)
    )
  })

  const handleCreateIncident = async () => {
    if (!incidentForm.student_id || !incidentForm.description.trim()) {
      toast({ title: "Missing fields", description: "Student and description are required", variant: "destructive" })
      return
    }

    setIsLoading(true)
    const result = await createIncident({
      student_id: incidentForm.student_id,
      category_id: incidentForm.category_id || undefined,
      incident_date: incidentForm.incident_date,
      description: incidentForm.description,
      location: incidentForm.location || undefined,
      witnesses: incidentForm.witnesses || undefined,
      severity: incidentForm.severity,
      action_taken: incidentForm.action_taken || undefined,
    })
    setIsLoading(false)

    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    toast({ title: "Incident reported successfully" })
    setIsIncidentOpen(false)
    setIncidentForm(emptyIncidentForm)
    router.refresh()
  }

  const handleResolveIncident = async (id: string) => {
    setIsLoading(true)
    const result = await updateIncident(id, { status: "resolved" })
    setIsLoading(false)

    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    toast({ title: "Incident resolved" })
    router.refresh()
  }

  // ── Categories ──

  const resetCategoryForm = () => setCategoryForm(emptyCategoryForm)

  const openEditCategory = (cat: CategoryData) => {
    setEditingCategory(cat)
    setCategoryForm({
      name: cat.name,
      severity: cat.severity,
      default_action: cat.default_action || "",
      points: String(cat.points || 0),
    })
  }

  const handleSaveCategory = async () => {
    if (!categoryForm.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" })
      return
    }

    setIsLoading(true)
    const payload = {
      name: categoryForm.name,
      severity: categoryForm.severity,
      default_action: categoryForm.default_action || undefined,
      points: parseInt(categoryForm.points) || 0,
    }

    const result = editingCategory
      ? await updateCategory(editingCategory.id, payload)
      : await createCategory(payload)

    setIsLoading(false)

    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    toast({ title: editingCategory ? "Category updated" : "Category created" })
    setIsCategoryOpen(false)
    setEditingCategory(null)
    resetCategoryForm()
    router.refresh()
  }

  const handleDeleteCategory = async (id: string) => {
    if (!confirm("Delete this category? This cannot be undone.")) return

    const result = await deleteCategory(id)
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }
    toast({ title: "Category deleted" })
    router.refresh()
  }

  // ── Merit Points ──

  const loadMeritPoints = async () => {
    if (meritLoaded) return
    const result = await getMeritPoints()
    if (result.data) {
      setMeritRecords(result.data as MeritData[])
    }
    setMeritLoaded(true)
  }

  const handleAwardMerit = async () => {
    if (!meritForm.student_id || !meritForm.reason.trim()) {
      toast({ title: "Missing fields", description: "Student and reason are required", variant: "destructive" })
      return
    }

    setIsLoading(true)
    const result = await awardMeritPoints({
      student_id: meritForm.student_id,
      points: parseInt(meritForm.points) || 1,
      reason: meritForm.reason,
    })
    setIsLoading(false)

    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    toast({ title: "Merit points awarded" })
    setIsMeritOpen(false)
    setMeritForm(emptyMeritForm)
    setMeritLoaded(false)
    loadMeritPoints()
    router.refresh()
  }

  // ── Badges ──

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "minor":
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">Minor</Badge>
      case "moderate":
        return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">Moderate</Badge>
      case "major":
        return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">Major</Badge>
      case "critical":
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">Critical</Badge>
      default:
        return <Badge variant="outline">{severity}</Badge>
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">Open</Badge>
      case "investigating":
        return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">Investigating</Badge>
      case "resolved":
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">Resolved</Badge>
      case "escalated":
        return <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">Escalated</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  // ── Tabs ──

  const tabs = [
    { key: "incidents" as const, label: "Incidents", icon: FileWarning },
    { key: "merit" as const, label: "Merit Points", icon: Star },
    { key: "categories" as const, label: "Categories", icon: Tag },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-neutral-900 mb-2">
            Discipline Management
          </h1>
          <p className="text-lg text-neutral-500">
            Track incidents, manage categories, and award merit points
          </p>
        </div>
      </div>

      {/* Stats Banner */}
      <Card className="border-0 shadow-sm bg-rose-600 text-white">
        <CardContent className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="text-center">
              <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold">{openIncidents}</p>
              <p className="text-white/70 text-sm">Open Incidents</p>
            </div>
            <div className="text-center">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold">{resolvedThisMonth}</p>
              <p className="text-white/70 text-sm">Resolved This Month</p>
            </div>
            <div className="text-center">
              <Shield className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold">{initialIncidents.length}</p>
              <p className="text-white/70 text-sm">Total Incidents</p>
            </div>
            <div className="text-center">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold">{initialCategories.length}</p>
              <p className="text-white/70 text-sm">Categories</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key)
              if (tab.key === "merit") loadMeritPoints()
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-neutral-900 text-white shadow-sm"
                : "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.key === "incidents" && openIncidents > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                {openIncidents}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {/* ════════════════ INCIDENTS TAB ════════════════ */}
      {activeTab === "incidents" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
              <Input
                placeholder="Search by student, description, or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button onClick={() => { setIncidentForm(emptyIncidentForm); setIsIncidentOpen(true) }}>
              <Plus className="mr-2 h-4 w-4" />
              Report Incident
            </Button>
          </div>

          {filteredIncidents.length === 0 ? (
            <Card className="border-0 shadow-xl">
              <CardContent className="py-12 text-center text-neutral-500">
                <Shield className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>{searchQuery ? "No incidents match your search." : "No incidents recorded yet."}</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-0 shadow-xl">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredIncidents.map((incident) => (
                      <TableRow key={incident.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {new Date(incident.incident_date).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">
                              {incident.students?.first_name} {incident.students?.last_name}
                            </div>
                            <div className="text-xs text-neutral-500">
                              {incident.students?.admission_number}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {incident.discipline_categories?.name || "—"}
                        </TableCell>
                        <TableCell>{getSeverityBadge(incident.severity)}</TableCell>
                        <TableCell className="max-w-[200px]">
                          <p className="text-sm truncate">{incident.description}</p>
                        </TableCell>
                        <TableCell>{getStatusBadge(incident.status)}</TableCell>
                        <TableCell className="text-right">
                          {incident.status === "open" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-600 border-green-600 hover:bg-green-50 dark:hover:bg-green-950/30"
                              onClick={() => handleResolveIncident(incident.id)}
                              disabled={isLoading}
                            >
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Resolve
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ════════════════ MERIT POINTS TAB ════════════════ */}
      {activeTab === "merit" && (
        <div className="space-y-4">
          <div className="flex items-center justify-end">
            <Button onClick={() => { setMeritForm(emptyMeritForm); setIsMeritOpen(true) }}>
              <Plus className="mr-2 h-4 w-4" />
              Award Points
            </Button>
          </div>

          <Card className="border-0 shadow-xl">
            <CardHeader>
              <CardTitle>Merit Points Records</CardTitle>
              <CardDescription>Points awarded to students for positive behavior</CardDescription>
            </CardHeader>
            <CardContent>
              {meritRecords.length === 0 ? (
                <div className="py-12 text-center text-neutral-500">
                  <Star className="mx-auto h-12 w-12 mb-4 opacity-50" />
                  <p>No merit points awarded yet.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>Points</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {meritRecords.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {new Date(record.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">
                              {record.students?.first_name} {record.students?.last_name}
                            </div>
                            <div className="text-xs text-neutral-500">
                              {record.students?.admission_number}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                            +{record.points}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[300px]">
                          <p className="text-sm truncate">{record.reason}</p>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ════════════════ CATEGORIES TAB ════════════════ */}
      {activeTab === "categories" && (
        <div className="space-y-4">
          <div className="flex items-center justify-end">
            <Button onClick={() => { resetCategoryForm(); setEditingCategory(null); setIsCategoryOpen(true) }}>
              <Plus className="mr-2 h-4 w-4" />
              Add Category
            </Button>
          </div>

          {initialCategories.length === 0 ? (
            <Card className="border-0 shadow-xl">
              <CardContent className="py-12 text-center text-neutral-500">
                <Tag className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>No categories yet. Add your first discipline category.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {initialCategories.map((cat) => (
                <Card key={cat.id} className="border-0 shadow-xl hover:shadow-2xl transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base">{cat.name}</CardTitle>
                      {getSeverityBadge(cat.severity)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {cat.default_action && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Default Action:</span>{" "}
                          <span className="font-medium">{cat.default_action}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-neutral-500">Points:</span>{" "}
                        <span className="font-medium">{cat.points ?? 0}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { openEditCategory(cat); setIsCategoryOpen(true) }}
                      >
                        <Pencil className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteCategory(cat.id)}
                        className="ml-auto text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════ REPORT INCIDENT DIALOG ════════════════ */}
      <Dialog open={isIncidentOpen} onOpenChange={setIsIncidentOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Report Incident</DialogTitle>
            <DialogDescription>Record a new discipline incident</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Student *</Label>
                <Select
                  value={incidentForm.student_id}
                  onValueChange={(v) => setIncidentForm({ ...incidentForm, student_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                  <SelectContent>
                    {students.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.first_name} {s.last_name} ({s.admission_number})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={incidentForm.category_id}
                  onValueChange={(v) => setIncidentForm({ ...incidentForm, category_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {initialCategories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={incidentForm.incident_date}
                  onChange={(e) => setIncidentForm({ ...incidentForm, incident_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Severity</Label>
                <Select
                  value={incidentForm.severity}
                  onValueChange={(v) => setIncidentForm({ ...incidentForm, severity: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SEVERITY_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description *</Label>
              <Textarea
                value={incidentForm.description}
                onChange={(e) => setIncidentForm({ ...incidentForm, description: e.target.value })}
                placeholder="Describe the incident in detail..."
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Location</Label>
                <Input
                  value={incidentForm.location}
                  onChange={(e) => setIncidentForm({ ...incidentForm, location: e.target.value })}
                  placeholder="e.g. Classroom 3B, Playground"
                />
              </div>
              <div className="space-y-2">
                <Label>Witnesses</Label>
                <Input
                  value={incidentForm.witnesses}
                  onChange={(e) => setIncidentForm({ ...incidentForm, witnesses: e.target.value })}
                  placeholder="Names of witnesses"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Action Taken</Label>
              <Textarea
                value={incidentForm.action_taken}
                onChange={(e) => setIncidentForm({ ...incidentForm, action_taken: e.target.value })}
                placeholder="What action was taken?"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsIncidentOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreateIncident}
              disabled={isLoading || !incidentForm.student_id || !incidentForm.description.trim()}
            >
              {isLoading ? "Saving..." : "Report Incident"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════ ADD / EDIT CATEGORY DIALOG ════════════════ */}
      <Dialog
        open={isCategoryOpen || !!editingCategory}
        onOpenChange={(open) => {
          if (!open) {
            setIsCategoryOpen(false)
            setEditingCategory(null)
            resetCategoryForm()
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Edit Category" : "Add Category"}</DialogTitle>
            <DialogDescription>
              {editingCategory ? "Update discipline category" : "Create a new discipline category"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={categoryForm.name}
                onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                placeholder="e.g. Bullying, Late Arrival"
              />
            </div>
            <div className="space-y-2">
              <Label>Severity</Label>
              <Select
                value={categoryForm.severity}
                onValueChange={(v) => setCategoryForm({ ...categoryForm, severity: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SEVERITY_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Default Action</Label>
              <Input
                value={categoryForm.default_action}
                onChange={(e) => setCategoryForm({ ...categoryForm, default_action: e.target.value })}
                placeholder="e.g. Warning, Detention, Suspension"
              />
            </div>
            <div className="space-y-2">
              <Label>Points Deducted</Label>
              <Input
                type="number"
                min="0"
                value={categoryForm.points}
                onChange={(e) => setCategoryForm({ ...categoryForm, points: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setIsCategoryOpen(false); setEditingCategory(null); resetCategoryForm() }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveCategory}
              disabled={isLoading || !categoryForm.name.trim()}
            >
              {isLoading ? "Saving..." : editingCategory ? "Save Changes" : "Add Category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════ AWARD MERIT POINTS DIALOG ════════════════ */}
      <Dialog open={isMeritOpen} onOpenChange={setIsMeritOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Award Merit Points</DialogTitle>
            <DialogDescription>Reward a student for positive behavior</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Student *</Label>
              <Select
                value={meritForm.student_id}
                onValueChange={(v) => setMeritForm({ ...meritForm, student_id: v })}
              >
                <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.first_name} {s.last_name} ({s.admission_number})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Points *</Label>
              <Input
                type="number"
                min="1"
                value={meritForm.points}
                onChange={(e) => setMeritForm({ ...meritForm, points: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Reason *</Label>
              <Textarea
                value={meritForm.reason}
                onChange={(e) => setMeritForm({ ...meritForm, reason: e.target.value })}
                placeholder="Why is this student being awarded points?"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMeritOpen(false)}>Cancel</Button>
            <Button
              onClick={handleAwardMerit}
              disabled={isLoading || !meritForm.student_id || !meritForm.reason.trim()}
            >
              {isLoading ? "Awarding..." : "Award Points"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
