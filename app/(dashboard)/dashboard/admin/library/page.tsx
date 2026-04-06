import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { LibraryClient } from "@/components/library/library-client"

export default async function LibraryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }

  const { data: books } = await supabase
    .from("library_books")
    .select("*")
    .eq("school_id", context.schoolId)
    .order("title")

  const { data: activeTransactions } = await supabase
    .from("library_transactions")
    .select("*, library_books(title), students(first_name, last_name, admission_number), employees(first_name, last_name)")
    .eq("school_id", context.schoolId)
    .in("status", ["issued", "overdue"])
    .order("due_date", { ascending: true })

  const { data: students } = await supabase
    .from("students")
    .select("id, first_name, last_name, admission_number")
    .eq("school_id", context.schoolId)
    .eq("status", "active")
    .order("first_name")

  const { data: employees } = await supabase
    .from("employees")
    .select("id, first_name, last_name, role")
    .eq("school_id", context.schoolId)
    .eq("is_active", true)
    .order("first_name")

  return (
    <LibraryClient
      initialBooks={books || []}
      initialTransactions={activeTransactions || []}
      students={students || []}
      employees={employees || []}
    />
  )
}
