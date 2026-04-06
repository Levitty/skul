"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import Link from "next/link"

interface FeesPageClientProps {
  payments: any[]
  invoices: any[]
  feeStructures: any[]
  classes: any[]
  terms: any[]
  currentYear: any
}

export function FeesPageClient({
  payments,
  invoices,
  feeStructures,
  classes,
  terms,
  currentYear,
}: FeesPageClientProps) {
  const [activeTab, setActiveTab] = useState("overview")

  const totalCollected = payments
    ?.filter((p) => p.status === "completed")
    .reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0
  const pendingAmount = invoices?.filter((i) => i.status === "unpaid").reduce((sum, i) => sum + Number(i.amount || 0), 0) || 0
  const overdueAmount = invoices?.filter((i) => i.status === "overdue").reduce((sum, i) => sum + Number(i.amount || 0), 0) || 0

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-neutral-900 mb-2">
            Fees & Payments
          </h1>
          <p className="text-lg text-neutral-500">
            Manage fee structures and track payments
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/dashboard/accountant/fees/term-transition">
            <Button variant="outline" className="h-11 px-6 border-neutral-300 text-neutral-700 hover:bg-neutral-50">
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              Term Transition
            </Button>
          </Link>
          <Link href="/dashboard/accountant/fees/record-payment">
            <Button className="h-11 px-6 bg-neutral-900 text-white hover:bg-neutral-800">
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Record Payment
            </Button>
          </Link>
        </div>
      </div>

      {/* Financial Overview Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border border-neutral-200 shadow-sm hover:shadow-md transition-all">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription className="text-neutral-600">Total Collected</CardDescription>
              <div className="p-2 rounded-lg bg-neutral-100 text-neutral-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <CardTitle className="text-3xl text-neutral-900">KES {(totalCollected / 1000).toFixed(1)}K</CardTitle>
          </CardHeader>
        </Card>

        <Card className="border border-neutral-200 shadow-sm hover:shadow-md transition-all">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription className="text-neutral-600">Pending Payment</CardDescription>
              <div className="p-2 rounded-lg bg-neutral-100 text-neutral-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <CardTitle className="text-3xl text-neutral-900">KES {(pendingAmount / 1000).toFixed(1)}K</CardTitle>
          </CardHeader>
        </Card>

        <Card className="border border-neutral-200 shadow-sm hover:shadow-md transition-all">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription className="text-neutral-600">Overdue Amount</CardDescription>
              <div className="p-2 rounded-lg bg-neutral-100 text-neutral-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>
            <CardTitle className="text-3xl text-neutral-900">KES {(overdueAmount / 1000).toFixed(1)}K</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="fee-structures">Fee Structures</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="arrears">Arrears</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Recent Payments</CardTitle>
                <CardDescription>Latest payment records</CardDescription>
              </CardHeader>
              <CardContent>
                {payments && payments.length > 0 ? (
                  <div className="space-y-3">
                    {payments.slice(0, 5).map((payment: any) => (
                      <div key={payment.id} className="flex items-center justify-between p-3 rounded-lg border">
                        <div>
                          <p className="font-medium">KES {payment.amount?.toLocaleString()}</p>
                          <p className="text-sm text-muted-foreground capitalize">
                            {payment.method} • {payment.paid_at ? new Date(payment.paid_at).toLocaleDateString() : new Date(payment.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          payment.status === "completed"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}>
                          {payment.status}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No payments yet</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Invoices</CardTitle>
                <CardDescription>Latest invoices issued</CardDescription>
              </CardHeader>
              <CardContent>
                {invoices && invoices.length > 0 ? (
                  <div className="space-y-3">
                    {invoices.slice(0, 5).map((invoice: any) => (
                      <Link key={invoice.id} href={`/dashboard/accountant/fees/invoices/${invoice.id}`}>
                        <div className="flex items-center justify-between p-3 rounded-lg border hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all duration-200 cursor-pointer">
                          <div>
                            <p className="font-medium">{invoice.reference}</p>
                            <p className="text-sm text-muted-foreground">
                              KES {invoice.amount.toLocaleString()} • {new Date(invoice.issued_date).toLocaleDateString()}
                            </p>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            invoice.status === "paid"
                              ? "bg-emerald-100 text-emerald-800"
                              : invoice.status === "overdue"
                              ? "bg-red-100 text-red-800"
                              : "bg-amber-100 text-amber-800"
                          }`}>
                            {invoice.status}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No invoices yet</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="fee-structures" className="mt-6">
          <FeeStructuresTab feeStructures={feeStructures} classes={classes} terms={terms} currentYear={currentYear} />
        </TabsContent>

        <TabsContent value="invoices" className="mt-6">
          <InvoicesTab invoices={invoices} classes={classes} terms={terms} />
        </TabsContent>

        <TabsContent value="payments" className="mt-6">
          <PaymentsTab payments={payments} />
        </TabsContent>

        <TabsContent value="arrears" className="mt-6">
          <ArrearsTab classes={classes} terms={terms} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Fee Structures Tab Component
function FeeStructuresTab({ feeStructures, classes, terms, currentYear }: any) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Fee Structures</CardTitle>
            <CardDescription>Manage fee structures by class and term</CardDescription>
          </div>
          <Link href="/dashboard/accountant/fees/fee-structures/new">
            <Button>Add Fee Structure</Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {feeStructures && feeStructures.length > 0 ? (
          <div className="space-y-3">
            {feeStructures.map((fee: any) => (
              <div key={fee.id} className="flex items-center justify-between p-4 rounded-lg border">
                <div>
                  <p className="font-medium">{fee.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {fee.classes?.name || "All Classes"} • {fee.terms?.name || "All Terms"} • {fee.fee_type}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold">KES {fee.amount.toLocaleString()}</p>
                  <Link href={`/dashboard/accountant/fees/fee-structures/${fee.id}/edit`}>
                    <Button variant="outline" size="sm" className="mt-2">Edit</Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">No fee structures defined</p>
            <Link href="/dashboard/accountant/fees/fee-structures/new">
              <Button>Create First Fee Structure</Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Invoices Tab Component
function InvoicesTab({ invoices, classes, terms }: any) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Invoices</CardTitle>
            <CardDescription>View and manage student invoices</CardDescription>
          </div>
          <div className="flex gap-2">
            <Link href="/dashboard/accountant/fees/invoices/generate">
              <Button variant="outline">Generate Invoice</Button>
            </Link>
            <Link href="/dashboard/accountant/fees/invoices/bulk-generate">
              <Button>Bulk Generate</Button>
            </Link>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {invoices && invoices.length > 0 ? (
          <div className="space-y-3">
            {invoices.map((invoice: any) => (
              <Link key={invoice.id} href={`/dashboard/accountant/fees/invoices/${invoice.id}`}>
                <div className="flex items-center justify-between p-4 rounded-lg border hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all duration-200 cursor-pointer">
                  <div>
                    <p className="font-medium">{invoice.reference}</p>
                    <p className="text-sm text-muted-foreground">
                      Due: {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : "N/A"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">KES {invoice.amount.toLocaleString()}</p>
                    <span className={`inline-block mt-2 px-2 py-1 rounded-full text-xs font-medium ${
                      invoice.status === "paid"
                        ? "bg-emerald-100 text-emerald-800"
                        : invoice.status === "overdue"
                        ? "bg-red-100 text-red-800"
                        : "bg-amber-100 text-amber-800"
                    }`}>
                      {invoice.status}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">No invoices found</p>
            <Link href="/dashboard/accountant/fees/invoices/generate">
              <Button>Generate First Invoice</Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Payments Tab Component
function PaymentsTab({ payments }: any) {
  const getPaymentMethodIcon = (method: string) => {
    switch (method?.toLowerCase()) {
      case "mpesa":
        return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
      case "cash":
        return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
      case "bank_transfer":
        return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      default:
        return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment History</CardTitle>
        <CardDescription>All payment records</CardDescription>
      </CardHeader>
      <CardContent>
        {payments && payments.length > 0 ? (
          <div className="space-y-3">
            {payments.map((payment: any) => (
              <div key={payment.id} className="flex items-center gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-lg transition-all duration-200">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/30">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    {getPaymentMethodIcon(payment.method)}
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold">Payment #{payment.id.slice(0, 8)}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                      payment.status === "completed"
                        ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
                        : payment.status === "pending"
                        ? "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 border-amber-200 dark:border-amber-800"
                        : "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 border-red-200 dark:border-red-800"
                    }`}>
                      {payment.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1 capitalize">
                      {payment.method || "N/A"}
                    </span>
                    <span className="flex items-center gap-1">
                      {payment.paid_at ? new Date(payment.paid_at).toLocaleDateString() : new Date(payment.created_at).toLocaleDateString()}
                    </span>
                    {payment.transaction_ref && (
                      <span className="text-xs">Ref: {payment.transaction_ref}</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    KES {payment.amount?.toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">No payments found</p>
            <Link href="/dashboard/accountant/fees/record-payment">
              <Button>Record First Payment</Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Arrears Tab Component
function ArrearsTab({ classes, terms }: any) {
  const [selectedClass, setSelectedClass] = useState("")
  const [selectedTerm, setSelectedTerm] = useState("")
  const [arrears, setArrears] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const handleLoadArrears = async () => {
    setLoading(true)
    try {
      const response = await fetch(
        `/api/fees/arrears?${new URLSearchParams({
          ...(selectedClass && selectedClass !== "all" && { classId: selectedClass }),
          ...(selectedTerm && selectedTerm !== "all" && { termId: selectedTerm }),
        })}`
      )
      const data = await response.json()
      setArrears(data || [])
    } catch (err) {
      console.error("Failed to load arrears:", err)
    } finally {
      setLoading(false)
    }
  }

  // Load arrears on mount or when filters change
  useEffect(() => {
    handleLoadArrears()
  }, [selectedClass, selectedTerm])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Arrears</CardTitle>
            <CardDescription>Students with outstanding balances</CardDescription>
          </div>
          <Button onClick={handleLoadArrears} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex gap-4">
          <div className="flex-1">
            <Label>Filter by Class</Label>
            <Select value={selectedClass} onValueChange={(value) => {
              setSelectedClass(value)
              handleLoadArrears()
            }}>
              <SelectTrigger>
                <SelectValue placeholder="All Classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {classes.map((cls: any) => (
                  <SelectItem key={cls.id} value={cls.id}>
                    {cls.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <Label>Filter by Term</Label>
            <Select value={selectedTerm} onValueChange={(value) => {
              setSelectedTerm(value)
              handleLoadArrears()
            }}>
              <SelectTrigger>
                <SelectValue placeholder="All Terms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Terms</SelectItem>
                {terms.map((term: any) => (
                  <SelectItem key={term.id} value={term.id}>
                    {term.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {arrears.length > 0 ? (
          <div className="space-y-3">
            {arrears.map((item: any) => (
              <div key={item.id} className="flex items-center justify-between p-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20">
                <div>
                  <p className="font-medium">
                    {item.students?.first_name} {item.students?.last_name}
                    {item.students?.admission_number && ` (${item.students.admission_number})`}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Invoice: {item.reference} • Due: {item.due_date ? new Date(item.due_date).toLocaleDateString() : "N/A"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Aging: {item.agingBucket || "Current"}
                    {item.daysOverdue ? ` • ${item.daysOverdue} days` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Paid: KES {item.totalPaid.toLocaleString()} of KES {item.amount.toLocaleString()}
                  </p>
                </div>
                <div className="text-right space-y-2">
                  <p className="text-xl font-bold text-red-600">
                    KES {item.outstanding.toLocaleString()}
                  </p>
                  <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                    {item.status}
                  </span>
                  <div className="flex gap-2 justify-end mt-2">
                    <Link href={`/dashboard/accountant/fees/invoices/${item.id}`}>
                      <Button variant="outline" size="sm">View Invoice</Button>
                    </Link>
                    <Link href={`/dashboard/accountant/fees/record-payment?invoice_id=${item.id}`}>
                      <Button size="sm">Record Payment</Button>
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No arrears found</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

