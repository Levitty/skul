"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { ArrowLeft, CheckCircle, XCircle, Clock, Bus, DollarSign } from "lucide-react"
import { updateApplicationStatus } from "@/lib/actions/admissions"
import { acceptAndEnrollApplication } from "@/lib/actions/admissions-convert"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

interface ApplicationReviewClientProps {
  application: any
  classes: any[]
  sections: any[]
  currentYear: any
  currentTerm: any
  activities: any[]
  feeStructures?: any[]
  transportRoutes?: any[]
}

export function ApplicationReviewClient({
  application,
  classes,
  sections,
  currentYear,
  currentTerm,
  activities,
  feeStructures = [],
  transportRoutes = [],
}: ApplicationReviewClientProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [showEnrollForm, setShowEnrollForm] = useState(application.status === "accepted")

  const appliedClassId = application.applied_class_id || ""

  const [enrollData, setEnrollData] = useState({
    classId: appliedClassId,
    sectionId: undefined as string | undefined,
    generateInvoice: true,
    boardingEnabled: false,
    transportEnabled: false,
    transportRouteId: "" as string,
    activities: [] as string[],
  })

  const handleStatusChange = async (status: "reviewed" | "interviewed" | "accepted" | "rejected" | "waitlisted") => {
    setLoading(true)
    try {
      await updateApplicationStatus(application.id, status)
      toast({
        title: "Success!",
        description: `Application status updated to ${status}.`,
      })
      router.refresh()
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to update status",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleAcceptAndEnroll = async () => {
    if (!enrollData.classId) {
      toast({
        title: "Error",
        description: "Please select a class for enrollment",
        variant: "destructive",
      })
      return
    }

    if (!currentYear) {
      toast({
        title: "Error",
        description: "No current academic year found",
        variant: "destructive",
      })
      return
    }

    setLoading(true)
    try {
      await acceptAndEnrollApplication(application.id, {
        classId: enrollData.classId,
        sectionId: enrollData.sectionId || undefined,
        generateInvoice: enrollData.generateInvoice,
        boardingEnabled: enrollData.boardingEnabled,
        transportEnabled: enrollData.transportEnabled,
        transportRouteId: enrollData.transportRouteId || undefined,
        activities: enrollData.activities,
      })

      toast({
        title: "Success!",
        description: "Student enrolled successfully and invoice generated.",
      })
      router.push("/dashboard/admin/students")
      router.refresh()
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to enroll student",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 border-amber-200 dark:border-amber-800"
      case "reviewed": return "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 border-blue-200 dark:border-blue-800"
      case "interviewed": return "bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-400 border-purple-200 dark:border-purple-800"
      case "accepted": return "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
      case "rejected": return "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 border-red-200 dark:border-red-800"
      case "waitlisted": return "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800"
      default: return "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200"
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard/admin/admissions">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Admissions
            </Button>
          </Link>
          <h1 className="mt-4 text-3xl font-bold">
            Review Application
          </h1>
          <p className="text-muted-foreground">
            {application.first_name} {application.last_name}
          </p>
        </div>
        <span className={cn("px-3 py-1.5 rounded-lg text-sm font-medium border", getStatusColor(application.status))}>
          {application.status}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Application Details */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Application Details</CardTitle>
              <CardDescription>Student and guardian information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Student Name</p>
                  <p className="text-lg font-semibold">
                    {application.first_name} {application.last_name}
                  </p>
                </div>
                {application.dob && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Date of Birth</p>
                    <p>{new Date(application.dob).toLocaleDateString()}</p>
                  </div>
                )}
                {application.gender && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Gender</p>
                    <p className="capitalize">{application.gender}</p>
                  </div>
                )}
                {application.classes && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Applied Class</p>
                    <p>{application.classes.name}</p>
                  </div>
                )}
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">Guardian Information</h3>
                <div className="space-y-2">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Name</p>
                    <p>{application.guardian_name}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Phone</p>
                    <p>{application.guardian_phone}</p>
                  </div>
                  {application.guardian_email && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Email</p>
                      <p>{application.guardian_email}</p>
                    </div>
                  )}
                </div>
              </div>

              {application.notes && (
                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-muted-foreground mb-2">Notes</p>
                  <p className="text-sm">{application.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Enrollment Form (shown when accepted) */}
          {application.status === "accepted" && (
            <Card>
              <CardHeader>
                <CardTitle>Enroll Student</CardTitle>
                <CardDescription>Complete enrollment and generate invoice</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="enroll_class">Class *</Label>
                  <Select
                    value={enrollData.classId}
                    onValueChange={(value) => setEnrollData({ ...enrollData, classId: value, sectionId: "" })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent>
                      {classes.map((cls) => (
                        <SelectItem key={cls.id} value={cls.id}>
                          {cls.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {enrollData.classId && (
                  <div className="space-y-2">
                    <Label htmlFor="enroll_section">Section (Optional)</Label>
                    <Select
                      value={enrollData.sectionId || ""}
                      onValueChange={(value) => setEnrollData({ ...enrollData, sectionId: value || undefined })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select section (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {sections
                          .filter((s) => s.class_id === enrollData.classId)
                          .map((section) => (
                            <SelectItem key={section.id} value={section.id}>
                              {section.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Fee Types for selected class */}
                {enrollData.classId && feeStructures.length > 0 && (
                  <div className="border-t pt-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-muted-foreground" />
                      <Label className="text-base font-semibold">Fee Structure</Label>
                    </div>
                    <div className="rounded-lg border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/50">
                            <th className="text-left px-4 py-2 font-medium">Fee Type</th>
                            <th className="text-left px-4 py-2 font-medium">Name</th>
                            <th className="text-right px-4 py-2 font-medium">Amount (KES)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {feeStructures
                            .filter((f: any) => !f.class_id || f.class_id === enrollData.classId)
                            .map((fee: any) => (
                              <tr key={fee.id} className="border-t">
                                <td className="px-4 py-2">
                                  <span className="capitalize px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                                    {fee.fee_type}
                                  </span>
                                </td>
                                <td className="px-4 py-2">{fee.name}</td>
                                <td className="px-4 py-2 text-right font-mono">
                                  {Number(fee.amount).toLocaleString()}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t bg-muted/30 font-semibold">
                            <td className="px-4 py-2" colSpan={2}>Total</td>
                            <td className="px-4 py-2 text-right font-mono">
                              {feeStructures
                                .filter((f: any) => !f.class_id || f.class_id === enrollData.classId)
                                .reduce((sum: number, f: any) => sum + Number(f.amount), 0)
                                .toLocaleString()}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    {feeStructures.filter((f: any) => !f.class_id || f.class_id === enrollData.classId).length === 0 && (
                      <p className="text-sm text-muted-foreground italic">No fee structures configured for this class.</p>
                    )}
                  </div>
                )}

                <div className="space-y-3 border-t pt-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="boarding"
                      checked={enrollData.boardingEnabled}
                      onCheckedChange={(checked) =>
                        setEnrollData({ ...enrollData, boardingEnabled: checked as boolean })
                      }
                    />
                    <Label htmlFor="boarding" className="cursor-pointer">
                      Boarding
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="transport"
                      checked={enrollData.transportEnabled}
                      onCheckedChange={(checked) =>
                        setEnrollData({
                          ...enrollData,
                          transportEnabled: checked as boolean,
                          transportRouteId: checked ? enrollData.transportRouteId : "",
                        })
                      }
                    />
                    <Label htmlFor="transport" className="cursor-pointer">
                      Transport
                    </Label>
                  </div>

                  {enrollData.transportEnabled && (
                    <div className="ml-6 space-y-2">
                      <Label htmlFor="transport_route" className="flex items-center gap-2">
                        <Bus className="w-4 h-4" />
                        Transport Route *
                      </Label>
                      {transportRoutes.length > 0 ? (
                        <Select
                          value={enrollData.transportRouteId}
                          onValueChange={(value) => setEnrollData({ ...enrollData, transportRouteId: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a transport route" />
                          </SelectTrigger>
                          <SelectContent>
                            {transportRoutes.map((route: any) => (
                              <SelectItem key={route.id} value={route.id}>
                                <div className="flex items-center justify-between gap-4">
                                  <span>
                                    {route.name}
                                    {route.route_number ? ` (${route.route_number})` : ""}
                                    {route.start_location && route.end_location
                                      ? ` — ${route.start_location} → ${route.end_location}`
                                      : ""}
                                  </span>
                                  {route.fee_amount > 0 && (
                                    <span className="text-xs text-muted-foreground ml-2">
                                      KES {Number(route.fee_amount).toLocaleString()}
                                    </span>
                                  )}
                                </div>
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
                  <div className="space-y-2 border-t pt-4">
                    <Label>Optional Activities</Label>
                    <div className="space-y-2">
                      {activities.map((activity) => (
                        <div key={activity.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`activity-${activity.id}`}
                            checked={enrollData.activities.includes(activity.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setEnrollData({
                                  ...enrollData,
                                  activities: [...enrollData.activities, activity.id],
                                })
                              } else {
                                setEnrollData({
                                  ...enrollData,
                                  activities: enrollData.activities.filter((id) => id !== activity.id),
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

                <div className="flex items-center space-x-2 border-t pt-4">
                  <Checkbox
                    id="generate_invoice"
                    checked={enrollData.generateInvoice}
                    onCheckedChange={(checked) =>
                      setEnrollData({ ...enrollData, generateInvoice: checked as boolean })
                    }
                  />
                  <Label htmlFor="generate_invoice" className="cursor-pointer">
                    Generate invoice immediately
                  </Label>
                </div>
              </CardContent>
              <CardContent className="pt-0">
                <Button
                  onClick={handleAcceptAndEnroll}
                  disabled={loading || !enrollData.classId}
                  className="w-full"
                >
                  {loading ? "Enrolling..." : "Accept & Enroll & Generate Invoice"}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Actions Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
              <CardDescription>Update application status</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {application.status === "pending" && (
                <>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => handleStatusChange("reviewed")}
                    disabled={loading}
                  >
                    <Clock className="mr-2 h-4 w-4" />
                    Mark as Reviewed
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => handleStatusChange("interviewed")}
                    disabled={loading}
                  >
                    <Clock className="mr-2 h-4 w-4" />
                    Mark as Interviewed
                  </Button>
                </>
              )}
              {(application.status === "pending" || application.status === "reviewed" || application.status === "interviewed") && (
                <>
                  <Button
                    className="w-full justify-start bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => handleStatusChange("accepted")}
                    disabled={loading}
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Accept Application
                  </Button>
                  <Button
                    variant="destructive"
                    className="w-full justify-start"
                    onClick={() => handleStatusChange("rejected")}
                    disabled={loading}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Reject Application
                  </Button>
                </>
              )}
              {application.status === "accepted" && (
                <p className="text-sm text-muted-foreground">
                  Application accepted. Use the enrollment form to complete the process.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Application Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <p className="text-muted-foreground">Applied</p>
                <p>{new Date(application.created_at).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Last Updated</p>
                <p>{new Date(application.updated_at).toLocaleDateString()}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

