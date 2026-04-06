"use server"

import { createClient } from "@/lib/supabase/server"
import { getTenantContext } from "@/lib/supabase/tenant-context"
import { createServiceRoleClient } from "@/lib/supabase/server"

export interface DiagnosticResult {
  hasAuth: boolean
  hasSchoolAssociation: boolean
  schoolId: string | null
  role: string | null
  userId: string | null
  userEmail: string | null
  schoolsAvailable: Array<{ id: string; name: string; code: string }>
  error?: string
}

export async function runDiagnostics(): Promise<DiagnosticResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return {
        hasAuth: false,
        hasSchoolAssociation: false,
        schoolId: null,
        role: null,
        userId: null,
        userEmail: null,
        schoolsAvailable: [],
        error: "Not authenticated. Please log in.",
      }
    }

    // Get tenant context
    const context = await getTenantContext(user.id)

    // Get available schools
    const serviceClient = createServiceRoleClient() as any
    const { data: schools } = await serviceClient
      .from("schools")
      .select("id, name, code")
      .limit(10)

    return {
      hasAuth: true,
      hasSchoolAssociation: !!context,
      schoolId: context?.schoolId || null,
      role: context?.role || null,
      userId: user.id,
      userEmail: user.email || null,
      schoolsAvailable: (schools as any[]) || [],
    }
  } catch (error: any) {
    return {
      hasAuth: false,
      hasSchoolAssociation: false,
      schoolId: null,
      role: null,
      userId: null,
      userEmail: null,
      schoolsAvailable: [],
      error: error.message || "Unknown error occurred",
    }
  }
}
