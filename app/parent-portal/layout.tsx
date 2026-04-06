import Link from "next/link"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export default async function ParentPortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-gray-950">
      <header className="border-b bg-white dark:bg-gray-900 shadow-sm">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-purple-600 flex items-center justify-center text-white font-bold text-sm">
              T
            </div>
            <h1 className="text-lg font-bold text-purple-600">Parent Portal</h1>
          </div>
          <nav className="flex items-center gap-6">
            <Link
              href="/parent-portal"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/parent-portal/children"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Children
            </Link>
            <Link
              href="/parent-portal/fees"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Fees
            </Link>
            <Link
              href="/parent-portal/grades"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Grades
            </Link>
            <Link
              href="/parent-portal/attendance"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Attendance
            </Link>
            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors ml-2 border-l pl-4"
            >
              Logout
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl w-full px-4 py-6 flex-1">{children}</main>
      <footer className="py-4 text-center text-xs text-muted-foreground border-t bg-white dark:bg-gray-900">
        Powered by Tuta Educators
      </footer>
    </div>
  )
}
