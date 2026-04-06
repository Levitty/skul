import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { FeeStructureForm } from "@/components/fees/fee-structure-form"

export default async function EditFeeStructurePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
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

  // Fetch fee structure
  const { data: feeStructure } = await supabase
    .from("fee_structures")
    .select("*")
    .eq("id", id)
    .eq("school_id", context.schoolId)
    .single()

  if (!feeStructure) {
    redirect("/dashboard/accountant/fees")
  }

  // Fetch classes and terms
  const [{ data: classes }, { data: terms }] = await Promise.all([
    supabase
      .from("classes")
      .select("id, name, level")
      .eq("school_id", context.schoolId)
      .order("level", { ascending: true }),
    supabase
      .from("terms")
      .select("id, name")
      .eq("school_id", context.schoolId)
      .order("created_at", { ascending: false }),
  ])

  return <FeeStructureForm classes={classes || []} terms={terms || []} feeStructure={feeStructure} />
}


