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
import { Badge } from "@/components/ui/badge"
import {
  ArrowLeft, Plus, Pencil, Trash2, Send, CheckCircle, RotateCcw,
} from "lucide-react"
import {
  updateScheme, addSchemeEntry, updateSchemeEntry, deleteSchemeEntry,
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

interface SchemeDetailClientProps {
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
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status] || STATUS_COLORS.draft}`}>
      {label}
    </span>
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

export function SchemeDetailClient({ scheme }: SchemeDetailClientProps) {
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

  const handleStatusChange = async (newStatus: string) => {
    setIsLoading(true)
    const result = await updateScheme(scheme.id, { status: newStatus })
    setIsLoading(false)

    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    toast({ title: "Status Updated", description: `Scheme marked as ${newStatus.replace(/_/g, " ")}.` })
    router.refresh()
  }

  const handleAddEntry = async () => {
    if (!entryForm.topic.trim()) {
      toast({ title: "Missing field", description: "Topic is required.", variant: "destructive" })
      return
    }

    setIsLoading(true)
    const result = await addSchemeEntry(scheme.id, {
      week_number: entryForm.week_number,
      topic: entryForm.topic,
      subtopic: entryForm.subtopic || undefined,
      objectives: entryForm.objectives || undefined,
      teaching_activities: entryForm.teaching_activities || undefined,
      learning_resources: entryForm.learning_resources || undefined,
      assessment: entryForm.assessment || undefined,
      remarks: entryForm.remarks || undefined,
    })
    setIsLoading(false)

    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    toast({ title: "Entry Added", description: `Week ${entryForm.week_number} added.` })
    setIsAddOpen(false)
    resetEntryForm()
    router.refresh()
  }

  const handleUpdateEntry = async () => {
    if (!editingEntry || !entryForm.topic.trim()) return

    setIsLoading(true)
    const result = await updateSchemeEntry(editingEntry.id, {
      week_number: entryForm.week_number,
      topic: entryForm.topic,
      subtopic: entryForm.subtopic || undefined,
      objectives: entryForm.objectives || undefined,
      teaching_activities: entryForm.teaching_activities || undefined,
      learning_resources: entryForm.learning_resources || undefined,
      assessment: entryForm.assessment || undefined,
      remarks: entryForm.remarks || undefined,
    })
    setIsLoading(false)

    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    toast({ title: "Entry Updated", description: "Week entry updated." })
    setEditingEntry(null)
    router.refresh()
  }

  const handleDeleteEntry = async (entryId: string) => {
    if (!confirm("Delete this weekly entry?")) return

    const result = await deleteSchemeEntry(entryId)
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    toast({ title: "Deleted", description: "Entry removed." })
    router.refresh()
  }

  const openEditEntry = (entry: SchemeEntry) => {
    setEditingEntry(entry)
    setEntryForm({
      week_number: entry.week_number,
      topic: entry.topic,
      subtopic: entry.subtopic || "",
      objectives: entry.objectives || "",
      teaching_activities: entry.teaching_activities || "",
      learning_resources: entry.learning_resources || "",
      assessment: entry.assessment || "",
      remarks: entry.remarks || "",
    })
  }

  const EntryFormFields = () => (
    <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="week_number">Week Number *</Label>
          <Input
            id="week_number"
            type="number"
            min={1}
            value={entryForm.week_number}
            onChange={(e) => setEntryForm({ ...entryForm, week_number: parseInt(e.target.value) || 1 })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="topic">Topic *</Label>
          <Input
            id="topic"
            value={entryForm.topic}
            onChange={(e) => setEntryForm({ ...entryForm, topic: e.target.value })}
            placeholder="Main topic"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="subtopic">Subtopic</Label>
        <Input
          id="subtopic"
          value={entryForm.subtopic}
          onChange={(e) => setEntryForm({ ...entryForm, subtopic: e.target.value })}
          placeholder="Sub-topic"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="objectives">Objectives</Label>
        <Textarea
          id="objectives"
          value={entryForm.objectives}
          onChange={(e) => setEntryForm({ ...entryForm, objectives: e.target.value })}
          placeholder="Learning objectives for this week"
          rows={2}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="teaching_activities">Activities</Label>
        <Textarea
          id="teaching_activities"
          value={entryForm.teaching_activities}
          onChange={(e) => setEntryForm({ ...entryForm, teaching_activities: e.target.value })}
          placeholder="Teaching and learning activities"
          rows={2}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="learning_resources">Resources</Label>
        <Input
          id="learning_resources"
          value={entryForm.learning_resources}
          onChange={(e) => setEntryForm({ ...entryForm, learning_resources: e.target.value })}
          placeholder="Textbooks, materials, etc."
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="assessment">Assessment</Label>
        <Input
          id="assessment"
          value={entryForm.assessment}
          onChange={(e) => setEntryForm({ ...entryForm, assessment: e.target.value })}
          placeholder="How learning will be assessed"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="remarks">Remarks</Label>
        <Input
          id="remarks"
          value={entryForm.remarks}
          onChange={(e) => setEntryForm({ ...entryForm, remarks: e.target.value })}
          placeholder="Additional notes"
        />
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/admin/academic/schemes">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{scheme.title}</h1>
          {scheme.description && (
            <p className="text-muted-foreground">{scheme.description}</p>
          )}
        </div>
      </div>

      {/* Scheme Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Scheme Details</CardTitle>
              <CardDescription>Overview and status</CardDescription>
            </div>
            <StatusBadge status={scheme.status} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Subject</p>
              <p className="font-medium">{scheme.subjects?.name || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Class</p>
              <p className="font-medium">{scheme.classes?.name || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Term</p>
              <p className="font-medium">{scheme.terms?.name || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Teacher</p>
              <p className="font-medium">
                {scheme.employees
                  ? `${scheme.employees.first_name} ${scheme.employees.last_name}`
                  : "-"}
              </p>
            </div>
          </div>

          <div className="flex gap-2 mt-6">
            {scheme.status === "draft" && (
              <Button size="sm" onClick={() => handleStatusChange("submitted")} disabled={isLoading}>
                <Send className="mr-2 h-3.5 w-3.5" />
                Submit for Review
              </Button>
            )}
            {scheme.status === "submitted" && (
              <>
                <Button size="sm" onClick={() => handleStatusChange("approved")} disabled={isLoading}>
                  <CheckCircle className="mr-2 h-3.5 w-3.5" />
                  Approve
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleStatusChange("revision_needed")} disabled={isLoading}>
                  <RotateCcw className="mr-2 h-3.5 w-3.5" />
                  Request Revision
                </Button>
              </>
            )}
            {scheme.status === "revision_needed" && (
              <Button size="sm" onClick={() => handleStatusChange("submitted")} disabled={isLoading}>
                <Send className="mr-2 h-3.5 w-3.5" />
                Resubmit
              </Button>
            )}
            {scheme.status === "approved" && (
              <Badge variant="outline" className="text-green-600 border-green-300">
                <CheckCircle className="mr-1 h-3 w-3" />
                Approved
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Weekly Breakdown */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Weekly Breakdown</CardTitle>
            <CardDescription>{scheme.scheme_entries.length} weeks planned</CardDescription>
          </div>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={resetEntryForm}>
                <Plus className="mr-2 h-4 w-4" />
                Add Week
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[560px]">
              <DialogHeader>
                <DialogTitle>Add Weekly Entry</DialogTitle>
                <DialogDescription>Plan a week&apos;s teaching content.</DialogDescription>
              </DialogHeader>
              <EntryFormFields />
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                <Button onClick={handleAddEntry} disabled={isLoading || !entryForm.topic.trim()}>
                  {isLoading ? "Adding..." : "Add Entry"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {scheme.scheme_entries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No weekly entries yet. Add weeks to build the scheme breakdown.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Week</TableHead>
                    <TableHead>Topic</TableHead>
                    <TableHead>Subtopic</TableHead>
                    <TableHead className="hidden lg:table-cell">Objectives</TableHead>
                    <TableHead className="hidden lg:table-cell">Activities</TableHead>
                    <TableHead className="hidden xl:table-cell">Resources</TableHead>
                    <TableHead className="hidden xl:table-cell">Assessment</TableHead>
                    <TableHead className="hidden xl:table-cell">Remarks</TableHead>
                    <TableHead className="text-right w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scheme.scheme_entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">{entry.week_number}</TableCell>
                      <TableCell>{entry.topic}</TableCell>
                      <TableCell>{entry.subtopic || "-"}</TableCell>
                      <TableCell className="hidden lg:table-cell max-w-xs truncate">{entry.objectives || "-"}</TableCell>
                      <TableCell className="hidden lg:table-cell max-w-xs truncate">{entry.teaching_activities || "-"}</TableCell>
                      <TableCell className="hidden xl:table-cell">{entry.learning_resources || "-"}</TableCell>
                      <TableCell className="hidden xl:table-cell">{entry.assessment || "-"}</TableCell>
                      <TableCell className="hidden xl:table-cell">{entry.remarks || "-"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditEntry(entry)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteEntry(entry.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Entry Dialog */}
      <Dialog open={!!editingEntry} onOpenChange={(open) => { if (!open) setEditingEntry(null) }}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Edit Week {entryForm.week_number}</DialogTitle>
            <DialogDescription>Update this week&apos;s content.</DialogDescription>
          </DialogHeader>
          <EntryFormFields />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEntry(null)}>Cancel</Button>
            <Button onClick={handleUpdateEntry} disabled={isLoading || !entryForm.topic.trim()}>
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
