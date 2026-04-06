"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClass, updateClass, deleteClass } from "@/lib/actions/school-setup"
import { Loader2, Plus, Pencil, Trash2, Users2, X, Save } from "lucide-react"

interface Section {
  id: string
  name: string
  capacity: number | null
}

interface ClassItem {
  id: string
  name: string
  level: number
  description: string | null
  sections: Section[]
}

interface ClassesManagerProps {
  initialClasses: ClassItem[]
}

export function ClassesManager({ initialClasses }: ClassesManagerProps) {
  const router = useRouter()
  const [classes, setClasses] = useState<ClassItem[]>(initialClasses)
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate(formData: FormData) {
    setIsSubmitting(true)
    setError(null)

    try {
      const result = await createClass(formData)

      if (result.error) {
        setError(result.error)
        console.error("Error creating class:", result.error)
      } else {
        setIsAdding(false)
        router.refresh()
      }
    } catch (err: any) {
      const errorMessage = err?.message || "Failed to create class. Please try again."
      setError(errorMessage)
      console.error("Error creating class:", err)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleUpdate(classId: string, formData: FormData) {
    setIsSubmitting(true)
    setError(null)

    const result = await updateClass(classId, formData)

    if (result.error) {
      setError(result.error)
    } else {
      setEditingId(null)
      router.refresh()
    }

    setIsSubmitting(false)
  }

  async function handleDelete(classId: string) {
    if (!confirm("Are you sure you want to delete this class? This will also delete all sections in this class.")) {
      return
    }

    setIsSubmitting(true)
    setError(null)

    const result = await deleteClass(classId)

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

      {/* Add New Class */}
      {isAdding ? (
        <Card className="border-2 border-dashed border-primary">
          <CardHeader>
            <CardTitle className="text-lg">Add New Class</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={handleCreate} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="name">Class Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="e.g., Grade 1, Form 1"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="level">Level (Order)</Label>
                  <Input
                    id="level"
                    name="level"
                    type="number"
                    min="1"
                    defaultValue="1"
                    placeholder="1"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    name="description"
                    placeholder="Optional description"
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
                  Save Class
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Button
          onClick={() => setIsAdding(true)}
          className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add New Class
        </Button>
      )}

      {/* Classes List */}
      {classes.length === 0 ? (
        <Card className="border-0 shadow-lg">
          <CardContent className="p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/20 dark:to-teal-900/20">
              <Users2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No classes yet</h3>
            <p className="text-sm text-neutral-500 mb-4">
              Create your first class to start organizing your school structure
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {classes.map((classItem) => (
            <Card
              key={classItem.id}
              className="border-0 shadow-lg hover:shadow-xl transition-all duration-300"
            >
              {editingId === classItem.id ? (
                <CardContent className="p-4">
                  <form
                    action={(formData) => handleUpdate(classItem.id, formData)}
                    className="space-y-4"
                  >
                    <div className="space-y-2">
                      <Label htmlFor={`name-${classItem.id}`}>Class Name</Label>
                      <Input
                        id={`name-${classItem.id}`}
                        name="name"
                        defaultValue={classItem.name}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`level-${classItem.id}`}>Level</Label>
                      <Input
                        id={`level-${classItem.id}`}
                        name="level"
                        type="number"
                        defaultValue={classItem.level}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`description-${classItem.id}`}>Description</Label>
                      <Input
                        id={`description-${classItem.id}`}
                        name="description"
                        defaultValue={classItem.description || ""}
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
                </CardContent>
              ) : (
                <>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-xl">{classItem.name}</CardTitle>
                        <CardDescription>
                          Level {classItem.level}
                          {classItem.description && ` • ${classItem.description}`}
                        </CardDescription>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setEditingId(classItem.id)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDelete(classItem.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 text-sm text-neutral-500">
                      <Users2 className="w-4 h-4" />
                      <span>
                        {classItem.sections?.length || 0} section{(classItem.sections?.length || 0) !== 1 && "s"}
                      </span>
                    </div>
                    {classItem.sections && classItem.sections.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {classItem.sections.map((section) => (
                          <span
                            key={section.id}
                            className="px-2 py-1 rounded-md bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-medium"
                          >
                            {section.name}
                            {section.capacity && ` (${section.capacity})`}
                          </span>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

