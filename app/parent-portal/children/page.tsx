import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES" }).format(amount)
}

export default async function ParentChildrenPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data: students } = await (supabase as any)
    .from("students")
    .select(
      `
      id,
      first_name,
      last_name,
      admission_number,
      photo_url,
      gender,
      dob,
      guardians (
        id,
        name,
        relation,
        is_primary,
        phone,
        email
      ),
      enrollments (
        id,
        sections (name),
        classes (name)
      ),
      invoices (
        amount,
        status
      )
    `
    )
    .eq("user_id", user.id)
    .order("first_name", { ascending: true })

  const studentList = (students as any[]) || []

  if (studentList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4">
          <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold mb-2">No Children Linked</h2>
        <p className="text-muted-foreground max-w-md">
          Your account is not linked to any students yet. Please contact your school administrator to get set up.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">My Children</h2>
          <p className="text-muted-foreground">
            Detailed information for {studentList.length} child{studentList.length !== 1 ? "ren" : ""}
          </p>
        </div>
        <Link
          href="/parent-portal"
          className="text-sm text-blue-600 hover:underline"
        >
          &larr; Back to Dashboard
        </Link>
      </div>

      <div className="grid gap-6">
        {studentList.map((student: any) => {
          const currentEnrollment = student.enrollments?.[0]
          const className = currentEnrollment?.classes?.name ?? "N/A"
          const sectionName = currentEnrollment?.sections?.name ?? "N/A"

          // Calculate fee summary
          const invoices = student.invoices || []
          let totalInvoiced = 0
          let totalPaid = 0

          for (const inv of invoices) {
            const amt = Number(inv.amount) || 0
            totalInvoiced += amt
            if (inv.status === "paid") {
              totalPaid += amt
            } else if (inv.status === "partial") {
              totalPaid += amt * 0.5
            }
          }

          const balance = totalInvoiced - totalPaid

          // Get guardians
          const guardians = student.guardians || []
          const primaryGuardian = guardians.find((g: any) => g.is_primary) || guardians[0]

          return (
            <Card key={student.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <CardTitle className="text-lg">
                        {student.first_name} {student.last_name}
                      </CardTitle>
                      <Badge variant="outline">{className}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Admission #: {student.admission_number}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {/* Personal Information */}
                  <div>
                    <h4 className="text-sm font-medium mb-2">Personal Information</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Gender</span>
                        <span className="font-medium capitalize">{student.gender || "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Date of Birth</span>
                        <span className="font-medium">
                          {student.dob ? new Date(student.dob).toLocaleDateString() : "—"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Academic Information */}
                  <div>
                    <h4 className="text-sm font-medium mb-2">Academic</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Class</span>
                        <span className="font-medium">{className}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Section</span>
                        <span className="font-medium">{sectionName}</span>
                      </div>
                    </div>
                  </div>

                  {/* Fee Information */}
                  <div>
                    <h4 className="text-sm font-medium mb-2">Fees</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Invoiced</span>
                        <span className="font-medium">{formatCurrency(totalInvoiced)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Outstanding</span>
                        <span className={`font-medium ${balance > 0 ? "text-red-600" : "text-emerald-600"}`}>
                          {formatCurrency(balance)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Guardian Information */}
                  <div>
                    <h4 className="text-sm font-medium mb-2">Primary Guardian</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Name</span>
                        <span className="font-medium">{primaryGuardian?.name || "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Relation</span>
                        <span className="font-medium capitalize">{primaryGuardian?.relation || "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Phone</span>
                        <span className="font-medium">{primaryGuardian?.phone || "—"}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* All Guardians */}
                {guardians.length > 0 && (
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-medium mb-3">All Guardians</h4>
                    <div className="space-y-2">
                      {guardians.map((guardian: any, index: number) => (
                        <div key={index} className="text-sm p-2 bg-gray-50 dark:bg-gray-900 rounded">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium">
                                {guardian.name}
                                {guardian.is_primary && (
                                  <Badge variant="secondary" className="ml-2 text-[10px]">
                                    Primary
                                  </Badge>
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {guardian.relation}
                              </p>
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {guardian.email && <p>{guardian.email}</p>}
                            {guardian.phone && <p>{guardian.phone}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Links */}
                <div className="flex gap-2 pt-2">
                  <Link
                    href={`/parent-portal/grades?child=${student.id}`}
                    className="flex-1 text-sm px-3 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors text-center font-medium"
                  >
                    View Grades
                  </Link>
                  <Link
                    href={`/parent-portal/fees?child=${student.id}`}
                    className="flex-1 text-sm px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors text-center font-medium"
                  >
                    View Fees
                  </Link>
                  <Link
                    href={`/parent-portal/attendance?child=${student.id}`}
                    className="flex-1 text-sm px-3 py-2 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors text-center font-medium"
                  >
                    View Attendance
                  </Link>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
