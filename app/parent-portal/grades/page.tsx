import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default async function ParentGradesPage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Get all students
  const { data: allStudents } = await (supabase as any)
    .from("students")
    .select("id, first_name, last_name, admission_number")
    .eq("user_id", user.id)
    .order("first_name", { ascending: true })

  const students = (allStudents as any[]) || []

  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <h2 className="text-xl font-semibold mb-2">No Children Linked</h2>
        <p className="text-muted-foreground">
          Your account is not linked to any students yet.
        </p>
      </div>
    )
  }

  const params = await searchParams
  const selectedChildId = params.child || students[0].id

  // Get grades for all children
  const { data: allResults } = await (supabase as any)
    .from("exam_results")
    .select("*, exam_sessions(subject, exam_date, max_marks, exams(name)), students(id, first_name, last_name, admission_number)")
    .in("student_id", students.map((s: any) => s.id))
    .order("created_at", { ascending: false })

  const results = (allResults as any[]) || []

  // Get current student details
  const selectedStudent = students.find((s: any) => s.id === selectedChildId) || students[0]

  // Filter results for selected student
  const studentGrades = results
    .filter((r: any) => r.student_id === selectedStudent.id)
    .map((r: any) => {
      const session = r.exam_sessions as any
      return {
        id: r.id,
        exam_name: session?.exams?.name ?? "—",
        subject: session?.subject ?? "—",
        exam_date: session?.exam_date,
        obtained_marks: r.marks_obtained,
        max_marks: session?.max_marks,
        grade: r.grade,
        remarks: r.remarks,
      }
    })

  // Calculate statistics
  const stats = {
    totalExams: studentGrades.length,
    averagePercentage: 0,
    bestSubject: "—",
    bestPercentage: 0,
  }

  if (studentGrades.length > 0) {
    let totalPercentage = 0
    const subjectPercentages: Record<string, { total: number; count: number }> = {}

    for (const grade of studentGrades) {
      const maxMarks = Number(grade.max_marks) || 0
      const obtainedMarks = Number(grade.obtained_marks) || 0
      const pct = maxMarks > 0 ? (obtainedMarks / maxMarks) * 100 : 0
      totalPercentage += pct

      if (!subjectPercentages[grade.subject]) {
        subjectPercentages[grade.subject] = { total: 0, count: 0 }
      }
      subjectPercentages[grade.subject].total += pct
      subjectPercentages[grade.subject].count += 1
    }

    stats.averagePercentage = Math.round(totalPercentage / studentGrades.length)

    // Find best subject
    for (const [subject, data] of Object.entries(subjectPercentages)) {
      const avgPct = data.total / data.count
      if (avgPct > stats.bestPercentage) {
        stats.bestPercentage = Math.round(avgPct)
        stats.bestSubject = subject
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Grades & Academic Results</h2>
          <p className="text-muted-foreground">
            Exam results and academic performance
          </p>
        </div>
        <Link
          href="/parent-portal"
          className="text-sm text-blue-600 hover:underline"
        >
          &larr; Back to Dashboard
        </Link>
      </div>

      {/* Child Selector for Multiple Children */}
      {students.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {students.map((student: any) => (
            <Link
              key={student.id}
              href={`/parent-portal/grades?child=${student.id}`}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedStudent.id === student.id
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {student.first_name} {student.last_name}
            </Link>
          ))}
        </div>
      )}

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Exams</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalExams}</div>
            <p className="text-xs text-muted-foreground mt-1">Recorded results</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Average Percentage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.averagePercentage >= 50 ? "text-emerald-600" : "text-red-600"}`}>
              {stats.averagePercentage}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">Overall performance</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Best Subject</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-base font-bold truncate">{stats.bestSubject}</div>
            <p className="text-xs text-muted-foreground mt-1">{stats.bestPercentage}% average</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Student Info</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-bold">{selectedStudent.admission_number}</div>
            <p className="text-xs text-muted-foreground mt-1">Admission number</p>
          </CardContent>
        </Card>
      </div>

      {/* Grades Table */}
      {studentGrades.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No grades recorded yet for {selectedStudent.first_name} {selectedStudent.last_name}.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {studentGrades.length} Result{studentGrades.length !== 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Exam</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Marks</TableHead>
                  <TableHead className="text-right">Max</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {studentGrades.map((grade: any) => {
                  const maxMarks = Number(grade.max_marks) || 0
                  const pct = maxMarks > 0
                    ? Math.round((Number(grade.obtained_marks) / maxMarks) * 100)
                    : 0

                  return (
                    <TableRow key={grade.id}>
                      <TableCell className="font-medium">{grade.exam_name}</TableCell>
                      <TableCell>{grade.subject}</TableCell>
                      <TableCell>
                        {grade.exam_date
                          ? new Date(grade.exam_date).toLocaleDateString()
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {grade.obtained_marks}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {grade.max_marks}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={pct >= 50 ? "default" : "destructive"}
                          className="tabular-nums"
                        >
                          {pct}%
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {grade.grade ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs max-w-[150px] truncate">
                        {grade.remarks ?? "—"}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
