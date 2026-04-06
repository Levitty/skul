"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { CheckCircle, XCircle, Clock, CalendarOff } from "lucide-react"
import { reviewLeave } from "@/lib/actions/student-leaves"
import { useRouter } from "next/navigation"

interface LeaveData {
  id: string
  leave_type: string
  start_date: string
  end_date: string
  total_days: number
  reason: string
  status: string
  reviewer_remarks: string | null
  created_at: string
  student?: {
    id: string
    first_name: string
    last_name: string
    admission_number: string
  }
}

interface StudentLeavesManagerProps {
  initialLeaves: LeaveData[]
  stats?: {
    pending: number
    approved: number
    rejected: number
  }
}

export function StudentLeavesManager({ initialLeaves, stats }: StudentLeavesManagerProps) {
  const router = useRouter()
  const [reviewingLeave, setReviewingLeave] = useState<LeaveData | null>(null)
  const [reviewAction, setReviewAction] = useState<"approved" | "rejected">("approved")
  const [reviewerRemarks, setReviewerRemarks] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  
  const handleReview = async () => {
    if (!reviewingLeave) return
    
    setIsLoading(true)
    const fd = new FormData()
    fd.append("status", reviewAction)
    if (reviewerRemarks) fd.append("reviewer_remarks", reviewerRemarks)
    
    const result = await reviewLeave(reviewingLeave.id, fd)
    setIsLoading(false)
    
    if (result.error) {
      alert(result.error)
      return
    }
    
    setReviewingLeave(null)
    setReviewerRemarks("")
    router.refresh()
  }
  
  const openReviewDialog = (leave: LeaveData, action: "approved" | "rejected") => {
    setReviewingLeave(leave)
    setReviewAction(action)
    setReviewerRemarks("")
  }
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-100 text-green-800">Approved</Badge>
      case "rejected":
        return <Badge className="bg-red-100 text-red-800">Rejected</Badge>
      case "cancelled":
        return <Badge variant="secondary">Cancelled</Badge>
      default:
        return <Badge variant="outline">Pending</Badge>
    }
  }
  
  const getLeaveTypeBadge = (type: string) => {
    switch (type) {
      case "sick":
        return <Badge className="bg-orange-100 text-orange-800">Sick</Badge>
      case "casual":
        return <Badge className="bg-blue-100 text-blue-800">Casual</Badge>
      case "family":
        return <Badge className="bg-purple-100 text-purple-800">Family</Badge>
      case "medical":
        return <Badge className="bg-red-100 text-red-800">Medical</Badge>
      default:
        return <Badge variant="outline">{type}</Badge>
    }
  }
  
  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pending}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Approved</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.approved}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Rejected</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.rejected}</div>
            </CardContent>
          </Card>
        </div>
      )}
      
      <Card>
        <CardHeader>
          <CardTitle>Leave Requests</CardTitle>
          <CardDescription>
            {initialLeaves.filter(l => l.status === "pending").length} pending requests
          </CardDescription>
        </CardHeader>
        <CardContent>
          {initialLeaves.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CalendarOff className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>No leave requests yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialLeaves.map((leave) => (
                  <TableRow key={leave.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {leave.student?.first_name} {leave.student?.last_name}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {leave.student?.admission_number}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{getLeaveTypeBadge(leave.leave_type)}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {new Date(leave.start_date).toLocaleDateString()}
                        {leave.end_date !== leave.start_date && (
                          <> - {new Date(leave.end_date).toLocaleDateString()}</>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{leave.total_days} day(s)</TableCell>
                    <TableCell className="max-w-xs">
                      <p className="text-sm truncate">{leave.reason}</p>
                    </TableCell>
                    <TableCell>{getStatusBadge(leave.status)}</TableCell>
                    <TableCell className="text-right">
                      {leave.status === "pending" && (
                        <div className="flex justify-end gap-2">
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="text-green-600 border-green-600 hover:bg-green-50"
                            onClick={() => openReviewDialog(leave, "approved")}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="text-red-600 border-red-600 hover:bg-red-50"
                            onClick={() => openReviewDialog(leave, "rejected")}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      )}
                      {leave.reviewer_remarks && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {leave.reviewer_remarks}
                        </p>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      
      {/* Review Dialog */}
      <Dialog open={!!reviewingLeave} onOpenChange={(open: boolean) => !open && setReviewingLeave(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewAction === "approved" ? "Approve" : "Reject"} Leave Request
            </DialogTitle>
            <DialogDescription>
              {reviewingLeave?.student?.first_name} {reviewingLeave?.student?.last_name} - 
              {reviewingLeave?.total_days} day(s) {reviewingLeave?.leave_type} leave
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm font-medium mb-1">Reason for leave:</p>
              <p className="text-sm text-muted-foreground">{reviewingLeave?.reason}</p>
            </div>
            <div className="space-y-2">
              <Label>Remarks (optional)</Label>
              <Textarea
                value={reviewerRemarks}
                onChange={(e) => setReviewerRemarks(e.target.value)}
                placeholder={reviewAction === "approved" 
                  ? "Any notes for the approval..." 
                  : "Reason for rejection..."}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewingLeave(null)}>Cancel</Button>
            <Button 
              onClick={handleReview} 
              disabled={isLoading}
              className={reviewAction === "approved" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
            >
              {isLoading ? "Processing..." : reviewAction === "approved" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}


