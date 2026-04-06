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

export default async function StudentGradesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data: student } = await (supabase as any)
    .from("students")
    .select("id, first_name, last_name")
    .eq("user_id", user.id)
    .single()

  if (!student) {
    redirect("/student-portal")
  }

  const s = student as any

  const { data: results } = await (supabase as any)
    .from("exam_results")
    .select("*, exam_sessions(subject, exam_date, max_marks, exams(name))")
    .eq("student_id", s.id)
    .order("created_at", { ascending: false })

  const grades = ((results as any[]) || []).map((r: any) => {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">My Grades</h2>
          <p className="text-muted-foreground">
            Exam results for {s.first_name} {s.last_name}
          </p>
        </div>
        <Link
          href="/student-portal"
          className="text-sm text-blue-600 hover:underline"
        >
          &larr; Back to Dashboard
        </Link>
      </div>

      {grades.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No grades recorded yet.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {grades.length} Result{grades.length !== 1 ? "s" : ""}
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
                {grades.map((grade: any) => {
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
