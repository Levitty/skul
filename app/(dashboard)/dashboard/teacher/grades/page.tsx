import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { GradesPageClient } from "@/components/grades/grades-page-client"
import { getExams, getExamSessions, getGradesStatistics, getTopPerformers, getSubjectPerformance } from "@/lib/actions/exams"

export default async function GradesPage() {
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

  // Load data with error handling
  let classes: any[] = []
  let currentYear: any = null
  let academicYears: any[] = []
  let exams: any[] = []
  let sessions: any[] = []
  let statistics: any = null
  let topPerformers: any[] = []
  let subjectPerformance: any[] = []
  let dataErrors: string[] = []

  try {
    const { data: classesData, error: classesError } = await supabase
      .from("classes")
      .select("*")
      .eq("school_id", context.schoolId)
      .order("level", { ascending: true })
    
    if (classesError) {
      console.error("Error loading classes:", classesError)
      dataErrors.push(`Classes: ${classesError.message}`)
    } else {
      classes = classesData || []
    }
  } catch (error: any) {
    console.error("Error loading classes:", error)
    dataErrors.push(`Classes: ${error.message || "Unknown error"}`)
  }

  try {
    const { data: currentYearData, error: currentYearError } = await supabase
      .from("academic_years")
      .select("id, name")
      .eq("school_id", context.schoolId)
      .eq("is_current", true)
      .single()
    
    if (!currentYearError) {
      currentYear = currentYearData
    }
  } catch (error: any) {
    console.error("Error loading current academic year:", error)
    // Not critical, continue without it
  }

  try {
    const { data: academicYearsData, error: academicYearsError } = await supabase
      .from("academic_years")
      .select("id, name")
      .eq("school_id", context.schoolId)
      .order("start_date", { ascending: false })
    
    if (academicYearsError) {
      console.error("Error loading academic years:", academicYearsError)
      dataErrors.push(`Academic Years: ${academicYearsError.message}`)
    } else {
      academicYears = academicYearsData || []
    }
  } catch (error: any) {
    console.error("Error loading academic years:", error)
    dataErrors.push(`Academic Years: ${error.message || "Unknown error"}`)
  }

  try {
    const examsResult = await getExams()
    if (examsResult.error) {
      console.error("Error loading exams:", examsResult.error)
      dataErrors.push(`Exams: ${examsResult.error}`)
    } else {
      exams = examsResult.data || []
    }
  } catch (error: any) {
    console.error("Error loading exams:", error)
    dataErrors.push(`Exams: ${error.message || "Unknown error"}`)
  }

  try {
    const sessionsResult = await getExamSessions()
    if (sessionsResult.error) {
      console.error("Error loading exam sessions:", sessionsResult.error)
      dataErrors.push(`Exam Sessions: ${sessionsResult.error}`)
    } else {
      sessions = sessionsResult.data || []
    }
  } catch (error: any) {
    console.error("Error loading exam sessions:", error)
    dataErrors.push(`Exam Sessions: ${error.message || "Unknown error"}`)
  }

  try {
    statistics = await getGradesStatistics()
    topPerformers = await getTopPerformers(5)
    subjectPerformance = await getSubjectPerformance()
  } catch (error: any) {
    console.error("Error loading statistics:", error)
    // Use defaults if error
    statistics = {
      averageGrade: 'N/A',
      averagePercentage: 0,
      topPerformersCount: 0,
      needSupportCount: 0,
      gradedExamsCount: 0,
      totalExamsCount: 0,
      gradeDistribution: { A: 0, B: 0, C: 0, D: 0, F: 0 }
    }
    dataErrors.push(`Statistics: ${error.message || "Unknown error"}`)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-neutral-900 mb-2">
            Grades & Results
          </h1>
          <p className="text-lg text-neutral-500">
            Manage student grades and academic performance
          </p>
        </div>
      </div>

      {/* Error Messages */}
      {dataErrors.length > 0 && (
        <Card className="border-0 shadow-lg border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
          <CardContent className="pt-6">
            <div className="space-y-1">
              <p className="font-medium text-red-600 dark:text-red-400">Some data failed to load:</p>
              {dataErrors.map((error, index) => (
                <p key={index} className="text-sm text-red-600 dark:text-red-400">• {error}</p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content - Client Component */}
      <GradesPageClient
        exams={exams as any}
        sessions={sessions as any}
        classes={(classes || []) as Array<{ id: string; name: string }>}
        academicYears={(academicYears || []) as Array<{ id: string; name: string }>}
        currentAcademicYearId={currentYear?.id}
        statistics={statistics}
        topPerformers={topPerformers}
        subjectPerformance={subjectPerformance}
        overviewContent={
          <>
            {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="rounded-lg border border-neutral-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>Average Grade</CardDescription>
              <div className="p-2 rounded-lg bg-neutral-100 text-neutral-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
            </div>
            <CardTitle className="text-3xl">
              {statistics?.averagePercentage >= 90 ? 'A+' :
               statistics?.averagePercentage >= 85 ? 'A' :
               statistics?.averagePercentage >= 80 ? 'B+' :
               statistics?.averagePercentage >= 75 ? 'B' :
               statistics?.averagePercentage >= 70 ? 'C+' :
               statistics?.averagePercentage >= 65 ? 'C' :
               statistics?.averagePercentage >= 60 ? 'D+' :
               statistics?.averagePercentage >= 50 ? 'D' : 'F'}
            </CardTitle>
            <p className="text-xs text-neutral-600 font-medium">{statistics?.averagePercentage?.toFixed(1) || '0'}% overall</p>
          </CardHeader>
        </Card>

        <Card className="rounded-lg border border-neutral-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>Top Performers</CardDescription>
              <div className="p-2 rounded-lg bg-neutral-100 text-neutral-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
            </div>
            <CardTitle className="text-3xl">{statistics?.topPerformersCount || 0}</CardTitle>
            <p className="text-xs text-neutral-600 font-medium">Above 85%</p>
          </CardHeader>
        </Card>

        <Card className="rounded-lg border border-neutral-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>Need Support</CardDescription>
              <div className="p-2 rounded-lg bg-neutral-100 text-neutral-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>
            <CardTitle className="text-3xl">{statistics?.needSupportCount || 0}</CardTitle>
            <p className="text-xs text-neutral-600 font-medium">Below 50%</p>
          </CardHeader>
        </Card>

        <Card className="rounded-lg border border-neutral-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>Graded Exams</CardDescription>
              <div className="p-2 rounded-lg bg-neutral-100 text-neutral-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <CardTitle className="text-3xl">{statistics?.gradedExamsCount || 0}/{statistics?.totalExamsCount || 0}</CardTitle>
            <p className="text-xs text-neutral-600 font-medium">
              {statistics?.totalExamsCount > 0 
                ? Math.round((statistics.gradedExamsCount / statistics.totalExamsCount) * 100) 
                : 0}% complete
            </p>
          </CardHeader>
        </Card>
      </div>

      {/* Class Selection */}
      <Card className="rounded-lg border border-neutral-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl">Select Class</CardTitle>
          <CardDescription>Choose a class to view or enter grades</CardDescription>
        </CardHeader>
        <CardContent>
          {classes.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-neutral-500 mb-4">No classes found. Please create classes first.</p>
              <Button variant="outline" asChild>
                <Link href="/dashboard/admin/setup/classes">Go to Classes Setup</Link>
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-4 lg:grid-cols-6">
              {classes.map((classItem: any) => (
                <Button
                  key={classItem.id}
                  variant="outline"
                  asChild
                  className="h-20 border-2 hover:border-neutral-300 hover:bg-neutral-50 transition-all group"
                >
                  <Link href={`/dashboard/teacher/grades/reports/${classItem.id}?examType=midterm`}>
                    <div className="text-center">
                      <div className="font-semibold text-lg mb-1">{classItem.name}</div>
                      <div className="text-xs text-neutral-500">View report</div>
                    </div>
                  </Link>
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Grade Distribution */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-lg border border-neutral-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Grade Distribution</CardTitle>
            <CardDescription>Performance breakdown across all students</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(() => {
              const dist = statistics?.gradeDistribution || { A: 0, B: 0, C: 0, D: 0, F: 0 }
              const total = dist.A + dist.B + dist.C + dist.D + dist.F
              const items = [
                { grade: "A", range: "90-100%", count: dist.A, color: "bg-neutral-800", percentage: total > 0 ? Math.round((dist.A / total) * 100) : 0 },
                { grade: "B", range: "80-89%", count: dist.B, color: "bg-neutral-700", percentage: total > 0 ? Math.round((dist.B / total) * 100) : 0 },
                { grade: "C", range: "70-79%", count: dist.C, color: "bg-neutral-600", percentage: total > 0 ? Math.round((dist.C / total) * 100) : 0 },
                { grade: "D", range: "60-69%", count: dist.D, color: "bg-neutral-500", percentage: total > 0 ? Math.round((dist.D / total) * 100) : 0 },
                { grade: "F", range: "0-59%", count: dist.F, color: "bg-neutral-400", percentage: total > 0 ? Math.round((dist.F / total) * 100) : 0 },
              ]
              return items
            })().map((item) => (
              <div key={item.grade} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-lg ${item.color} flex items-center justify-center text-white font-bold text-lg`}>
                      {item.grade}
                    </div>
                    <div>
                      <div className="font-medium">{item.range}</div>
                      <div className="text-sm text-neutral-500">{item.count} students</div>
                    </div>
                  </div>
                  <div className="text-2xl font-bold">{item.percentage}%</div>
                </div>
                <div className="w-full h-3 bg-neutral-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${item.color} transition-all duration-500`}
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-lg border border-neutral-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Top Performing Students</CardTitle>
            <CardDescription>Students with highest overall grades</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topPerformers.length > 0 ? topPerformers.map((student, index) => (
                <div
                  key={student.id}
                  className="flex items-center gap-4 p-4 rounded-lg border border-neutral-200 hover:border-neutral-300 hover:shadow-sm transition-all duration-200 bg-white"
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold ${
                    index === 0 ? "bg-neutral-800" :
                    index === 1 ? "bg-neutral-700" :
                    index === 2 ? "bg-neutral-600" :
                    "bg-neutral-500"
                  }`}>
                    #{index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold">{student.name}</div>
                    <div className="text-sm text-neutral-500">{student.average}% overall • {student.class}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-neutral-900">{student.grade}</div>
                  </div>
                </div>
              )) : (
                <p className="text-center text-neutral-500 py-4">No performance data available yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Subject Performance */}
      <Card className="rounded-lg border border-neutral-200 bg-white shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Subject Performance</CardTitle>
              <CardDescription className="mt-1">Average grades by subject</CardDescription>
            </div>
            <Button variant="outline" size="sm">View Details</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {subjectPerformance.length > 0 ? subjectPerformance.slice(0, 6).map((subject, index) => {
              const colors = [
                "bg-neutral-800",
                "bg-neutral-700",
                "bg-neutral-600",
                "bg-neutral-500",
                "bg-neutral-400",
                "bg-neutral-300",
              ]
              return { ...subject, color: colors[index % colors.length] }
            }).map((subject) => (
              <Card
                key={subject.subject}
                className="rounded-lg border border-neutral-200 hover:border-neutral-300 hover:shadow-sm transition-all duration-200"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{subject.subject}</CardTitle>
                    <div className={`px-3 py-1 rounded-lg ${subject.color} text-white font-bold`}>
                      {subject.average}%
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${subject.color}`}
                      style={{ width: `${subject.average}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            )) : (
              <p className="text-center text-neutral-500 py-4 col-span-full">No subject performance data available yet</p>
            )}
          </div>
        </CardContent>
      </Card>
          </>
        }
      />
    </div>
  )
}
