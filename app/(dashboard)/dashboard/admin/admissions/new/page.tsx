import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { NewApplicationForm } from "@/components/admissions/new-application-form"

export default async function NewApplicationPage() {
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

  // Fetch classes for the select dropdown
  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, level")
    .eq("school_id", context.schoolId)
    .order("level", { ascending: true })

  return <NewApplicationForm classes={classes || []} />
}

