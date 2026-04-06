import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { BulkPrintView } from "@/components/grades/bulk-print-view"
import { getClassExamReport } from "@/lib/actions/exams"
import { EXAM_TYPES } from "@/lib/types/exams"

export default async function BulkPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ reports?: string | string[] }>
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

  const { reports } = await searchParams
  const reportIds = Array.isArray(reports) ? reports : reports ? [reports] : []

  if (reportIds.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Bulk Print</h1>
        <p className="text-muted-foreground">No reports selected for printing.</p>
      </div>
    )
  }

  // Parse report IDs (format: classId-examType)
  const reportData = await Promise.all(
    reportIds.map(async (reportId) => {
      const [classId, examType] = reportId.split("-")
      if (!classId || !examType || !EXAM_TYPES.includes(examType as any)) {
        return null
      }

      try {
        const report = await getClassExamReport(classId, examType as any)
        return {
          classId,
          examType,
          report,
        }
      } catch (error) {
        console.error(`Error loading report ${reportId}:`, error)
        return null
      }
    })
  )

  const validReports = reportData.filter((r): r is NonNullable<typeof r> => r !== null)

  return <BulkPrintView reports={validReports} />
}
