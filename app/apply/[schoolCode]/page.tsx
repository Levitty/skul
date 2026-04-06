import { createServiceRoleClient } from "@/lib/supabase/server"
import { PublicApplicationForm } from "@/components/admissions/public-application-form"

export default async function PublicApplyPage({
  params,
  searchParams,
}: {
  params: Promise<{ schoolCode: string }>
  searchParams: Promise<{ kiosk?: string }>
}) {
  const { schoolCode } = await params
  const { kiosk } = await searchParams
  const isKiosk = kiosk === "true"

  const supabase = createServiceRoleClient() as any

  const { data: school, error: schoolError } = await supabase
    .from("schools")
    .select("id, name, code, address, phone, email, logo_url, is_active")
    .eq("code", schoolCode)
    .single()

  if (schoolError || !school || !(school as any).is_active) {
    return (
      <div className="text-center py-20">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          School Not Found
        </h1>
        <p className="text-muted-foreground max-w-md mx-auto">
          The school you are looking for does not exist or is not currently accepting applications.
          Please check the link and try again.
        </p>
      </div>
    )
  }

  const schoolId = (school as any).id

  const [{ data: classes }, { data: rulesSetting }] = await Promise.all([
    supabase
      .from("classes")
      .select("id, name, level")
      .eq("school_id", schoolId)
      .order("level", { ascending: true }),
    supabase
      .from("school_settings")
      .select("setting_value")
      .eq("school_id", schoolId)
      .eq("setting_key", "admission_rules")
      .single(),
  ])

  const admissionRules = (rulesSetting as any)?.setting_value?.text || null

  return (
    <PublicApplicationForm
      school={{
        code: (school as any).code,
        name: (school as any).name,
        address: (school as any).address,
        phone: (school as any).phone,
        email: (school as any).email,
        logoUrl: (school as any).logo_url,
      }}
      classes={(classes || []).map((c: any) => ({ id: c.id, name: c.name }))}
      admissionRules={admissionRules}
      isKiosk={isKiosk}
    />
  )
}
