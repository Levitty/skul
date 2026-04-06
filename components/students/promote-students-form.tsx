"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import { promoteStudents } from "@/lib/actions/students-promote"
import { GraduationCap, Users, ArrowRight } from "lucide-react"

interface PromoteStudentsFormProps {
  academicYears: any[]
  classes: any[]
  sections: any[]
  students: any[]
}

export function PromoteStudentsForm({
  academicYears,
  classes,
  sections,
  students,
}: PromoteStudentsFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const [fromAcademicYearId, setFromAcademicYearId] = useState("")
  const [toAcademicYearId, setToAcademicYearId] = useState("")
  const [fromClassId, setFromClassId] = useState("")
  const [toClassId, setToClassId] = useState("")
  const [toSectionId, setToSectionId] = useState("")
  const [selectedStudents, setSelectedStudents] = useState<string[]>([])

  // Filter students by selected class and academic year
  const filteredStudents = students.filter((student) => {
    if (!fromClassId || !fromAcademicYearId) return false
    return student.enrollments?.some(
      (e: any) =>
        e.academic_year_id === fromAcademicYearId && e.class_id === fromClassId
    )
  })

  const filteredSections = sections.filter((s: any) => s.class_id === toClassId)

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedStudents(filteredStudents.map((s) => s.id))
    } else {
      setSelectedStudents([])
    }
  }

  const handleStudentToggle = (studentId: string, checked: boolean) => {
    if (checked) {
      setSelectedStudents([...selectedStudents, studentId])
    } else {
      setSelectedStudents(selectedStudents.filter((id) => id !== studentId))
    }
  }

  const handleSubmit = async () => {
    if (selectedStudents.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one student to promote",
        variant: "destructive",
      })
      return
    }

    if (!fromAcademicYearId || !toAcademicYearId || !toClassId) {
      toast({
        title: "Error",
        description: "Please select all required fields",
        variant: "destructive",
      })
      return
    }

    setLoading(true)

    try {
      const result = await promoteStudents({
        studentIds: selectedStudents,
        fromAcademicYearId,
        toAcademicYearId,
        fromClassId,
        toClassId,
        toSectionId: toSectionId || undefined,
      })

      if (result.error) {
        throw new Error(result.error)
      }

      const successful = result.results?.filter((r) => r.success).length || 0
      const failed = result.results?.filter((r) => !r.success).length || 0

      toast({
        title: "Promotion Complete",
        description: `Successfully promoted ${successful} student(s). ${failed > 0 ? `${failed} failed.` : ""}`,
      })

      router.push("/dashboard/admin/students")
      router.refresh()
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to promote students",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const currentYear = academicYears.find((y) => y.is_current)

  return (
    <div className="space-y-6">
      {/* Selection Criteria */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5" />
            Promotion Criteria
          </CardTitle>
          <CardDescription>
            Select the source and destination for student promotion
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* From */}
            <div className="space-y-4 p-4 border rounded-lg">
              <h3 className="font-semibold text-lg">From</h3>
              <div className="space-y-2">
                <Label>Academic Year</Label>
                <Select value={fromAcademicYearId} onValueChange={setFromAcademicYearId}>
                  <SelectTrigger><SelectValue placeholder="Select academic year" /></SelectTrigger>
                  <SelectContent>
                    {academicYears.map((year) => (
                      <SelectItem key={year.id} value={year.id}>
                        {year.name} {year.is_current && "(Current)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Class</Label>
                <Select value={fromClassId} onValueChange={setFromClassId}>
                  <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Arrow */}
            <div className="hidden md:flex items-center justify-center">
              <ArrowRight className="w-8 h-8 text-muted-foreground" />
            </div>

            {/* To */}
            <div className="space-y-4 p-4 border rounded-lg md:col-start-2">
              <h3 className="font-semibold text-lg">To</h3>
              <div className="space-y-2">
                <Label>Academic Year</Label>
                <Select value={toAcademicYearId} onValueChange={setToAcademicYearId}>
                  <SelectTrigger><SelectValue placeholder="Select academic year" /></SelectTrigger>
                  <SelectContent>
                    {academicYears.map((year) => (
                      <SelectItem key={year.id} value={year.id}>
                        {year.name} {year.is_current && "(Current)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Class</Label>
                <Select value={toClassId} onValueChange={setToClassId}>
                  <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Section (Optional)</Label>
                <Select 
                  value={toSectionId} 
                  onValueChange={setToSectionId}
                  disabled={!toClassId}
                >
                  <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
                  <SelectContent>
                    {filteredSections.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Student Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Select Students ({selectedStudents.length} selected)
          </CardTitle>
          <CardDescription>
            Select the students you want to promote
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!fromClassId || !fromAcademicYearId ? (
            <p className="text-muted-foreground text-center py-8">
              Please select an academic year and class to see students
            </p>
          ) : filteredStudents.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No students found in the selected class and academic year
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center space-x-2 pb-4 border-b">
                <Checkbox
                  id="select-all"
                  checked={selectedStudents.length === filteredStudents.length}
                  onCheckedChange={handleSelectAll}
                />
                <Label htmlFor="select-all" className="cursor-pointer font-medium">
                  Select All ({filteredStudents.length} students)
                </Label>
              </div>
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {filteredStudents.map((student) => (
                  <div
                    key={student.id}
                    className="flex items-center space-x-2 p-2 border rounded-lg"
                  >
                    <Checkbox
                      id={`student-${student.id}`}
                      checked={selectedStudents.includes(student.id)}
                      onCheckedChange={(checked) =>
                        handleStudentToggle(student.id, checked as boolean)
                      }
                    />
                    <Label htmlFor={`student-${student.id}`} className="cursor-pointer flex-1">
                      <span className="font-medium">
                        {student.first_name} {student.last_name}
                      </span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {student.admission_number}
                      </span>
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || selectedStudents.length === 0}
          >
            {loading ? "Promoting..." : `Promote ${selectedStudents.length} Student(s)`}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}



