"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { generateStudentInvoice } from "@/lib/actions/invoices"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import Link from "next/link"
import { ArrowLeft, Bus, DollarSign, User, GraduationCap, FileText } from "lucide-react"

interface GenerateInvoiceFormProps {
  students: any[]
  terms: any[]
  activities: any[]
  transportRoutes?: any[]
  feeStructures?: any[]
  enrollments?: any[]
  studentServices?: any[]
}

export function GenerateInvoiceForm({
  students,
  terms,
  activities,
  transportRoutes = [],
  feeStructures = [],
  enrollments = [],
  studentServices = [],
}: GenerateInvoiceFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const [formData, setFormData] = useState({
    student_id: "",
    term_id: "",
    includeBoarding: false,
    includeTransport: false,
    transportRouteId: "",
    activities: [] as string[],
  })

  const selectedStudent = students.find((s) => s.id === formData.student_id)

  // Find the student's enrollment (class)
  const studentEnrollment = useMemo(() => {
    return enrollments.find((e: any) => e.student_id === formData.student_id)
  }, [enrollments, formData.student_id])

  const studentClassId = (studentEnrollment as any)?.class_id
  const studentClassName = (studentEnrollment as any)?.classes?.name

  // Find the student's services
  const studentService = useMemo(() => {
    return studentServices.find((s: any) => s.student_id === formData.student_id)
  }, [studentServices, formData.student_id])

  // Get the selected term's academic_year_id
  const selectedTerm = terms.find((t: any) => t.id === formData.term_id)

  // Compute fee line items that will appear on the invoice
  const invoicePreview = useMemo(() => {
    if (!formData.student_id || !formData.term_id) return []

    const items: { description: string; type: string; amount: number }[] = []

    // Class-based fee structures (tuition, exam, library, uniform, etc.)
    const applicableFees = feeStructures.filter((f: any) => {
      const matchesClass = !f.class_id || f.class_id === studentClassId
      const matchesYear = !selectedTerm || f.academic_year_id === selectedTerm.academic_year_id
      const isNotService = f.fee_type !== "transport" && f.fee_type !== "hostel"
      return matchesClass && matchesYear && isNotService
    })

    for (const fee of applicableFees) {
      items.push({
        description: fee.name,
        type: fee.fee_type,
        amount: Number(fee.amount),
      })
    }

    // Boarding fee
    if (formData.includeBoarding) {
      const boardingFee = feeStructures.find((f: any) => {
        const matchesClass = !f.class_id || f.class_id === studentClassId
        const matchesYear = !selectedTerm || f.academic_year_id === selectedTerm.academic_year_id
        return f.fee_type === "hostel" && matchesClass && matchesYear
      })
      if (boardingFee) {
        items.push({
          description: boardingFee.name,
          type: "hostel",
          amount: Number(boardingFee.amount),
        })
      }
    }

    // Transport fee
    if (formData.includeTransport) {
      const selectedRoute = transportRoutes.find((r: any) => r.id === formData.transportRouteId)
      if (selectedRoute && Number(selectedRoute.fee_amount) > 0) {
        items.push({
          description: `Transport — ${selectedRoute.name}`,
          type: "transport",
          amount: Number(selectedRoute.fee_amount),
        })
      } else {
        const transportFee = feeStructures.find((f: any) => {
          const matchesClass = !f.class_id || f.class_id === studentClassId
          const matchesYear = !selectedTerm || f.academic_year_id === selectedTerm.academic_year_id
          return f.fee_type === "transport" && matchesClass && matchesYear
        })
        if (transportFee) {
          items.push({
            description: transportFee.name,
            type: "transport",
            amount: Number(transportFee.amount),
          })
        }
      }
    }

    // Activities
    for (const actId of formData.activities) {
      const activity = activities.find((a: any) => a.id === actId)
      if (activity) {
        items.push({
          description: activity.name,
          type: "activity",
          amount: Number(activity.fee_amount),
        })
      }
    }

    return items
  }, [formData, feeStructures, transportRoutes, activities, studentClassId, selectedTerm])

  const invoiceTotal = invoicePreview.reduce((sum, item) => sum + item.amount, 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      await generateStudentInvoice(formData.student_id, formData.term_id, {
        includeBoarding: formData.includeBoarding,
        includeTransport: formData.includeTransport,
        activityIds: formData.activities,
      })

      toast({
        title: "Success!",
        description: "Invoice generated successfully.",
      })

      router.push("/dashboard/accountant/fees")
      router.refresh()
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to generate invoice",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case "tuition": return "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
      case "exam": return "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400"
      case "transport": return "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
      case "hostel": return "bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400"
      case "uniform": return "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400"
      case "library": return "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400"
      case "activity": return "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
      default: return "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400"
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/accountant/fees">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Fees
          </Button>
        </Link>
        <h1 className="mt-4 text-3xl font-bold">Generate Invoice</h1>
        <p className="text-muted-foreground">
          Generate an invoice for a student
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Form */}
        <div className="lg:col-span-2">
          <Card>
            <form onSubmit={handleSubmit}>
              <CardHeader>
                <CardTitle>Invoice Details</CardTitle>
                <CardDescription>
                  Select student and term to generate invoice
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="student_id">Student *</Label>
                    <Select
                      value={formData.student_id}
                      onValueChange={(val) => setFormData({ ...formData, student_id: val })}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select student" />
                      </SelectTrigger>
                      <SelectContent>
                        {students.map((student) => (
                          <SelectItem key={student.id} value={student.id}>
                            {student.first_name} {student.last_name} ({student.admission_number || "No ID"})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="term_id">Term *</Label>
                    <Select
                      value={formData.term_id}
                      onValueChange={(value) =>
                        setFormData({ ...formData, term_id: value })
                      }
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select term" />
                      </SelectTrigger>
                      <SelectContent>
                        {terms.map((term) => (
                          <SelectItem key={term.id} value={term.id}>
                            {term.name} {term.due_date && `(Due: ${new Date(term.due_date).toLocaleDateString()})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Student info card */}
                {selectedStudent && (
                  <div className="rounded-xl border bg-muted/30 p-4">
                    <div className="grid gap-3 sm:grid-cols-3 text-sm">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-muted-foreground text-xs">Student</p>
                          <p className="font-medium">{selectedStudent.first_name} {selectedStudent.last_name}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <GraduationCap className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-muted-foreground text-xs">Class</p>
                          <p className="font-medium">{studentClassName || "Not enrolled"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-muted-foreground text-xs">Admission No.</p>
                          <p className="font-medium">{selectedStudent.admission_number || "—"}</p>
                        </div>
                      </div>
                    </div>
                    {studentService && (
                      <div className="flex gap-2 mt-3">
                        {(studentService as any).boarding_enabled && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400">
                            Boarding
                          </span>
                        )}
                        {(studentService as any).transport_enabled && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                            Transport
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="border-t pt-4 space-y-3">
                  <h3 className="font-semibold">Optional Services</h3>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="includeBoarding"
                      checked={formData.includeBoarding}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, includeBoarding: checked as boolean })
                      }
                    />
                    <Label htmlFor="includeBoarding" className="cursor-pointer">
                      Include Boarding Fee
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="includeTransport"
                      checked={formData.includeTransport}
                      onCheckedChange={(checked) =>
                        setFormData({
                          ...formData,
                          includeTransport: checked as boolean,
                          transportRouteId: checked ? formData.transportRouteId : "",
                        })
                      }
                    />
                    <Label htmlFor="includeTransport" className="cursor-pointer">
                      Include Transport Fee
                    </Label>
                  </div>

                  {formData.includeTransport && (
                    <div className="ml-6 space-y-2">
                      <Label htmlFor="transport_route" className="flex items-center gap-2">
                        <Bus className="w-4 h-4" />
                        Transport Route
                      </Label>
                      {transportRoutes.length > 0 ? (
                        <Select
                          value={formData.transportRouteId}
                          onValueChange={(value) => setFormData({ ...formData, transportRouteId: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a transport route" />
                          </SelectTrigger>
                          <SelectContent>
                            {transportRoutes.map((route: any) => (
                              <SelectItem key={route.id} value={route.id}>
                                {route.name}
                                {route.route_number ? ` (${route.route_number})` : ""}
                                {route.start_location && route.end_location
                                  ? ` — ${route.start_location} → ${route.end_location}`
                                  : ""}
                                {route.fee_amount > 0 ? ` • KES ${Number(route.fee_amount).toLocaleString()}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">
                          No transport routes configured. Go to Transport &gt; Routes to add routes.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {activities.length > 0 && (
                  <div className="border-t pt-4 space-y-3">
                    <h3 className="font-semibold">Optional Activities</h3>
                    <div className="space-y-2">
                      {activities.map((activity) => (
                        <div key={activity.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`activity-${activity.id}`}
                            checked={formData.activities.includes(activity.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setFormData({
                                  ...formData,
                                  activities: [...formData.activities, activity.id],
                                })
                              } else {
                                setFormData({
                                  ...formData,
                                  activities: formData.activities.filter((id) => id !== activity.id),
                                })
                              }
                            }}
                          />
                          <Label htmlFor={`activity-${activity.id}`} className="cursor-pointer flex-1">
                            {activity.name} — KES {Number(activity.fee_amount).toLocaleString()}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex justify-between">
                <Link href="/dashboard/accountant/fees">
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </Link>
                <Button type="submit" disabled={loading || !formData.student_id || !formData.term_id}>
                  {loading ? "Generating..." : "Generate Invoice"}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>

        {/* Right: Invoice Preview */}
        <div>
          <Card className="border-0 shadow-xl sticky top-6">
            <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-t-xl">
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Invoice Preview
              </CardTitle>
              <CardDescription className="text-blue-100">
                {formData.student_id && formData.term_id
                  ? "Estimated line items"
                  : "Select a student and term to preview"}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {formData.student_id && formData.term_id ? (
                invoicePreview.length > 0 ? (
                  <div className="space-y-3">
                    {invoicePreview.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2 text-sm py-2 border-b last:border-0">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{item.description}</p>
                          <span className={`inline-block mt-0.5 capitalize px-1.5 py-0.5 rounded text-xs font-medium ${getTypeBadgeColor(item.type)}`}>
                            {item.type}
                          </span>
                        </div>
                        <p className="font-mono text-sm font-semibold whitespace-nowrap">
                          {item.amount.toLocaleString()}
                        </p>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-3 border-t-2 border-blue-200 dark:border-blue-800">
                      <p className="font-bold text-lg">Total</p>
                      <p className="font-bold text-lg font-mono">
                        KES {invoiceTotal.toLocaleString()}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic py-4 text-center">
                    No fee structures found for this student&apos;s class and term. Please configure fee structures first.
                  </p>
                )
              ) : (
                <div className="py-8 text-center">
                  <DollarSign className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Select a student and term to see the invoice breakdown
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
