"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, User, Users, GraduationCap, FileText, DollarSign, Calendar, File } from "lucide-react"
import { cn } from "@/lib/utils"

interface StudentDetailTabsProps {
  student: any
  guardians: any[]
  enrollments: any[]
  invoices: any[]
  payments: any[]
  recentAttendance: any[]
  documents: any[]
}

export function StudentDetailTabs({
  student,
  guardians,
  enrollments,
  invoices,
  payments,
  recentAttendance,
  documents,
}: StudentDetailTabsProps) {
  const [activeTab, setActiveTab] = useState("overview")

  const tabs = [
    { id: "overview", label: "Overview", icon: User },
    { id: "guardians", label: "Guardians", icon: Users },
    { id: "enrollments", label: "Enrollments", icon: GraduationCap },
    { id: "invoices", label: "Invoices", icon: FileText },
    { id: "payments", label: "Payments", icon: DollarSign },
    { id: "attendance", label: "Attendance", icon: Calendar },
    { id: "documents", label: "Documents", icon: File },
  ]

  const totalInvoiced = invoices.reduce((sum, inv) => sum + Number(inv.amount || 0), 0)
  const totalPaid = payments
    .filter(p => p.status === "completed")
    .reduce((sum, p) => sum + Number(p.amount || 0), 0)
  const balance = totalInvoiced - totalPaid

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard/admin/students">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
          <h1 className="mt-4 text-3xl font-bold">
            {student.first_name} {student.last_name}
          </h1>
          <p className="text-muted-foreground">
            {student.admission_number || "No admission number"}
          </p>
        </div>
        <Link href={`/dashboard/admin/students/${student.id}/edit`}>
          <Button>Edit Student</Button>
        </Link>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <nav className="flex space-x-8" aria-label="Tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 border-b-2 py-4 px-1 text-sm font-medium transition-colors",
                  activeTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === "overview" && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Student Information</CardTitle>
                <CardDescription>Basic student details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Full Name</p>
                  <p className="text-lg">
                    {student.first_name} {student.middle_name} {student.last_name}
                  </p>
                </div>
                {student.dob && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Date of Birth</p>
                    <p>{new Date(student.dob).toLocaleDateString()}</p>
                  </div>
                )}
                {student.gender && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Gender</p>
                    <p>{student.gender}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Status</p>
                  <span className={cn(
                    "inline-block rounded-full px-2 py-1 text-xs font-medium",
                    student.status === "active"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                      : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
                  )}>
                    {student.status}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Financial Summary</CardTitle>
                <CardDescription>Fee and payment overview</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Invoiced</p>
                  <p className="text-2xl font-bold">KES {totalInvoiced.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Paid</p>
                  <p className="text-2xl font-bold text-emerald-600">KES {totalPaid.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Balance</p>
                  <p className={cn(
                    "text-2xl font-bold",
                    balance > 0 ? "text-red-600" : "text-emerald-600"
                  )}>
                    KES {balance.toLocaleString()}
                  </p>
                </div>
                <Link href={`/dashboard/accountant/fees/statement/${student.id}`}>
                  <Button variant="outline" className="w-full mt-2">Fee Statement</Button>
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Stats</CardTitle>
                <CardDescription>At a glance</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Guardians</p>
                  <p className="text-2xl font-bold">{guardians.length}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Enrollments</p>
                  <p className="text-2xl font-bold">{enrollments.length}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Invoices</p>
                  <p className="text-2xl font-bold">{invoices.length}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Documents</p>
                  <p className="text-2xl font-bold">{documents.length}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "guardians" && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Guardians</CardTitle>
                  <CardDescription>Parent/guardian contacts</CardDescription>
                </div>
                <Link href={`/dashboard/admin/students/${student.id}/guardians/new`}>
                  <Button>Add Guardian</Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {guardians.length > 0 ? (
                <div className="space-y-4">
                  {guardians.map((guardian: any) => (
                    <div key={guardian.id} className="flex items-center justify-between rounded-lg border p-4">
                      <div>
                        <p className="font-medium">{guardian.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {guardian.relation}
                          {guardian.is_primary && " • Primary"}
                          {guardian.is_billing_contact && " • Billing Contact"}
                        </p>
                        {guardian.phone && (
                          <p className="text-sm mt-1">{guardian.phone}</p>
                        )}
                        {guardian.email && (
                          <p className="text-sm">{guardian.email}</p>
                        )}
                      </div>
                      <Link href={`/dashboard/admin/students/${student.id}/guardians/${guardian.id}/edit`}>
                        <Button variant="outline" size="sm">Edit</Button>
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-muted-foreground mb-4">No guardians added</p>
                  <Link href={`/dashboard/admin/students/${student.id}/guardians/new`}>
                    <Button>Add First Guardian</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "enrollments" && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Enrollment History</CardTitle>
                  <CardDescription>Current and past enrollments</CardDescription>
                </div>
                <Link href={`/dashboard/admin/students/${student.id}/enrollments/new`}>
                  <Button>Add Enrollment</Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {enrollments.length > 0 ? (
                <div className="space-y-3">
                  {enrollments.map((enrollment: any) => (
                    <div key={enrollment.id} className="rounded-lg border p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-lg">
                            {enrollment.classes?.name || "Unknown Class"}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {enrollment.academic_years?.name || "Unknown Year"}
                            {enrollment.sections?.name && ` • ${enrollment.sections.name}`}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Enrolled: {new Date(enrollment.enrollment_date).toLocaleDateString()}
                          </p>
                        </div>
                        <Link href={`/dashboard/admin/students/${student.id}/enrollments/${enrollment.id}/edit`}>
                          <Button variant="outline" size="sm">Edit</Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-muted-foreground mb-4">No enrollment records</p>
                  <Link href={`/dashboard/admin/students/${student.id}/enrollments/new`}>
                    <Button>Add First Enrollment</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "invoices" && (
          <Card>
            <CardHeader>
              <CardTitle>Invoices</CardTitle>
              <CardDescription>All invoices for this student</CardDescription>
            </CardHeader>
            <CardContent>
              {invoices.length > 0 ? (
                <div className="space-y-3">
                  {invoices.map((invoice: any) => {
                    const invoiceItems = invoice.invoice_items || []
                    const invoiceTotal = invoiceItems.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0)
                    return (
                      <div key={invoice.id} className="rounded-lg border p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <p className="font-medium">Invoice {invoice.reference}</p>
                            <p className="text-sm text-muted-foreground">
                              Issued: {new Date(invoice.issued_date).toLocaleDateString()}
                              {invoice.due_date && ` • Due: ${new Date(invoice.due_date).toLocaleDateString()}`}
                            </p>
                          </div>
                          <div className="text-right space-y-1">
                            <p className="text-lg font-bold">KES {invoice.amount.toLocaleString()}</p>
                            <span className={cn(
                              "inline-block rounded-full px-2 py-1 text-xs font-medium",
                              invoice.status === "paid"
                                ? "bg-emerald-100 text-emerald-800"
                                : invoice.status === "overdue"
                                ? "bg-red-100 text-red-800"
                                : invoice.status === "partial"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-gray-100 text-gray-800"
                            )}>
                              {invoice.status}
                            </span>
                            <div className="mt-1">
                              <Link href={`/dashboard/accountant/fees/invoices/${invoice.id}`}>
                                <Button variant="outline" size="sm">View Invoice</Button>
                              </Link>
                            </div>
                          </div>
                        </div>
                        {invoiceItems.length > 0 && (
                          <div className="mt-3 pt-3 border-t">
                            <p className="text-xs font-medium text-muted-foreground mb-2">Items:</p>
                            <div className="space-y-1">
                              {invoiceItems.map((item: any) => (
                                <div key={item.id} className="flex justify-between text-sm">
                                  <span>{item.description}</span>
                                  <span>KES {item.amount.toLocaleString()}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">No invoices found</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "payments" && (
          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
              <CardDescription>Payment history for this student</CardDescription>
            </CardHeader>
            <CardContent>
              {payments.length > 0 ? (
                <div className="space-y-3">
                  {payments.map((payment: any) => (
                    <div key={payment.id} className="flex items-center justify-between rounded-lg border p-4">
                      <div>
                        <p className="font-medium">Payment #{payment.id.slice(0, 8)}</p>
                        <p className="text-sm text-muted-foreground">
                          {payment.method} • {payment.paid_at ? new Date(payment.paid_at).toLocaleDateString() : new Date(payment.created_at).toLocaleDateString()}
                        </p>
                        {payment.transaction_ref && (
                          <p className="text-xs text-muted-foreground mt-1">Ref: {payment.transaction_ref}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-emerald-600">KES {payment.amount.toLocaleString()}</p>
                        <span className={cn(
                          "inline-block rounded-full px-2 py-1 text-xs font-medium",
                          payment.status === "completed"
                            ? "bg-emerald-100 text-emerald-800"
                            : payment.status === "pending"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-red-100 text-red-800"
                        )}>
                          {payment.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">No payments found</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "attendance" && (
          <Card>
            <CardHeader>
              <CardTitle>Recent Attendance</CardTitle>
              <CardDescription>Last 10 attendance records</CardDescription>
            </CardHeader>
            <CardContent>
              {recentAttendance.length > 0 ? (
                <div className="space-y-2">
                  {recentAttendance.map((record: any) => (
                    <div
                      key={record.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {new Date(record.date).toLocaleDateString()}
                        </p>
                        {record.periods?.name && (
                          <p className="text-xs text-muted-foreground">
                            {record.periods.name}
                          </p>
                        )}
                      </div>
                      <span
                        className={cn(
                          "rounded-full px-2 py-1 text-xs font-medium",
                          record.status === "present"
                            ? "bg-emerald-100 text-emerald-800"
                            : record.status === "absent"
                            ? "bg-red-100 text-red-800"
                            : "bg-amber-100 text-amber-800"
                        )}
                      >
                        {record.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No attendance records</p>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "documents" && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Documents</CardTitle>
                  <CardDescription>Student documents and files</CardDescription>
                </div>
                <Link href={`/dashboard/admin/students/${student.id}/documents/upload`}>
                  <Button>Upload Document</Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {documents.length > 0 ? (
                <div className="space-y-3">
                  {documents.map((doc: any) => (
                    <div key={doc.id} className="flex items-center justify-between rounded-lg border p-4">
                      <div>
                        <p className="font-medium">{doc.file_name || doc.document_type}</p>
                        <p className="text-sm text-muted-foreground">
                          {doc.document_type} • {new Date(doc.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      {doc.file_url && (
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="sm">View</Button>
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-muted-foreground mb-4">No documents uploaded</p>
                  <Link href={`/dashboard/admin/students/${student.id}/documents/upload`}>
                    <Button>Upload First Document</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}




