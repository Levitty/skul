"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Plus, Trash2, MapPin } from "lucide-react"
import { assignStudentToTransport, removeStudentFromTransport } from "@/lib/actions/transport"
import { useRouter } from "next/navigation"

interface AssignmentData {
  id: string
  student_id: string
  route_id: string
  stop_id: string | null
  transport_type: string
  fee_amount: number
  fee_paid: number
  payment_status: string
  is_active: boolean
  student?: { id: string; first_name: string; last_name: string; admission_number: string }
  route?: { id: string; name: string; route_number: string }
  stop?: { id: string; stop_name: string }
}

interface RouteData {
  id: string
  name: string
  route_number: string | null
  fee_amount: number
  stops?: { id: string; stop_name: string; stop_order: number }[]
}

interface StudentData {
  id: string
  first_name: string
  last_name: string
  admission_number: string
}

interface TransportAssignmentsManagerProps {
  initialAssignments: AssignmentData[]
  routes: RouteData[]
  students: StudentData[]
  currentAcademicYearId?: string
}

export function TransportAssignmentsManager({ 
  initialAssignments, 
  routes, 
  students,
  currentAcademicYearId 
}: TransportAssignmentsManagerProps) {
  const router = useRouter()
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedRoute, setSelectedRoute] = useState<RouteData | null>(null)
  
  const [formData, setFormData] = useState({
    student_id: "",
    route_id: "",
    stop_id: "",
    transport_type: "both",
    fee_amount: "",
  })
  
  const resetForm = () => {
    setFormData({
      student_id: "",
      route_id: "",
      stop_id: "",
      transport_type: "both",
      fee_amount: "",
    })
    setSelectedRoute(null)
  }
  
  const handleRouteChange = (routeId: string) => {
    const route = routes.find(r => r.id === routeId)
    setSelectedRoute(route || null)
    setFormData({ 
      ...formData, 
      route_id: routeId,
      stop_id: "",
      fee_amount: route?.fee_amount?.toString() || ""
    })
  }
  
  const handleAdd = async () => {
    if (!formData.student_id || !formData.route_id || !currentAcademicYearId) {
      alert("Please select a student and route")
      return
    }
    
    setIsLoading(true)
    const fd = new FormData()
    fd.append("student_id", formData.student_id)
    fd.append("route_id", formData.route_id)
    fd.append("academic_year_id", currentAcademicYearId)
    if (formData.stop_id) fd.append("stop_id", formData.stop_id)
    fd.append("transport_type", formData.transport_type)
    if (formData.fee_amount) fd.append("fee_amount", formData.fee_amount)
    
    const result = await assignStudentToTransport(fd)
    setIsLoading(false)
    
    if (result.error) {
      alert(result.error)
      return
    }
    
    setIsAddDialogOpen(false)
    resetForm()
    router.refresh()
  }
  
  const handleRemove = async (assignmentId: string) => {
    if (!confirm("Are you sure you want to remove this student from transport?")) return
    
    const result = await removeStudentFromTransport(assignmentId)
    if (result.error) {
      alert(result.error)
      return
    }
    router.refresh()
  }
  
  // Get students not yet assigned
  const assignedStudentIds = initialAssignments.map(a => a.student_id)
  const availableStudents = students.filter(s => !assignedStudentIds.includes(s.id))
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Student Transport Assignments</CardTitle>
            <CardDescription>
              {initialAssignments.length} students assigned to transport
            </CardDescription>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm} disabled={!currentAcademicYearId}>
                <Plus className="mr-2 h-4 w-4" />
                Assign Student
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Assign Student to Transport</DialogTitle>
                <DialogDescription>Select a student and assign them to a route</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Student *</Label>
                  <Select value={formData.student_id} onValueChange={(v) => setFormData({ ...formData, student_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select student" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableStudents.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.first_name} {s.last_name} ({s.admission_number})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Route *</Label>
                  <Select value={formData.route_id} onValueChange={handleRouteChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select route" />
                    </SelectTrigger>
                    <SelectContent>
                      {routes.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name} {r.route_number && `(${r.route_number})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedRoute?.stops && selectedRoute.stops.length > 0 && (
                  <div className="space-y-2">
                    <Label>Pickup/Drop Stop</Label>
                    <Select value={formData.stop_id} onValueChange={(v) => setFormData({ ...formData, stop_id: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select stop (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">No specific stop</SelectItem>
                        {selectedRoute.stops
                          .sort((a, b) => a.stop_order - b.stop_order)
                          .map((stop) => (
                            <SelectItem key={stop.id} value={stop.id}>
                              {stop.stop_order}. {stop.stop_name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Transport Type</Label>
                  <Select value={formData.transport_type} onValueChange={(v) => setFormData({ ...formData, transport_type: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="both">Both (Pickup & Drop)</SelectItem>
                      <SelectItem value="pickup">Pickup Only</SelectItem>
                      <SelectItem value="dropoff">Drop Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Fee Amount</Label>
                  <Input
                    type="number"
                    value={formData.fee_amount}
                    onChange={(e) => setFormData({ ...formData, fee_amount: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleAdd} disabled={isLoading || !formData.student_id || !formData.route_id}>
                  {isLoading ? "Assigning..." : "Assign Student"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {!currentAcademicYearId ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No active academic year. Please set an academic year as current first.</p>
            </div>
          ) : initialAssignments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MapPin className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>No students assigned to transport yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Stop</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Fee</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialAssignments.map((assignment) => (
                  <TableRow key={assignment.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {assignment.student?.first_name} {assignment.student?.last_name}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {assignment.student?.admission_number}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div>{assignment.route?.name}</div>
                        {assignment.route?.route_number && (
                          <div className="text-sm text-muted-foreground">{assignment.route.route_number}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{assignment.stop?.stop_name || "-"}</TableCell>
                    <TableCell className="capitalize">{assignment.transport_type}</TableCell>
                    <TableCell>${assignment.fee_amount || 0}</TableCell>
                    <TableCell>
                      <Badge variant={
                        assignment.payment_status === "paid" ? "default" :
                        assignment.payment_status === "partial" ? "secondary" : "outline"
                      }>
                        {assignment.payment_status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={assignment.is_active ? "default" : "secondary"}>
                        {assignment.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleRemove(assignment.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}


