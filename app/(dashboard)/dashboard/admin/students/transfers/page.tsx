import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Plus, ArrowRightLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default async function TransfersPage() {
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

  // Fetch transfers
  const { data: transfers, error: transfersError } = await supabase
    .from("student_transfers")
    .select(`
      *,
      students(id, first_name, last_name, admission_number),
      from_class:classes!student_transfers_from_class_id_fkey(id, name),
      to_class:classes!student_transfers_to_class_id_fkey(id, name)
    `)
    .or(`from_school_id.eq.${context.schoolId},to_school_id.eq.${context.schoolId}`)
    .order("transfer_date", { ascending: false })

  const transfersList = transfers || []
  const transfersIn = transfersList.filter((t: any) => (t as any).transfer_type === "transfer_in")
  const transfersOut = transfersList.filter((t: any) => (t as any).transfer_type === "transfer_out")

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/admin/students"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Students
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Student Transfers</h1>
          <p className="text-muted-foreground">
            Manage student transfers in and out
          </p>
        </div>
        <Link href="/dashboard/admin/students/transfers/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Transfer
          </Button>
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Transfers In */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600">
              <ArrowRightLeft className="w-5 h-5" />
              Transfers In ({transfersIn.length})
            </CardTitle>
            <CardDescription>
              Students transferred into this school
            </CardDescription>
          </CardHeader>
          <CardContent>
            {transfersIn.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No transfer-in records
              </p>
            ) : (
              <div className="space-y-3">
                {transfersIn.map((transfer: any) => (
                  <div
                    key={transfer.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div>
                      <p className="font-medium">
                        {transfer.students?.first_name} {transfer.students?.last_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        To: {transfer.to_class?.name || "N/A"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(transfer.transfer_date).toLocaleDateString()}
                      </p>
                    </div>
                    <Link href={`/dashboard/admin/students/${transfer.student_id}`}>
                      <Button variant="ghost" size="sm">View</Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Transfers Out */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-600">
              <ArrowRightLeft className="w-5 h-5" />
              Transfers Out ({transfersOut.length})
            </CardTitle>
            <CardDescription>
              Students transferred out of this school
            </CardDescription>
          </CardHeader>
          <CardContent>
            {transfersOut.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No transfer-out records
              </p>
            ) : (
              <div className="space-y-3">
                {transfersOut.map((transfer: any) => (
                  <div
                    key={transfer.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div>
                      <p className="font-medium">
                        {transfer.students?.first_name} {transfer.students?.last_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        From: {transfer.from_class?.name || "N/A"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(transfer.transfer_date).toLocaleDateString()}
                      </p>
                      {transfer.reason && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Reason: {transfer.reason}
                        </p>
                      )}
                    </div>
                    <Link href={`/dashboard/admin/students/${transfer.student_id}`}>
                      <Button variant="ghost" size="sm">View</Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

