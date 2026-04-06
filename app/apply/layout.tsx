export default function ApplyLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-gray-950 dark:via-slate-950 dark:to-gray-900">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </div>
      <footer className="py-6 text-center text-xs text-muted-foreground">
        Powered by Tuta Educators
      </footer>
    </div>
  )
}
