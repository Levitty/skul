import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Building2, GraduationCap, Users2, Calendar, ChevronRight, GitBranch, ScrollText, Link2, Copy } from "lucide-react"

export default async function SchoolSetupPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Check if user has a school
  const { data: userSchool } = await supabase
    .from("user_schools")
    .select("school_id")
    .eq("user_id", user.id)
    .single()

  // If user doesn't have a school, redirect to create school page
  if (!userSchool) {
    redirect("/dashboard/admin/school-setup/new")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/dashboard/admin/school-setup/new")
  }

  // Fetch school data and counts
  const [
    { data: school },
    { count: classesCount },
    { count: sectionsCount },
    { count: academicYearsCount },
    { count: branchesCount },
    { data: currentYear },
    { data: currentTerm },
  ] = await Promise.all([
    supabase
      .from("schools")
      .select("*")
      .eq("id", context.schoolId)
      .single(),
    supabase
      .from("classes")
      .select("id", { count: "exact", head: true })
      .eq("school_id", context.schoolId),
    supabase
      .from("sections")
      .select("id, classes!inner(school_id)", { count: "exact", head: true })
      .eq("classes.school_id", context.schoolId),
    supabase
      .from("academic_years")
      .select("id", { count: "exact", head: true })
      .eq("school_id", context.schoolId),
    supabase
      .from("school_branches")
      .select("id", { count: "exact", head: true })
      .eq("school_id", context.schoolId),
    supabase
      .from("academic_years")
      .select("name")
      .eq("school_id", context.schoolId)
      .eq("is_current", true)
      .single(),
    supabase
      .from("terms")
      .select("name")
      .eq("school_id", context.schoolId)
      .eq("is_current", true)
      .single(),
  ])

  const setupItems = [
    {
      title: "School Profile",
      description: "Update school name, logo, address, and contact information",
      href: "/dashboard/admin/school-setup/profile",
      icon: Building2,
      color: "from-blue-500 to-indigo-600",
      bgColor: "from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30",
      stats: (school as any)?.name || "Not configured",
      status: (school as any)?.logo_url ? "complete" : "incomplete",
    },
    {
      title: "Classes",
      description: "Manage grade levels and class structures",
      href: "/dashboard/admin/school-setup/classes",
      icon: GraduationCap,
      color: "from-emerald-500 to-teal-600",
      bgColor: "from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30",
      stats: `${classesCount || 0} classes`,
      status: (classesCount || 0) > 0 ? "complete" : "incomplete",
    },
    {
      title: "Sections",
      description: "Create and manage class sections (A, B, C, etc.)",
      href: "/dashboard/admin/school-setup/sections",
      icon: Users2,
      color: "from-purple-500 to-pink-600",
      bgColor: "from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30",
      stats: `${sectionsCount || 0} sections`,
      status: (sectionsCount || 0) > 0 ? "complete" : "incomplete",
    },
    {
      title: "Academic Years & Terms",
      description: "Configure academic years, terms, and due dates",
      href: "/dashboard/admin/school-setup/academic-years",
      icon: Calendar,
      color: "from-amber-500 to-orange-600",
      bgColor: "from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30",
      stats: `${academicYearsCount || 0} years`,
      status: (academicYearsCount || 0) > 0 ? "complete" : "incomplete",
    },
    {
      title: "Branches",
      description: "Manage school branches and assign branch admins",
      href: "/dashboard/admin/school-setup/branches",
      icon: GitBranch,
      color: "from-cyan-500 to-blue-600",
      bgColor: "from-cyan-50 to-blue-50 dark:from-cyan-950/30 dark:to-blue-950/30",
      stats: `${branchesCount || 0} branches`,
      status: "complete", // Branches are optional
    },
    {
      title: "Admission Rules",
      description: "Set rules and regulations parents must accept when applying",
      href: "/dashboard/admin/school-setup/admission-rules",
      icon: ScrollText,
      color: "from-rose-500 to-pink-600",
      bgColor: "from-rose-50 to-pink-50 dark:from-rose-950/30 dark:to-pink-950/30",
      stats: "Configure rules",
      status: "complete", // Optional
    },
  ]

  const completedCount = setupItems.filter(item => item.status === "complete").length
  const progressPercent = (completedCount / setupItems.length) * 100

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-neutral-900 mb-2">
            School Setup
          </h1>
          <p className="text-lg text-neutral-500">
            Configure your school settings and structure
          </p>
        </div>
      </div>

      {/* Current Status Card */}
      <Card className="border border-neutral-200 bg-neutral-900 text-white shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/80 text-sm font-medium">Current Academic Context</p>
              <h3 className="text-2xl font-bold mt-1">
                {(currentYear as any)?.name || "No academic year set"}
                {(currentTerm as any)?.name && ` - ${(currentTerm as any).name}`}
              </h3>
              <p className="text-white/70 mt-2 text-sm">
                {(school as any)?.name || "School name not configured"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-white/80 text-sm font-medium">Setup Progress</p>
              <p className="text-4xl font-bold">{completedCount}/{setupItems.length}</p>
              <div className="w-32 h-2 bg-white/20 rounded-full mt-2 overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Setup Items Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {setupItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="border border-neutral-200 shadow-sm hover:shadow-md transition-all duration-300 group cursor-pointer h-full">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="p-2 rounded-lg bg-neutral-100 text-neutral-600 group-hover:scale-105 transition-transform">
                    <item.icon className="w-6 h-6" />
                  </div>
                  <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                    item.status === "complete"
                      ? "bg-neutral-100 text-neutral-700"
                      : "bg-neutral-200 text-neutral-700"
                  }`}>
                    {item.status === "complete" ? "Configured" : "Needs Setup"}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <CardTitle className="text-xl mb-2 group-hover:text-neutral-900 transition-colors">
                  {item.title}
                </CardTitle>
                <CardDescription className="mb-4">
                  {item.description}
                </CardDescription>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-neutral-500">
                    {item.stats}
                  </span>
                  <ChevronRight className="w-5 h-5 text-neutral-500 group-hover:text-neutral-900 group-hover:translate-x-1 transition-all" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Public Admission Link */}
      {(school as any)?.code && (
        <Card className="border border-neutral-200 shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Link2 className="w-5 h-5" />
              Public Admission Portal
            </CardTitle>
            <CardDescription>Share this link with parents or use it on a front-office kiosk</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <code className="flex-1 px-4 py-2.5 bg-neutral-50 rounded-lg border border-neutral-200 text-sm font-mono truncate">
                {typeof window !== "undefined" ? window.location.origin : ""}/apply/{(school as any).code}
              </code>
            </div>
            <p className="text-xs text-neutral-500">
              Append <code className="bg-neutral-100 px-1 py-0.5 rounded text-xs">?kiosk=true</code> for kiosk mode (shows a &ldquo;New Application&rdquo; button after each submission).
            </p>
          </CardContent>
        </Card>
      )}

      {/* Quick Tips */}
      <Card className="border border-neutral-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl">Getting Started</CardTitle>
          <CardDescription>Follow these steps to set up your school</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { step: 1, text: "Start by configuring your school profile with name, logo, and contact details", done: !!(school as any)?.name },
              { step: 2, text: "Create your class structure (Grade 1, Grade 2, etc.)", done: (classesCount || 0) > 0 },
              { step: 3, text: "Add sections to each class (Section A, Section B, etc.)", done: (sectionsCount || 0) > 0 },
              { step: 4, text: "Set up academic years and terms with fee due dates", done: (academicYearsCount || 0) > 0 },
            ].map((step) => (
              <div key={step.step} className="flex items-start gap-4">
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                  step.done
                    ? "bg-neutral-200 text-neutral-700"
                    : "bg-neutral-100 text-neutral-600"
                }`}>
                  {step.done ? "•" : step.step}
                </div>
                <p className={`text-sm pt-1.5 ${step.done ? "text-neutral-500 line-through" : "text-neutral-900"}`}>
                  {step.text}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

