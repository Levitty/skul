import { createClient } from "./server"

/**
 * Helper to ensure RLS policies are applied
 * All queries should go through tenant-aware functions
 */
export async function withTenant<T>(
  schoolId: string,
  queryFn: (supabase: Awaited<ReturnType<typeof createClient>>) => Promise<T>
): Promise<T> {
  const supabase = await createClient()
  
  // Set the tenant context in the request
  // This will be used by RLS policies
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error("Unauthorized")
  }

  // Verify user has access to this school
  const { data: userSchool } = await supabase
    .from("user_schools")
    .select("school_id")
    .eq("user_id", user.id)
    .eq("school_id", schoolId)
    .single()

  if (!userSchool) {
    throw new Error("Access denied to this school")
  }

  return queryFn(supabase)
}

