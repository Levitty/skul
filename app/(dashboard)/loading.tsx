export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-48 bg-neutral-200 rounded-lg" />
          <div className="h-4 w-72 bg-neutral-100 rounded-lg mt-2" />
        </div>
        <div className="h-10 w-32 bg-neutral-200 rounded-lg" />
      </div>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border border-neutral-200 bg-white p-5">
            <div className="h-4 w-24 bg-neutral-100 rounded" />
            <div className="h-8 w-16 bg-neutral-200 rounded mt-3" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-neutral-200 bg-white p-6">
        <div className="h-5 w-40 bg-neutral-200 rounded mb-4" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-neutral-50 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  )
}
