import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ClassExamReport } from "@/components/grades/class-exam-report"
import { getClassExamReport } from "@/lib/actions/exams"
import { EXAM_TYPES } from "@/lib/types/exams"

const termlyTypes = [
  { value: "opening", label: "Opening Exams" },
  { value: "midterm", label: "Midterm Exams" },
  { value: "endterm", label: "Endterm Exams" },
] as const

export default async function ClassExamReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>
  searchParams: Promise<{ examType?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }

  const { classId } = await params
  const { examType } = await searchParams

  const selectedType = EXAM_TYPES.includes(examType as any)
    ? (examType as any)
    : "midterm"

  const report = await getClassExamReport(classId, selectedType)

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap gap-2">
        {termlyTypes.map((type) => (
          <Button
            key={type.value}
            variant={selectedType === type.value ? "default" : "outline"}
            asChild
          >
            <Link href={`/dashboard/teacher/grades/reports/${classId}?examType=${type.value}`}>
              {type.label}
            </Link>
          </Button>
        ))}
      </div>

      <ClassExamReport
        className={report.classInfo.name}
        examTypeLabel={termlyTypes.find((t) => t.value === selectedType)?.label}
        students={report.students}
        sessions={report.sessions}
      />
    </div>
  )
}
