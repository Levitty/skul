import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TimetableManager } from "@/components/timetable/timetable-manager"
import { getTimetableSlots, getPeriods, getAvailableTeachers, getRooms, getSubjects, getTimetable } from "@/lib/actions/timetable"

export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }

  // Use service role client for data reads to bypass RLS issues
  const adminClient = createServiceRoleClient()

  // Fetch required data
  const { data: classes } = await adminClient
    .from("classes")
    .select("*")
    .eq("school_id", context.schoolId)
    .order("level", { ascending: true })

  const { data: academicYear } = await adminClient
    .from("academic_years")
    .select("*")
    .eq("school_id", context.schoolId)
    .eq("is_current", true)
    .single()

  // Get periods, teachers, rooms, subjects
  const { data: periods } = await getPeriods()
  const { data: teachers } = await getAvailableTeachers()
  const { data: rooms } = await getRooms()
  const { data: subjects } = await getSubjects()

  // Determine selected class (from URL param or default to first)
  const selectedClassId = params.classId || (classes?.[0] as any)?.id
  const selectedClass = classes?.find((c: any) => c.id === selectedClassId) || classes?.[0]

  // Get or create timetable for current academic year
  let timetableId = ""
  let timetableEntries: any[] = []

  if (academicYear && selectedClass) {
    const timetableResult = await getTimetable((academicYear as any).id)
    if ((timetableResult as any).data) {
      timetableId = ((timetableResult as any).data as any).id
      const entriesResult = await getTimetableSlots((selectedClass as any).id)
      timetableEntries = entriesResult.data || []
    }
  }

  const classStats = classes?.length || 0
  const teacherStats = teachers?.length || 0
  const roomStats = rooms?.length || 0

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-neutral-900 mb-2">
            Timetable Management
          </h1>
          <p className="text-lg text-neutral-500">
            Create and manage class schedules
          </p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border border-neutral-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>Total Classes</CardDescription>
            <CardTitle className="text-3xl">{classStats}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border border-neutral-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>Periods/Day</CardDescription>
            <CardTitle className="text-3xl">{periods?.length || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border border-neutral-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>Available Rooms</CardDescription>
            <CardTitle className="text-3xl">{roomStats}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border border-neutral-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>Teachers</CardDescription>
            <CardTitle className="text-3xl">{teacherStats}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Main Content */}
      {!academicYear ? (
        <Card className="border border-neutral-200 shadow-sm">
          <CardHeader>
            <CardTitle>No Active Academic Year</CardTitle>
            <CardDescription>
              Please set an active academic year to manage timetables
            </CardDescription>
          </CardHeader>
        </Card>
      ) : !selectedClass ? (
        <Card className="border border-neutral-200 shadow-sm">
          <CardHeader>
            <CardTitle>No Classes Found</CardTitle>
            <CardDescription>
              Please create classes before managing timetables
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          {/* Class Selector */}
          <Card className="border border-neutral-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl">Select Class</CardTitle>
              <CardDescription>Choose a class to view or edit their timetable</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-4 lg:grid-cols-6">
                {classes?.map((classItem: any) => {
                  const isSelected = (selectedClass as any)?.id === classItem.id
                  return (
                    <Link
                      key={classItem.id}
                      href={`/dashboard/admin/timetable?classId=${classItem.id}`}
                      className={`h-16 flex items-center justify-center rounded-md border transition-all ${
                        isSelected
                          ? "bg-neutral-900 text-white border-neutral-900"
                          : "bg-white text-neutral-900 border-neutral-200 hover:border-neutral-400 hover:bg-neutral-50"
                      }`}
                    >
                      <div className="text-center">
                        <div className="font-semibold">{classItem.name}</div>
                        <div className={`text-xs ${isSelected ? "text-neutral-300" : "text-neutral-500"}`}>
                          Level {classItem.level}
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Timetable Manager */}
          <TimetableManager
            classId={(selectedClass as any).id}
            className={(selectedClass as any).name}
            timetableId={timetableId}
            initialEntries={timetableEntries}
            periods={periods || []}
            teachers={teachers || []}
            rooms={rooms || []}
            subjects={subjects || []}
          />
        </>
      )}
    </div>
  )
}
