import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { StudentPortalDashboard } from "@/components/student-portal/student-dashboard"

export default async function StudentPortalPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data: student } = await (supabase as any)
    .from("students")
    .select("*, guardians(name, phone, email, is_primary)")
    .eq("user_id", user.id)
    .single()

  if (!student) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4">
          <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold mb-2">No Student Record Found</h2>
        <p className="text-muted-foreground max-w-md">
          Your account is not linked to a student record yet. Please contact your school administrator to get set up.
        </p>
      </div>
    )
  }

  const st = student as any
  const guardians = (st.guardians as any[]) || []
  const primaryGuardian = guardians.find((g: any) => g.is_primary) || guardians[0]

  const { data: enrollments } = await (supabase as any)
    .from("enrollments")
    .select("*, sections(name), classes(name)")
    .eq("student_id", st.id)
    .order("created_at", { ascending: false })
    .limit(1)

  const currentEnrollment = (enrollments as any[])?.[0] ?? null
  const sectionName = (currentEnrollment?.sections as { name: string } | null)?.name ?? null
  const className = (currentEnrollment?.classes as { name: string } | null)?.name ?? "N/A"

  const { data: invoices } = await (supabase as any)
    .from("invoices")
    .select("amount, status")
    .eq("student_id", st.id)

  const feeSummary = {
    totalInvoiced: 0,
    totalPaid: 0,
    balance: 0,
  }

  if (invoices) {
    for (const inv of (invoices as any[])) {
      const amt = Number(inv.amount) || 0
      feeSummary.totalInvoiced += amt
      if (inv.status === "paid") {
        feeSummary.totalPaid += amt
      } else if (inv.status === "partial") {
        feeSummary.totalPaid += amt * 0.5
      }
    }
    feeSummary.balance = feeSummary.totalInvoiced - feeSummary.totalPaid
  }

  return (
    <StudentPortalDashboard
      student={{
        id: st.id,
        firstName: st.first_name,
        lastName: st.last_name,
        admissionNumber: st.admission_number,
        className,
        sectionName: sectionName ?? "N/A",
        photoUrl: st.photo_url,
        dateOfBirth: st.dob,
        gender: st.gender,
        parentName: primaryGuardian?.name ?? "N/A",
        parentPhone: primaryGuardian?.phone ?? "N/A",
      }}
      feeSummary={feeSummary}
    />
  )
}
