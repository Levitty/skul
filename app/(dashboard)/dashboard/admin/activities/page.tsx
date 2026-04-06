import { getActivities, getActivityStats } from "@/lib/actions/activities"
import { ActivitiesManager } from "@/components/activities/activities-manager"

export default async function ActivitiesPage() {
  const [activitiesResult, statsResult] = await Promise.all([
    getActivities(),
    getActivityStats(),
  ])

  const activities = (activitiesResult as any).data || []
  const stats = (statsResult as any).data || { totalActivities: 0, activeActivities: 0, totalEnrollments: 0 }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Activities & Extracurriculars</h1>
        <p className="text-muted-foreground">
          Manage school activities, clubs, and extracurricular programs
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-xl p-5">
          <div className="text-3xl font-bold">{stats.totalActivities}</div>
          <div className="text-sm opacity-90">Total Activities</div>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl p-5">
          <div className="text-3xl font-bold">{stats.activeActivities}</div>
          <div className="text-sm opacity-90">Active Activities</div>
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl p-5">
          <div className="text-3xl font-bold">{stats.totalEnrollments}</div>
          <div className="text-sm opacity-90">Students Enrolled</div>
        </div>
      </div>

      {/* Activities Manager */}
      <ActivitiesManager activities={activities} />
    </div>
  )
}
