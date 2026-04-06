"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { 
  createAcademicYear, 
  updateAcademicYear, 
  deleteAcademicYear,
  createTerm,
  updateTerm,
  deleteTerm 
} from "@/lib/actions/school-setup"
import { Loader2, Plus, Pencil, Trash2, Calendar, X, Save, ChevronDown, ChevronUp } from "lucide-react"

interface Term {
  id: string
  name: string
  start_date: string
  end_date: string
  due_date: string | null
  is_current: boolean
}

interface AcademicYear {
  id: string
  name: string
  start_date: string
  end_date: string
  is_current: boolean
  terms: Term[]
}

interface AcademicYearsManagerProps {
  initialYears: AcademicYear[]
}

export function AcademicYearsManager({ initialYears }: AcademicYearsManagerProps) {
  const router = useRouter()
  const [years, setYears] = useState<AcademicYear[]>(initialYears)
  const [isAddingYear, setIsAddingYear] = useState(false)
  const [addingTermToYear, setAddingTermToYear] = useState<string | null>(null)
  const [editingYearId, setEditingYearId] = useState<string | null>(null)
  const [editingTermId, setEditingTermId] = useState<string | null>(null)
  const [expandedYears, setExpandedYears] = useState<string[]>(
    initialYears.filter(y => y.is_current).map(y => y.id)
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [termIsCurrent, setTermIsCurrent] = useState<Record<string, boolean>>({})

  function toggleYearExpansion(yearId: string) {
    setExpandedYears(prev =>
      prev.includes(yearId)
        ? prev.filter(id => id !== yearId)
        : [...prev, yearId]
    )
  }

  async function handleCreateYear(formData: FormData) {
    setIsSubmitting(true)
    setError(null)

    const result = await createAcademicYear(formData)

    if (result.error) {
      setError(result.error)
    } else {
      setIsAddingYear(false)
      router.refresh()
    }

    setIsSubmitting(false)
  }

  async function handleUpdateYear(yearId: string, formData: FormData) {
    setIsSubmitting(true)
    setError(null)

    const result = await updateAcademicYear(yearId, formData)

    if (result.error) {
      setError(result.error)
    } else {
      setEditingYearId(null)
      router.refresh()
    }

    setIsSubmitting(false)
  }

  async function handleDeleteYear(yearId: string) {
    if (!confirm("Are you sure? This will delete the academic year and all its terms.")) {
      return
    }

    setIsSubmitting(true)
    setError(null)

    const result = await deleteAcademicYear(yearId)

    if (result.error) {
      setError(result.error)
    } else {
      router.refresh()
    }

    setIsSubmitting(false)
  }

  async function handleCreateTerm(formData: FormData) {
    setIsSubmitting(true)
    setError(null)

    const result = await createTerm(formData)

    if (result.error) {
      setError(result.error)
    } else {
      setAddingTermToYear(null)
      setTermIsCurrent(prev => {
        const newState = { ...prev }
        const yearId = formData.get("academic_year_id") as string
        if (yearId) delete newState[`add-${yearId}`]
        return newState
      })
      router.refresh()
    }

    setIsSubmitting(false)
  }

  async function handleUpdateTerm(termId: string, formData: FormData) {
    setIsSubmitting(true)
    setError(null)

    const result = await updateTerm(termId, formData)

    if (result.error) {
      setError(result.error)
    } else {
      setEditingTermId(null)
      setTermIsCurrent(prev => {
        const newState = { ...prev }
        delete newState[`edit-${termId}`]
        return newState
      })
      router.refresh()
    }

    setIsSubmitting(false)
  }

  async function handleDeleteTerm(termId: string) {
    if (!confirm("Are you sure you want to delete this term?")) {
      return
    }

    setIsSubmitting(true)
    setError(null)

    const result = await deleteTerm(termId)

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

      {/* Add New Year */}
      {isAddingYear ? (
        <Card className="border-2 border-dashed border-primary">
          <CardHeader>
            <CardTitle className="text-lg">Add New Academic Year</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={handleCreateYear} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Year Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="e.g., 2024-2025"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="start_date">Start Date *</Label>
                  <Input
                    id="start_date"
                    name="start_date"
                    type="date"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end_date">End Date *</Label>
                  <Input
                    id="end_date"
                    name="end_date"
                    type="date"
                    required
                  />
                </div>
                <div className="space-y-2 flex items-end">
                  <div className="flex items-center gap-2">
                    <Checkbox id="is_current" name="is_current" value="true" />
                    <Label htmlFor="is_current" className="text-sm">Set as current</Label>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddingYear(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Save Year
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Button
          onClick={() => setIsAddingYear(true)}
          className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Academic Year
        </Button>
      )}

      {/* Years List */}
      {years.length === 0 ? (
        <Card className="border-0 shadow-lg">
          <CardContent className="p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/20 dark:to-orange-900/20">
              <Calendar className="w-8 h-8 text-amber-600 dark:text-amber-400" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No academic years yet</h3>
            <p className="text-sm text-neutral-500">
              Create your first academic year to start organizing your school calendar
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {years.map((year) => (
            <Card key={year.id} className="border-0 shadow-lg overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => toggleYearExpansion(year.id)}
                      className="p-1 rounded hover:bg-neutral-100 transition-colors"
                    >
                      {expandedYears.includes(year.id) ? (
                        <ChevronUp className="w-5 h-5" />
                      ) : (
                        <ChevronDown className="w-5 h-5" />
                      )}
                    </button>
                    <div>
                      <div className="flex items-center gap-3">
                        <CardTitle className="text-xl">{year.name}</CardTitle>
                        {year.is_current && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
                            Current
                          </span>
                        )}
                      </div>
                      <CardDescription>
                        {new Date(year.start_date).toLocaleDateString()} - {new Date(year.end_date).toLocaleDateString()}
                        {" • "}{year.terms?.length || 0} term{(year.terms?.length || 0) !== 1 && "s"}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setEditingYearId(year.id)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleDeleteYear(year.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {/* Year Edit Form */}
              {editingYearId === year.id && (
                <CardContent className="pt-0 pb-4 border-t bg-neutral-100/30">
                  <form
                    action={(formData) => handleUpdateYear(year.id, formData)}
                    className="space-y-4 pt-4"
                  >
                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="space-y-2">
                        <Label>Year Name</Label>
                        <Input name="name" defaultValue={year.name} required />
                      </div>
                      <div className="space-y-2">
                        <Label>Start Date</Label>
                        <Input name="start_date" type="date" defaultValue={year.start_date} required />
                      </div>
                      <div className="space-y-2">
                        <Label>End Date</Label>
                        <Input name="end_date" type="date" defaultValue={year.end_date} required />
                      </div>
                      <div className="space-y-2 flex items-end">
                        <div className="flex items-center gap-2">
                          <Checkbox 
                            id={`current-${year.id}`} 
                            name="is_current" 
                            value="true"
                            defaultChecked={year.is_current}
                          />
                          <Label htmlFor={`current-${year.id}`}>Current year</Label>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setEditingYearId(null)}>
                        <X className="w-4 h-4 mr-1" /> Cancel
                      </Button>
                      <Button type="submit" size="sm" disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                        Save
                      </Button>
                    </div>
                  </form>
                </CardContent>
              )}

              {/* Terms Section */}
              {expandedYears.includes(year.id) && (
                <CardContent className="pt-0 border-t">
                  <div className="pt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-sm text-neutral-500">Terms</h4>
                      {addingTermToYear !== year.id && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAddingTermToYear(year.id)}
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Add Term
                        </Button>
                      )}
                    </div>

                    {/* Add Term Form */}
                    {addingTermToYear === year.id && (
                      <div className="p-4 rounded-lg border-2 border-dashed border-primary bg-neutral-100/30">
                        <form action={handleCreateTerm} className="space-y-4">
                          <input type="hidden" name="academic_year_id" value={year.id} />
                          <div className="grid gap-4 md:grid-cols-5">
                            <div className="space-y-2">
                              <Label>Term Name *</Label>
                              <Input name="name" placeholder="Term 1" required />
                            </div>
                            <div className="space-y-2">
                              <Label>Start Date *</Label>
                              <Input name="start_date" type="date" required />
                            </div>
                            <div className="space-y-2">
                              <Label>End Date *</Label>
                              <Input name="end_date" type="date" required />
                            </div>
                            <div className="space-y-2">
                              <Label>Fee Due Date</Label>
                              <Input name="due_date" type="date" />
                            </div>
                            <div className="space-y-2 flex items-end">
                              <div className="flex items-center gap-2">
                                <Checkbox 
                                  checked={termIsCurrent[`add-${year.id}`] || false}
                                  onCheckedChange={(checked) => {
                                    setTermIsCurrent(prev => ({
                                      ...prev,
                                      [`add-${year.id}`]: checked === true
                                    }))
                                  }}
                                />
                                <Label className="text-xs">Current</Label>
                                <input 
                                  type="hidden" 
                                  name="is_current" 
                                  value={termIsCurrent[`add-${year.id}`] ? "true" : "false"} 
                                />
                              </div>
                            </div>
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button 
                            type="button" 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => {
                              setAddingTermToYear(null)
                              setTermIsCurrent(prev => {
                                const newState = { ...prev }
                                delete newState[`add-${year.id}`]
                                return newState
                              })
                            }}
                          >
                              Cancel
                            </Button>
                            <Button type="submit" size="sm" disabled={isSubmitting}>
                              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                              Save Term
                            </Button>
                          </div>
                        </form>
                      </div>
                    )}

                    {/* Terms List */}
                    {year.terms && year.terms.length > 0 ? (
                      <div className="space-y-2">
                        {year.terms.map((term) => (
                          <div
                            key={term.id}
                            className="p-3 rounded-lg border bg-white hover:shadow-sm transition-shadow"
                          >
                            {editingTermId === term.id ? (
                              <form
                                action={(formData) => handleUpdateTerm(term.id, formData)}
                                className="space-y-3"
                              >
                                <div className="grid gap-3 md:grid-cols-5">
                                  <Input name="name" defaultValue={term.name} placeholder="Term name" required />
                                  <Input name="start_date" type="date" defaultValue={term.start_date} required />
                                  <Input name="end_date" type="date" defaultValue={term.end_date} required />
                                  <Input name="due_date" type="date" defaultValue={term.due_date || ""} />
                                  <div className="flex items-center gap-2">
                                    <Checkbox 
                                      checked={termIsCurrent[`edit-${term.id}`] ?? term.is_current}
                                      onCheckedChange={(checked) => {
                                        setTermIsCurrent(prev => ({
                                          ...prev,
                                          [`edit-${term.id}`]: checked === true
                                        }))
                                      }}
                                    />
                                    <Label className="text-xs">Current</Label>
                                    <input 
                                      type="hidden" 
                                      name="is_current" 
                                      value={(termIsCurrent[`edit-${term.id}`] ?? term.is_current) ? "true" : "false"} 
                                    />
                                  </div>
                                </div>
                                <div className="flex justify-end gap-2">
                                  <Button 
                                    type="button" 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => {
                                      setEditingTermId(null)
                                      setTermIsCurrent(prev => {
                                        const newState = { ...prev }
                                        delete newState[`edit-${term.id}`]
                                        return newState
                                      })
                                    }}
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                  <Button type="submit" size="sm" disabled={isSubmitting}>
                                    <Save className="w-4 h-4" />
                                  </Button>
                                </div>
                              </form>
                            ) : (
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium">{term.name}</span>
                                      {term.is_current && (
                                        <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs">
                                          Current
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-sm text-neutral-500">
                                      {new Date(term.start_date).toLocaleDateString()} - {new Date(term.end_date).toLocaleDateString()}
                                      {term.due_date && (
                                        <span className="ml-2 text-amber-600 dark:text-amber-400">
                                          (Due: {new Date(term.due_date).toLocaleDateString()})
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => setEditingTermId(term.id)}
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                                    onClick={() => handleDeleteTerm(term.id)}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-sm text-neutral-500">
                        No terms added yet. Click &quot;Add Term&quot; to create one.
                      </div>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}


