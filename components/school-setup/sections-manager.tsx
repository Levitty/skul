"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createSection, updateSection, deleteSection } from "@/lib/actions/school-setup"
import { Loader2, Plus, Pencil, Trash2, Users2, X, Save } from "lucide-react"

interface ClassInfo {
  id: string
  name: string
  level: number
}

interface SectionItem {
  id: string
  name: string
  capacity: number | null
  class_id: string
  classes: ClassInfo
}

interface SectionsManagerProps {
  initialSections: SectionItem[]
  classes: ClassInfo[]
}

export function SectionsManager({ initialSections, classes }: SectionsManagerProps) {
  const router = useRouter()
  const [sections, setSections] = useState<SectionItem[]>(initialSections)
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>("all")
  const [selectedClassId, setSelectedClassId] = useState<string>("")

  const filteredSections = selectedClassFilter === "all"
    ? sections
    : sections.filter(s => s.class_id === selectedClassFilter)

  // Group sections by class
  const sectionsByClass = filteredSections.reduce((acc, section) => {
    const className = section.classes?.name || "Unknown"
    if (!acc[className]) {
      acc[className] = []
    }
    acc[className].push(section)
    return acc
  }, {} as Record<string, SectionItem[]>)

  async function handleCreate(formData: FormData) {
    setIsSubmitting(true)
    setError(null)

    const result = await createSection(formData)

    if (result.error) {
      setError(result.error)
    } else {
      setIsAdding(false)
      setSelectedClassId("")
      router.refresh()
    }

    setIsSubmitting(false)
  }

  async function handleUpdate(sectionId: string, formData: FormData) {
    setIsSubmitting(true)
    setError(null)

    const result = await updateSection(sectionId, formData)

    if (result.error) {
      setError(result.error)
    } else {
      setEditingId(null)
      router.refresh()
    }

    setIsSubmitting(false)
  }

  async function handleDelete(sectionId: string) {
    if (!confirm("Are you sure you want to delete this section?")) {
      return
    }

    setIsSubmitting(true)
    setError(null)

    const result = await deleteSection(sectionId)

    if (result.error) {
      setError(result.error)
    } else {
      router.refresh()
    }

    setIsSubmitting(false)
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Filter and Add */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="w-full sm:w-64">
          <Select value={selectedClassFilter} onValueChange={setSelectedClassFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by class" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {classes.map((cls) => (
                <SelectItem key={cls.id} value={cls.id}>
                  {cls.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!isAdding && (
          <Button
            onClick={() => {
              setIsAdding(true)
              setSelectedClassId("")
            }}
            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add New Section
          </Button>
        )}
      </div>

      {/* Add New Section Form */}
      {isAdding && (
        <Card className="border-2 border-dashed border-primary">
          <CardHeader>
            <CardTitle className="text-lg">Add New Section</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={handleCreate} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="class_id">Class *</Label>
                  <Select value={selectedClassId} onValueChange={setSelectedClassId} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent>
                      {classes.map((cls) => (
                        <SelectItem key={cls.id} value={cls.id}>
                          {cls.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <input type="hidden" name="class_id" value={selectedClassId} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Section Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="e.g., A, B, Blue, Red"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="capacity">Capacity</Label>
                  <Input
                    id="capacity"
                    name="capacity"
                    type="number"
                    min="1"
                    placeholder="e.g., 40"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAdding(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Save Section
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Sections List */}
      {filteredSections.length === 0 ? (
        <Card className="border-0 shadow-lg">
          <CardContent className="p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/20 dark:to-pink-900/20">
              <Users2 className="w-8 h-8 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No sections yet</h3>
            <p className="text-sm text-neutral-500">
              {selectedClassFilter === "all"
                ? "Create sections to divide your classes into smaller groups"
                : "No sections found for the selected class"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(sectionsByClass).map(([className, classSections]) => (
            <Card key={className} className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg">{className}</CardTitle>
                <CardDescription>
                  {classSections.length} section{classSections.length !== 1 && "s"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {classSections.map((section) => (
                    <div
                      key={section.id}
                      className="p-4 rounded-lg border-2 border-gray-200 dark:border-gray-800 hover:border-purple-300 dark:hover:border-purple-700 transition-colors"
                    >
                      {editingId === section.id ? (
                        <form
                          action={(formData) => handleUpdate(section.id, formData)}
                          className="space-y-3"
                        >
                          <div className="space-y-2">
                            <Label htmlFor={`name-${section.id}`}>Name</Label>
                            <Input
                              id={`name-${section.id}`}
                              name="name"
                              defaultValue={section.name}
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`capacity-${section.id}`}>Capacity</Label>
                            <Input
                              id={`capacity-${section.id}`}
                              name="capacity"
                              type="number"
                              defaultValue={section.capacity || ""}
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingId(null)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                            <Button type="submit" size="sm" disabled={isSubmitting}>
                              {isSubmitting ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Save className="w-4 h-4" />
                              )}
                            </Button>
                          </div>
                        </form>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-semibold">{section.name}</div>
                            <div className="text-sm text-neutral-500">
                              {section.capacity 
                                ? `Capacity: ${section.capacity} students`
                                : "No capacity limit"}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setEditingId(section.id)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => handleDelete(section.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}


