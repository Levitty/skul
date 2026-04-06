"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { updateApplicationStatus } from "@/lib/actions/admissions"
import { createClient } from "@/lib/supabase/client"

export default function AdmissionsPage() {
  const router = useRouter()
  const [applicationsList, setApplicationsList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<any>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  useEffect(() => {
    const fetchApplications = async () => {
      try {
        setLoading(true)
        const supabase = await createClient()
        const { data: applications, error: fetchError } = await supabase
          .from("applications")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20)

        if (fetchError) {
          console.error("Error fetching admissions:", fetchError)
          setError(fetchError)
        } else {
          setApplicationsList(applications || [])
        }
      } catch (err) {
        console.error("Error:", err)
        setError(err)
      } finally {
        setLoading(false)
      }
    }

    fetchApplications()
  }, [])

  const handleAccept = async (applicationId: string) => {
    try {
      setLoadingId(applicationId)
      await updateApplicationStatus(applicationId, "accepted")
      router.refresh()
      // Update local state
      setApplicationsList(prev =>
        prev.map(app =>
          app.id === applicationId ? { ...app, status: "accepted" } : app
        )
      )
    } catch (err) {
      console.error("Error accepting application:", err)
      alert("Failed to accept application. Please try again.")
    } finally {
      setLoadingId(null)
    }
  }

  const handleReject = async (applicationId: string) => {
    try {
      setLoadingId(applicationId)
      await updateApplicationStatus(applicationId, "rejected")
      router.refresh()
      // Update local state
      setApplicationsList(prev =>
        prev.map(app =>
          app.id === applicationId ? { ...app, status: "rejected" } : app
        )
      )
    } catch (err) {
      console.error("Error rejecting application:", err)
      alert("Failed to reject application. Please try again.")
    } finally {
      setLoadingId(null)
    }
  }

  const statusCounts = {
    pending: applicationsList.filter((a: any) => a.status === "pending").length || 0,
    accepted: applicationsList.filter((a: any) => a.status === "accepted").length || 0,
    rejected: applicationsList.filter((a: any) => a.status === "rejected").length || 0,
    reviewed: applicationsList.filter((a: any) => a.status === "reviewed").length || 0,
    interviewed: applicationsList.filter((a: any) => a.status === "interviewed").length || 0,
    waitlisted: applicationsList.filter((a: any) => a.status === "waitlisted").length || 0,
    total: applicationsList.length || 0,
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-amber-50 text-amber-700 border border-amber-200"
      case "reviewed": return "bg-blue-50 text-blue-700 border border-blue-200"
      case "interviewed": return "bg-purple-50 text-purple-700 border border-purple-200"
      case "accepted": return "bg-emerald-50 text-emerald-700 border border-emerald-200"
      case "rejected": return "bg-red-50 text-red-700 border border-red-200"
      case "waitlisted": return "bg-yellow-50 text-yellow-700 border border-yellow-200"
      default: return "bg-neutral-100 text-neutral-700 border border-neutral-200"
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-neutral-900 mb-2">
            Admissions
          </h1>
          <p className="text-lg text-neutral-500">
            Manage student applications and enrollments
          </p>
        </div>
        <Link href="/dashboard/admin/admissions/new">
          <Button className="h-11 px-6 bg-neutral-900 hover:bg-neutral-800 text-white transition-all duration-200">
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Application
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border border-neutral-200 shadow-sm bg-white">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Total Applications</CardDescription>
              <div className="p-2 rounded-lg bg-neutral-100 text-neutral-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
            <CardTitle className="text-3xl">{statusCounts.total}</CardTitle>
          </CardHeader>
        </Card>

        <Card className="border border-neutral-200 shadow-sm bg-white">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Pending Review</CardDescription>
              <div className="p-2 rounded-lg bg-neutral-100 text-neutral-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <CardTitle className="text-3xl">{statusCounts.pending}</CardTitle>
          </CardHeader>
        </Card>

        <Card className="border border-neutral-200 shadow-sm bg-white">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Accepted</CardDescription>
              <div className="p-2 rounded-lg bg-neutral-100 text-neutral-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <CardTitle className="text-3xl">{statusCounts.accepted}</CardTitle>
          </CardHeader>
        </Card>

        <Card className="border border-neutral-200 shadow-sm bg-white">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Rejected</CardDescription>
              <div className="p-2 rounded-lg bg-neutral-100 text-neutral-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <CardTitle className="text-3xl">{statusCounts.rejected}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Applications Table */}
      <Card className="border border-neutral-200 shadow-sm bg-white">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Application Pipeline</CardTitle>
              <CardDescription className="mt-1">
                Review and process student applications
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Filter
              </Button>
              <Button variant="outline" size="sm">
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
                Sort
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-neutral-100">
                <svg className="w-8 h-8 text-neutral-600 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-lg font-medium mb-2">Loading applications...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-red-50">
                <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-lg font-medium text-red-600 mb-2">Error loading applications</p>
              <p className="text-sm text-neutral-500">{error?.message || "Unknown error"}</p>
            </div>
          ) : applicationsList && applicationsList.length > 0 ? (
            <div className="space-y-4">
              {applicationsList.map((app: any) => (
                <div
                  key={app.id}
                  className="flex items-center gap-4 p-5 rounded-lg border border-neutral-200 hover:border-neutral-300 transition-all duration-200 bg-white"
                >
                  <div className="w-14 h-14 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-600 text-xl font-bold">
                    {app.first_name?.[0]}{app.last_name?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg mb-1">
                      {app.first_name} {app.last_name}
                    </h3>
                    <div className="flex items-center gap-4 text-sm text-neutral-500">
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Applied {new Date(app.created_at).toLocaleDateString()}
                      </span>
                      {app.dob && (
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          DOB: {new Date(app.dob).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${getStatusColor(app.status)}`}>
                      {app.status}
                    </span>
                    <div className="flex gap-2">
                      {(app.status === "pending" || app.status === "reviewed" || app.status === "interviewed") && (
                        <>
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => handleAccept(app.id)}
                            disabled={loadingId !== null}
                          >
                            {loadingId === app.id ? (
                              <>
                                <svg className="w-4 h-4 mr-1 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Accepting...
                              </>
                            ) : (
                              <>
                                <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Accept
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReject(app.id)}
                            disabled={loadingId !== null}
                          >
                            {loadingId === app.id ? (
                              <>
                                <svg className="w-4 h-4 mr-1 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Rejecting...
                              </>
                            ) : (
                              <>
                                <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                Reject
                              </>
                            )}
                          </Button>
                        </>
                      )}
                      <Link href={`/dashboard/admin/admissions/${app.id}`}>
                        <Button size="sm" variant="ghost">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-neutral-100">
                <svg className="w-8 h-8 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-lg font-medium mb-2">No applications yet</p>
              <p className="text-sm text-neutral-500 mb-4">Applications will appear here when students apply</p>
              <Button>Create First Application</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
