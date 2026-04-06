"use client"

import { useState } from "react"
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  ArrowLeft, Plus, Pencil, Trash2, Send, CheckCircle,
} from "lucide-react"
import {
  updateTeacherScheme, submitTeacherScheme,
} from "@/lib/actions/teacher-schemes"
import {
  addSchemeEntry, updateSchemeEntry, deleteSchemeEntry,
} from "@/lib/actions/schemes-of-work"
import { useToast } from "@/hooks/use-toast"

interface SchemeEntry {
  id: string
  week_number: number
  topic: string
  subtopic: string | null
  objectives: string | null
  teaching_activities: string | null
  learning_resources: string | null
  assessment: string | null
  remarks: string | null
}

interface SchemeData {
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

interface TeacherSchemeDetailClientProps {
  scheme: SchemeData
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
    <Badge className={STATUS_COLORS[status] || STATUS_COLORS.draft}>
      {label}
    </Badge>
  )
}

const emptyEntry = {
  week_number: 1,
  topic: "",
  subtopic: "",
  objectives: "",
  teaching_activities: "",
  learning_resources: "",
  assessment: "",
  remarks: "",
}

export function TeacherSchemeDetailClient({ scheme }: TeacherSchemeDetailClientProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<SchemeEntry | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [entryForm, setEntryForm] = useState(emptyEntry)

  const resetEntryForm = () => {
    const nextWeek = scheme.scheme_entries.length > 0
      ? Math.max(...scheme.scheme_entries.map((e) => e.week_number)) + 1
      : 1
    setEntryForm({ ...emptyEntry, week_number: nextWeek })
  }

  const handleSubmitScheme = async () => {
    if (scheme.scheme_entries.length === 0) {
      toast({
        title: "Error",
        description: "Add at least one weekly entry before submitting",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    const result = await submitTeacherScheme(scheme.id)
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
      description: "Scheme submitted for approval",
    })

    router.refresh()
  }

  const handleAddEntry = async () => {
    if (!entryForm.topic) {
      toast({
        title: "Error",
        description: "Topic is required",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    const result = await addSchemeEntry(scheme.id, entryForm)
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
      description: "Entry added successfully",
    })

    setIsAddOpen(false)
    resetEntryForm()
    router.refresh()
  }

  const handleUpdateEntry = async () => {
    if (!editingEntry || !entryForm.topic) {
      toast({
        title: "Error",
        description: "Topic is required",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    const result = await updateSchemeEntry(editingEntry.id, entryForm)
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
      description: "Entry updated successfully",
    })

    setEditingEntry(null)
    resetEntryForm()
    router.refresh()
  }

  const handleDeleteEntry = async (entryId: string) => {
    if (!confirm("Are you sure you want to delete this entry?")) return

    setIsLoading(true)
    const result = await deleteSchemeEntry(entryId)
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
      description: "Entry deleted successfully",
    })

    router.refresh()
  }

  const handleEditEntry = (entry: SchemeEntry) => {
    setEditingEntry(entry)
    setEntryForm(entry)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/dashboard/teacher/schemes">
            <Button variant="ghost" className="gap-2 -ml-3 mb-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Schemes
            </Button>
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">{scheme.title}</h1>
          <p className="text-muted-foreground mt-2">
            {scheme.subjects?.name} • {scheme.classes?.name} • {scheme.terms?.name}
          </p>
        </div>
        {scheme.status === "draft" && (
          <Button
            onClick={handleSubmitScheme}
            disabled={isLoading || scheme.scheme_entries.length === 0}
            className="gap-2"
          >
            <Send className="w-4 h-4" />
            Submit for Approval
          </Button>
        )}
        {scheme.status === "approved" && (
          <Badge className="bg-green-100 text-green-700 gap-2">
            <CheckCircle className="w-3 h-3" />
            Approved
          </Badge>
        )}
      </div>

      {/* Scheme Info */}
      <Card>
        <CardHeader>
          <CardTitle>Scheme Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Subject</p>
              <p className="font-medium">{scheme.subjects?.name || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Class</p>
              <p className="font-medium">{scheme.classes?.name || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Status</p>
              <StatusBadge status={scheme.status} />
            </div>
          </div>
          {scheme.description && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground mb-1">Description</p>
              <p className="text-sm">{scheme.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Weekly Breakdown */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Weekly Breakdown</CardTitle>
            <CardDescription>
              {scheme.scheme_entries.length} week{scheme.scheme_entries.length !== 1 ? "s" : ""} planned
            </CardDescription>
          </div>
          {scheme.status === "draft" && (
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    resetEntryForm()
                    setEditingEntry(null)
                  }}
                >
                  <Plus className="w-4 h-4" />
                  Add Entry
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>
                    {editingEntry ? "Edit" : "Add"} Weekly Entry
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="week">Week Number</Label>
                      <Input
                        id="week"
                        type="number"
                        min="1"
                        value={entryForm.week_number}
                        onChange={(e) => setEntryForm({ ...entryForm, week_number: parseInt(e.target.value) || 1 })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="topic">Topic *</Label>
                      <Input
                        id="topic"
                        placeholder="e.g., Cell Structure"
                        value={entryForm.topic}
                        onChange={(e) => setEntryForm({ ...entryForm, topic: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="subtopic">Sub-topic</Label>
                    <Input
                      id="subtopic"
                      placeholder="e.g., Plant vs Animal Cells"
                      value={entryForm.subtopic || ""}
                      onChange={(e) => setEntryForm({ ...entryForm, subtopic: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="objectives">Learning Objectives</Label>
                    <Textarea
                      id="objectives"
                      placeholder="List the learning objectives for this week"
                      value={entryForm.objectives || ""}
                      onChange={(e) => setEntryForm({ ...entryForm, objectives: e.target.value })}
                      rows={2}
                    />
                  </div>
                  <div>
                    <Label htmlFor="activities">Teaching Activities</Label>
                    <Textarea
                      id="activities"
                      placeholder="Describe the teaching activities and methods"
                      value={entryForm.teaching_activities || ""}
                      onChange={(e) => setEntryForm({ ...entryForm, teaching_activities: e.target.value })}
                      rows={2}
                    />
                  </div>
                  <div>
                    <Label htmlFor="resources">Learning Resources</Label>
                    <Textarea
                      id="resources"
                      placeholder="List the resources needed (textbooks, materials, equipment, etc.)"
                      value={entryForm.learning_resources || ""}
                      onChange={(e) => setEntryForm({ ...entryForm, learning_resources: e.target.value })}
                      rows={2}
                    />
                  </div>
                  <div>
                    <Label htmlFor="assessment">Assessment Methods</Label>
                    <Textarea
                      id="assessment"
                      placeholder="Describe assessment methods and techniques"
                      value={entryForm.assessment || ""}
                      onChange={(e) => setEntryForm({ ...entryForm, assessment: e.target.value })}
                      rows={2}
                    />
                  </div>
                  <div>
                    <Label htmlFor="remarks">Remarks</Label>
                    <Textarea
                      id="remarks"
                      placeholder="Any additional remarks or notes"
                      value={entryForm.remarks || ""}
                      onChange={(e) => setEntryForm({ ...entryForm, remarks: e.target.value })}
                      rows={2}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setIsAddOpen(false); setEditingEntry(null) }}>
                    Cancel
                  </Button>
                  <Button
                    onClick={editingEntry ? handleUpdateEntry : handleAddEntry}
                    disabled={isLoading}
                  >
                    {isLoading ? "Saving..." : editingEntry ? "Update Entry" : "Add Entry"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Week</TableHead>
                <TableHead>Topic/Theme</TableHead>
                <TableHead>Sub-topic</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scheme.scheme_entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No entries yet. Add your first weekly entry to get started!
                  </TableCell>
                </TableRow>
              ) : (
                scheme.scheme_entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">Week {entry.week_number}</TableCell>
                    <TableCell className="font-medium">{entry.topic}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{entry.subtopic || "-"}</TableCell>
                    <TableCell className="text-right space-x-2">
                      {scheme.status === "draft" && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              handleEditEntry(entry)
                              setIsAddOpen(true)
                            }}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteEntry(entry.id)}
                            disabled={isLoading}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </>
                      )}
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            View Details
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Week {entry.week_number}: {entry.topic}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 max-h-96 overflow-y-auto">
                            {entry.subtopic && (
                              <div>
                                <p className="text-sm text-muted-foreground mb-1">Sub-topic</p>
                                <p className="text-sm">{entry.subtopic}</p>
                              </div>
                            )}
                            {entry.objectives && (
                              <div>
                                <p className="text-sm text-muted-foreground mb-1">Learning Objectives</p>
                                <p className="text-sm whitespace-pre-wrap">{entry.objectives}</p>
                              </div>
                            )}
                            {entry.teaching_activities && (
                              <div>
                                <p className="text-sm text-muted-foreground mb-1">Teaching Activities</p>
                                <p className="text-sm whitespace-pre-wrap">{entry.teaching_activities}</p>
                              </div>
                            )}
                            {entry.learning_resources && (
                              <div>
                                <p className="text-sm text-muted-foreground mb-1">Learning Resources</p>
                                <p className="text-sm whitespace-pre-wrap">{entry.learning_resources}</p>
                              </div>
                            )}
                            {entry.assessment && (
                              <div>
                                <p className="text-sm text-muted-foreground mb-1">Assessment Methods</p>
                                <p className="text-sm whitespace-pre-wrap">{entry.assessment}</p>
                              </div>
                            )}
                            {entry.remarks && (
                              <div>
                                <p className="text-sm text-muted-foreground mb-1">Remarks</p>
                                <p className="text-sm whitespace-pre-wrap">{entry.remarks}</p>
                              </div>
                            )}
                          </div>
                        </DialogContent>
                      </Dialog>
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
