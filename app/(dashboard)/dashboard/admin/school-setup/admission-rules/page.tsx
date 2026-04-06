import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import { AdmissionRulesEditor } from "@/components/school-setup/admission-rules-editor"

export default async function AdmissionRulesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }

  const { data: rulesSetting } = await supabase
    .from("school_settings")
    .select("setting_value")
    .eq("school_id", context.schoolId)
    .eq("setting_key", "admission_rules")
    .single()

  const currentRules = (rulesSetting as any)?.setting_value?.text || ""

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Link href="/dashboard/admin/school-setup">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Setup
          </Button>
        </Link>
        <h1 className="mt-4 text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent mb-2">
          Admission Rules
        </h1>
        <p className="text-lg text-muted-foreground">
          Configure the rules parents must accept before applying
        </p>
      </div>

      <AdmissionRulesEditor currentRules={currentRules} />
    </div>
  )
}
