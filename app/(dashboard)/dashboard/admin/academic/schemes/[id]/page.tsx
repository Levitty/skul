import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect, notFound } from "next/navigation"
import { SchemeDetailClient } from "@/components/academic/scheme-detail-client"

export default async function SchemeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }

  const { data: scheme, error } = await supabase
    .from("schemes_of_work")
    .select("*, scheme_entries(*), subjects(name), classes(name), terms(name), employees(first_name, last_name)")
    .eq("id", id)
    .eq("school_id", context.schoolId)
    .single()

  if (error || !scheme) {
    notFound()
  }

  const entries = (scheme as any).scheme_entries || []
  const sortedEntries = entries.sort(
    (a: { week_number: number }, b: { week_number: number }) => a.week_number - b.week_number
  )

  return (
    <div className="p-6 space-y-6">
      <SchemeDetailClient
        scheme={{ ...(scheme as any), scheme_entries: sortedEntries }}
      />
    </div>
  )
}
