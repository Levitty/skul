"use client"

import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface StudentInfo {
  id: string
  firstName: string
  lastName: string
  admissionNumber: string
  className: string
  sectionName: string
  photoUrl: string | null
  dateOfBirth: string
  gender: string
  parentName: string | null
  parentPhone: string
}

interface FeeSummary {
  totalInvoiced: number
  totalPaid: number
  balance: number
}

interface StudentPortalDashboardProps {
  student: StudentInfo
  feeSummary: FeeSummary
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES" }).format(amount)
}

export function StudentPortalDashboard({ student, feeSummary }: StudentPortalDashboardProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Welcome, {student.firstName} {student.lastName}
        </h2>
        <p className="text-muted-foreground">
          Here&apos;s an overview of your student information
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* My Profile */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </div>
              <CardTitle className="text-base">My Profile</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium">{student.firstName} {student.lastName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Admission No.</span>
              <span className="font-medium">{student.admissionNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Class</span>
              <span className="font-medium">{student.className}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Section</span>
              <span className="font-medium">{student.sectionName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Gender</span>
              <span className="font-medium capitalize">{student.gender}</span>
            </div>
          </CardContent>
        </Card>

        {/* Fee Summary */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                </svg>
              </div>
              <CardTitle className="text-base">Fee Summary</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Invoiced</span>
              <span className="font-medium">{formatCurrency(feeSummary.totalInvoiced)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Paid</span>
              <span className="font-medium text-emerald-600">{formatCurrency(feeSummary.totalPaid)}</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="text-muted-foreground font-medium">Balance</span>
              <span className={`font-semibold ${feeSummary.balance > 0 ? "text-red-600" : "text-emerald-600"}`}>
                {formatCurrency(feeSummary.balance)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Attendance */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <svg className="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
              </div>
              <CardTitle className="text-base">Attendance</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription>Attendance tracking coming soon.</CardDescription>
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Quick Links</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickLink
            href="/student-portal/invoices"
            label="My Invoices"
            description="View and track fee invoices"
            color="emerald"
          />
          <QuickLink
            href="/student-portal/grades"
            label="My Grades"
            description="View exam results and grades"
            color="blue"
          />
          <QuickLink
            href="#"
            label="My Assignments"
            description="Coming soon"
            color="violet"
            disabled
          />
          <QuickLink
            href="#"
            label="Timetable"
            description="Coming soon"
            color="amber"
            disabled
          />
        </div>
      </div>

      {/* Guardian Info */}
      {student.parentName && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Guardian Information</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Parent / Guardian</span>
              <span className="font-medium">{student.parentName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phone</span>
              <span className="font-medium">{student.parentPhone}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function QuickLink({
  href,
  label,
  description,
  color,
  disabled,
}: {
  href: string
  label: string
  description: string
  color: "emerald" | "blue" | "violet" | "amber"
  disabled?: boolean
}) {
  const colorMap = {
    emerald: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600",
    blue: "bg-blue-100 dark:bg-blue-900/30 text-blue-600",
    violet: "bg-violet-100 dark:bg-violet-900/30 text-violet-600",
    amber: "bg-amber-100 dark:bg-amber-900/30 text-amber-600",
  }

  const content = (
    <Card className={`transition-shadow ${disabled ? "opacity-60" : "hover:shadow-md cursor-pointer"}`}>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${colorMap[color]}`}>
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </div>
        <div>
          <p className="font-medium text-sm">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {disabled && <Badge variant="secondary" className="ml-auto text-[10px]">Soon</Badge>}
      </CardContent>
    </Card>
  )

  if (disabled) return content

  return <Link href={href}>{content}</Link>
}
