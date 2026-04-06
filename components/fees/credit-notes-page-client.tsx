"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { ArrowLeft, Plus } from "lucide-react"
import { CreditNotesTable } from "./credit-notes-table"
import { IssueCreditNoteForm } from "./issue-credit-note-form"

interface CreditNotesPageClientProps {
  creditNotes: any[]
  invoices: any[]
  students: any[]
}

export function CreditNotesPageClient({
  creditNotes,
  invoices,
  students,
}: CreditNotesPageClientProps) {
  const [activeTab, setActiveTab] = useState("list")
  const [filterStatus, setFilterStatus] = useState<string | null>(null)
  const [filterStudent, setFilterStudent] = useState<string | null>(null)

  // Calculate statistics
  const draftCount = creditNotes.filter((cn) => cn.status === "draft").length
  const approvedCount = creditNotes.filter((cn) => cn.status === "approved").length
  const appliedCount = creditNotes.filter((cn) => cn.status === "applied").length
  const totalAmount = creditNotes
    .filter((cn) => cn.status !== "voided")
    .reduce((sum, cn) => sum + Number(cn.amount || 0), 0)

  // Filter credit notes
  const filteredCreditNotes = creditNotes.filter((cn) => {
    let matches = true
    if (filterStatus && cn.status !== filterStatus) matches = false
    if (filterStudent && cn.student_id !== filterStudent) matches = false
    return matches
  })

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-neutral-900 mb-2">
            Credit Notes
          </h1>
          <p className="text-lg text-neutral-500">
            Manage discounts, refunds, and billing corrections
          </p>
        </div>
        <Link href="/dashboard/accountant/fees">
          <Button variant="outline" className="h-11 px-6">
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Fees
          </Button>
        </Link>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border border-neutral-200 shadow-sm hover:shadow-md transition-all">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription className="text-neutral-600">Draft</CardDescription>
              <div className="p-2 rounded-lg bg-neutral-100 text-neutral-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
            <CardTitle className="text-3xl text-neutral-900">{draftCount}</CardTitle>
          </CardHeader>
        </Card>

        <Card className="border border-neutral-200 shadow-sm hover:shadow-md transition-all">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription className="text-neutral-600">Pending Approval</CardDescription>
              <div className="p-2 rounded-lg bg-neutral-100 text-neutral-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <CardTitle className="text-3xl text-neutral-900">{approvedCount}</CardTitle>
          </CardHeader>
        </Card>

        <Card className="border border-neutral-200 shadow-sm hover:shadow-md transition-all">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription className="text-neutral-600">Applied</CardDescription>
              <div className="p-2 rounded-lg bg-neutral-100 text-neutral-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <CardTitle className="text-3xl text-neutral-900">{appliedCount}</CardTitle>
          </CardHeader>
        </Card>

        <Card className="border border-neutral-200 shadow-sm hover:shadow-md transition-all">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription className="text-neutral-600">Total Amount</CardDescription>
              <div className="p-2 rounded-lg bg-neutral-100 text-neutral-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <CardTitle className="text-3xl text-neutral-900">KES {(totalAmount / 1000).toFixed(1)}K</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="list">Credit Notes List</TabsTrigger>
          <TabsTrigger value="issue">Issue New Credit Note</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          {/* Filters */}
          <Card className="border border-neutral-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Filters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="status-filter">Status</Label>
                  <select
                    id="status-filter"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    value={filterStatus || ""}
                    onChange={(e) => setFilterStatus(e.target.value || null)}
                  >
                    <option value="">All Statuses</option>
                    <option value="draft">Draft</option>
                    <option value="approved">Approved</option>
                    <option value="applied">Applied</option>
                    <option value="voided">Voided</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="student-filter">Student</Label>
                  <select
                    id="student-filter"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    value={filterStudent || ""}
                    onChange={(e) => setFilterStudent(e.target.value || null)}
                  >
                    <option value="">All Students</option>
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.first_name} {student.last_name} ({student.admission_number})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Credit Notes Table */}
          <CreditNotesTable creditNotes={filteredCreditNotes} />
        </TabsContent>

        <TabsContent value="issue" className="space-y-4">
          <IssueCreditNoteForm invoices={invoices} students={students} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
