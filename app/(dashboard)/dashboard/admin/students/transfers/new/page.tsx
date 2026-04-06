import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { TransferStudentForm } from "@/components/students/transfer-student-form"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default async function NewTransferPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }

  // Fetch required data
  const [{ data: classes }, { data: students }] = await Promise.all([
    supabase
      .from("classes")
      .select("*")
      .eq("school_id", context.schoolId)
      .order("level", { ascending: true }),
    supabase
      .from("students")
      .select(`
        *,
        enrollments(
          id,
          class_id,
          classes(name)
        )
      `)
      .eq("school_id", context.schoolId)
      .eq("status", "active")
      .order("first_name", { ascending: true }),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/admin/students/transfers"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Transfers
        </Link>
      </div>

      <div>
        <h1 className="text-3xl font-bold">New Student Transfer</h1>
        <p className="text-muted-foreground">
          Record a student transfer in or out
        </p>
      </div>

      <TransferStudentForm
        classes={classes || []}
        students={students || []}
        schoolId={context.schoolId}
      />
    </div>
  )
}



