import Link from "next/link"

export default function StudentPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-gray-950">
      <header className="border-b bg-white dark:bg-gray-900 shadow-sm">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
              T
            </div>
            <h1 className="text-lg font-bold text-blue-600">Student Portal</h1>
          </div>
          <nav className="flex items-center gap-4">
            <Link
              href="/student-portal"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/student-portal/invoices"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Invoices
            </Link>
            <Link
              href="/student-portal/grades"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Grades
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
