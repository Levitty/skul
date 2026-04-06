"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Printer, Eye, FileText } from "lucide-react"
import { getClassExamReport } from "@/lib/actions/exams"
import { EXAM_TYPES, type ExamType } from "@/lib/types/exams"
import Link from "next/link"
import { useRouter } from "next/navigation"

interface ReportsManagerProps {
  classes: Array<{ id: string; name: string }>
  academicYears: Array<{ id: string; name: string }>
  currentAcademicYearId?: string
}

const termlyTypes = [
  { value: "opening", label: "Opening Exams" },
  { value: "midterm", label: "Midterm Exams" },
  { value: "endterm", label: "Endterm Exams" },
] as const

export function ReportsManager({ classes, academicYears, currentAcademicYearId }: ReportsManagerProps) {
  const router = useRouter()
  const [selectedClass, setSelectedClass] = useState<string>("all")
  const [selectedExamType, setSelectedExamType] = useState<string>("all")
  const [selectedYear, setSelectedYear] = useState<string>(currentAcademicYearId || academicYears[0]?.id || "")
  const [selectedReports, setSelectedReports] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)

  const handleBulkPrint = () => {
    if (selectedReports.size === 0) {
      alert("Please select at least one report to print")
      return
    }

    // Open bulk print view in new window
    const reportIds = Array.from(selectedReports)
    const params = new URLSearchParams()
    reportIds.forEach(id => params.append("reports", id))
    window.open(`/dashboard/teacher/grades/bulk-print?${params.toString()}`, "_blank")
  }

  const toggleReport = (reportId: string) => {
    setSelectedReports(prev => {
      const newSet = new Set(prev)
      if (newSet.has(reportId)) {
        newSet.delete(reportId)
      } else {
        newSet.add(reportId)
      }
      return newSet
    })
  }

  const selectAll = () => {
    const allReports = new Set<string>()
    classes.forEach(cls => {
      termlyTypes.forEach(type => {
        allReports.add(`${cls.id}-${type.value}`)
      })
    })
    setSelectedReports(allReports)
  }

  const clearSelection = () => {
    setSelectedReports(new Set())
  }

  const filteredClasses = selectedClass === "all" ? classes : classes.filter(c => c.id === selectedClass)

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Report Filters</CardTitle>
          <CardDescription>Select filters to view available reports</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Academic Year</label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {academicYears.map((year) => (
                    <SelectItem key={year.id} value={year.id}>
                      {year.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Class</label>
              <Select value={selectedClass} onValueChange={setSelectedClass}>
                <SelectTrigger>
                  <SelectValue placeholder="All Classes" />
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
            <div className="space-y-2">
              <label className="text-sm font-medium">Exam Type</label>
              <Select value={selectedExamType} onValueChange={setSelectedExamType}>
                <SelectTrigger>
                  <SelectValue placeholder="All Exam Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Exam Types</SelectItem>
                  {termlyTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={selectAll}>
            Select All
          </Button>
          <Button variant="outline" size="sm" onClick={clearSelection}>
            Clear Selection
          </Button>
          <Button 
            variant="default" 
            size="sm" 
            onClick={handleBulkPrint}
            disabled={selectedReports.size === 0}
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white"
          >
            <Printer className="w-4 h-4 mr-2" />
            Bulk Print ({selectedReports.size})
          </Button>
        </div>
        <div className="text-sm text-neutral-500">
          {selectedReports.size} report{selectedReports.size !== 1 ? "s" : ""} selected
        </div>
      </div>

      {/* Reports List */}
      <Card>
        <CardHeader>
          <CardTitle>Available Reports</CardTitle>
          <CardDescription>
            {filteredClasses.length} class{filteredClasses.length !== 1 ? "es" : ""} available
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredClasses.length === 0 ? (
            <div className="text-center py-8 text-neutral-500">
              No classes available. Create classes first.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedReports.size > 0 && selectedReports.size === filteredClasses.length * termlyTypes.length}
                      onCheckedChange={(checked) => {
                        if (checked) selectAll()
                        else clearSelection()
                      }}
                    />
                  </TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Exam Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClasses.flatMap((cls) => {
                  const examTypes = selectedExamType === "all" 
                    ? termlyTypes 
                    : termlyTypes.filter(t => t.value === selectedExamType)
                  
                  return examTypes.map((type) => {
                    const reportId = `${cls.id}-${type.value}`
                    const isSelected = selectedReports.has(reportId)
                    
                    return (
                      <TableRow key={reportId}>
                        <TableCell>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleReport(reportId)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{cls.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{type.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">Available</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              asChild
                            >
                              <Link href={`/dashboard/teacher/grades/reports/${cls.id}?examType=${type.value}`}>
                                <Eye className="w-4 h-4 mr-1" />
                                View
                              </Link>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                window.open(`/dashboard/teacher/grades/reports/${cls.id}?examType=${type.value}`, "_blank")
                                setTimeout(() => window.print(), 500)
                              }}
                            >
                              <Printer className="w-4 h-4 mr-1" />
                              Print
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
