"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Plus, Search, Heart, Stethoscope, Pill, ClipboardList,
  AlertTriangle, UserSearch, Pencil, Trash2, Package
} from "lucide-react"
import {
  createClinicVisit,
  upsertHealthProfile,
  getHealthProfile,
  upsertClinicItem,
  deleteClinicItem,
} from "@/lib/actions/health"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"

// ── Types ──

interface VisitData {
  id: string
  student_id: string
  visit_date: string
  complaint: string
  diagnosis: string | null
  treatment: string | null
  medication_given: string | null
  temperature: string | null
  blood_pressure: string | null
  weight: string | null
  action_taken: string | null
  parent_notified: boolean
  follow_up_needed: boolean
  follow_up_date: string | null
  notes: string | null
  students: { first_name: string; last_name: string; admission_number: string } | null
}

interface InventoryItem {
  id: string
  name: string
  category: string | null
  quantity: number
  unit: string | null
  reorder_level: number
  expiry_date: string | null
  notes: string | null
}

interface StudentData {
  id: string
  first_name: string
  last_name: string
  admission_number: string
}

interface HealthClientProps {
  initialVisits: VisitData[]
  initialInventory: InventoryItem[]
  students: StudentData[]
}

const ACTION_OPTIONS = [
  { value: "treated", label: "Treated & Returned to Class" },
  { value: "sent_home", label: "Sent Home" },
  { value: "referred", label: "Referred to Hospital" },
  { value: "observation", label: "Under Observation" },
]

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]

const INVENTORY_CATEGORIES = [
  "Medication", "First Aid", "Equipment", "Supplies", "Hygiene", "Other",
]

const emptyVisitForm = {
  student_id: "",
  complaint: "",
  diagnosis: "",
  treatment: "",
  medication_given: "",
  temperature: "",
  blood_pressure: "",
  weight: "",
  action_taken: "",
  parent_notified: false,
  follow_up_needed: false,
  follow_up_date: "",
  notes: "",
}

const emptyItemForm = {
  id: "",
  name: "",
  category: "",
  quantity: "0",
  unit: "",
  reorder_level: "0",
  expiry_date: "",
  notes: "",
}

const emptyProfileForm = {
  blood_group: "",
  allergies: "",
  chronic_conditions: "",
  current_medications: "",
  immunization_notes: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  doctor_name: "",
  doctor_phone: "",
  insurance_provider: "",
  insurance_number: "",
  special_needs: "",
}

export function HealthClient({ initialVisits, initialInventory, students }: HealthClientProps) {
  const router = useRouter()
  const { toast } = useToast()

  const [activeTab, setActiveTab] = useState<"visits" | "inventory" | "profiles">("visits")
  const [isLoading, setIsLoading] = useState(false)

  // Visit state
  const [isNewVisitOpen, setIsNewVisitOpen] = useState(false)
  const [visitForm, setVisitForm] = useState(emptyVisitForm)
  const [studentSearch, setStudentSearch] = useState("")

  // Inventory state
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false)
  const [itemForm, setItemForm] = useState(emptyItemForm)

  // Profile state
  const [profileSearch, setProfileSearch] = useState("")
  const [selectedStudentId, setSelectedStudentId] = useState("")
  const [profileForm, setProfileForm] = useState(emptyProfileForm)
  const [profileLoaded, setProfileLoaded] = useState(false)

  // ── Stats ──

  const today = new Date().toISOString().slice(0, 10)
  const visitsToday = initialVisits.filter(
    (v) => v.visit_date?.slice(0, 10) === today
  ).length
  const followUpsNeeded = initialVisits.filter((v) => v.follow_up_needed).length

  // ── Filtered students for dropdown ──

  const filteredStudentsForDropdown = useMemo(() => {
    if (!studentSearch.trim()) return students.slice(0, 50)
    const q = studentSearch.toLowerCase()
    return students.filter(
      (s) =>
        s.first_name.toLowerCase().includes(q) ||
        s.last_name.toLowerCase().includes(q) ||
        s.admission_number.toLowerCase().includes(q)
    )
  }, [students, studentSearch])

  // ── Profile search results ──

  const profileSearchResults = useMemo(() => {
    if (!profileSearch.trim()) return []
    const q = profileSearch.toLowerCase()
    return students.filter(
      (s) =>
        s.first_name.toLowerCase().includes(q) ||
        s.last_name.toLowerCase().includes(q) ||
        s.admission_number.toLowerCase().includes(q)
    ).slice(0, 10)
  }, [students, profileSearch])

  // ── Clinic Visit handlers ──

  const handleCreateVisit = async () => {
    if (!visitForm.student_id || !visitForm.complaint.trim()) {
      toast({ title: "Missing fields", description: "Student and complaint are required", variant: "destructive" })
      return
    }

    setIsLoading(true)
    const result = await createClinicVisit({
      student_id: visitForm.student_id,
      complaint: visitForm.complaint,
      diagnosis: visitForm.diagnosis || undefined,
      treatment: visitForm.treatment || undefined,
      medication_given: visitForm.medication_given || undefined,
      temperature: visitForm.temperature || undefined,
      blood_pressure: visitForm.blood_pressure || undefined,
      weight: visitForm.weight || undefined,
      action_taken: visitForm.action_taken || undefined,
      parent_notified: visitForm.parent_notified,
      follow_up_needed: visitForm.follow_up_needed,
      follow_up_date: visitForm.follow_up_date || undefined,
      notes: visitForm.notes || undefined,
    })
    setIsLoading(false)

    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    toast({ title: "Clinic visit recorded" })
    setIsNewVisitOpen(false)
    setVisitForm(emptyVisitForm)
    setStudentSearch("")
    router.refresh()
  }

  // ── Inventory handlers ──

  const openEditItem = (item: InventoryItem) => {
    setItemForm({
      id: item.id,
      name: item.name,
      category: item.category || "",
      quantity: String(item.quantity),
      unit: item.unit || "",
      reorder_level: String(item.reorder_level),
      expiry_date: item.expiry_date || "",
      notes: item.notes || "",
    })
    setIsItemDialogOpen(true)
  }

  const handleSaveItem = async () => {
    if (!itemForm.name.trim()) {
      toast({ title: "Missing fields", description: "Item name is required", variant: "destructive" })
      return
    }

    setIsLoading(true)
    const result = await upsertClinicItem({
      id: itemForm.id || undefined,
      name: itemForm.name,
      category: itemForm.category || undefined,
      quantity: parseInt(itemForm.quantity) || 0,
      unit: itemForm.unit || undefined,
      reorder_level: parseInt(itemForm.reorder_level) || 0,
      expiry_date: itemForm.expiry_date || undefined,
      notes: itemForm.notes || undefined,
    })
    setIsLoading(false)

    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    toast({ title: itemForm.id ? "Item updated" : "Item added" })
    setIsItemDialogOpen(false)
    setItemForm(emptyItemForm)
    router.refresh()
  }

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm("Delete this inventory item?")) return

    const result = await deleteClinicItem(itemId)
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }
    toast({ title: "Item deleted" })
    router.refresh()
  }

  // ── Profile handlers ──

  const handleSelectStudent = async (studentId: string) => {
    setSelectedStudentId(studentId)
    setProfileLoaded(false)
    setIsLoading(true)

    const result = await getHealthProfile(studentId) as any
    setIsLoading(false)

    if (result.data) {
      setProfileForm({
        blood_group: result.data.blood_group || "",
        allergies: result.data.allergies || "",
        chronic_conditions: result.data.chronic_conditions || "",
        current_medications: result.data.current_medications || "",
        immunization_notes: result.data.immunization_notes || "",
        emergency_contact_name: result.data.emergency_contact_name || "",
        emergency_contact_phone: result.data.emergency_contact_phone || "",
        doctor_name: result.data.doctor_name || "",
        doctor_phone: result.data.doctor_phone || "",
        insurance_provider: result.data.insurance_provider || "",
        insurance_number: result.data.insurance_number || "",
        special_needs: result.data.special_needs || "",
      })
    } else {
      setProfileForm(emptyProfileForm)
    }
    setProfileLoaded(true)
  }

  const handleSaveProfile = async () => {
    if (!selectedStudentId) return

    setIsLoading(true)
    const result = await upsertHealthProfile(selectedStudentId, {
      blood_group: profileForm.blood_group || undefined,
      allergies: profileForm.allergies || undefined,
      chronic_conditions: profileForm.chronic_conditions || undefined,
      current_medications: profileForm.current_medications || undefined,
      immunization_notes: profileForm.immunization_notes || undefined,
      emergency_contact_name: profileForm.emergency_contact_name || undefined,
      emergency_contact_phone: profileForm.emergency_contact_phone || undefined,
      doctor_name: profileForm.doctor_name || undefined,
      doctor_phone: profileForm.doctor_phone || undefined,
      insurance_provider: profileForm.insurance_provider || undefined,
      insurance_number: profileForm.insurance_number || undefined,
      special_needs: profileForm.special_needs || undefined,
    })
    setIsLoading(false)

    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    toast({ title: "Health profile saved" })
    router.refresh()
  }

  // ── Helpers ──

  const getActionLabel = (action: string | null) => {
    if (!action) return null
    return ACTION_OPTIONS.find((o) => o.value === action)?.label || action
  }

  const getSelectedStudentName = () => {
    const s = students.find((s) => s.id === selectedStudentId)
    return s ? `${s.first_name} ${s.last_name} (${s.admission_number})` : ""
  }

  // ── Tab buttons ──

  const tabs = [
    { key: "visits" as const, label: "Clinic Visits", icon: Stethoscope },
    { key: "inventory" as const, label: "Inventory", icon: Pill },
    { key: "profiles" as const, label: "Health Profiles", icon: ClipboardList },
  ]

  const lowStockItems = initialInventory.filter(
    (item) => item.quantity <= item.reorder_level
  )

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-neutral-900 mb-2">
            Nursing &amp; Health
          </h1>
          <p className="text-lg text-neutral-500">
            Clinic visits, student health profiles, and medical inventory
          </p>
        </div>
      </div>

      {/* Stats */}
      <Card className="border-0 shadow-xl bg-blue-600">
        <CardContent className="p-6">
          <div className="grid grid-cols-4 gap-6">
            <div className="text-center">
              <Stethoscope className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold">{initialVisits.length}</p>
              <p className="text-white/70 text-sm">Total Visits</p>
            </div>
            <div className="text-center">
              <Heart className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold">{visitsToday}</p>
              <p className="text-white/70 text-sm">Today</p>
            </div>
            <div className="text-center">
              <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold">{followUpsNeeded}</p>
              <p className="text-white/70 text-sm">Follow-ups</p>
            </div>
            <div className="text-center">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold">{initialInventory.length}</p>
              <p className="text-white/70 text-sm">Inventory Items</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Low stock warning */}
      {lowStockItems.length > 0 && (
        <Card className="border-0 shadow-lg border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <div>
              <p className="font-medium text-amber-800 dark:text-amber-200">
                Low Stock Alert: {lowStockItems.length} item{lowStockItems.length !== 1 && "s"} below reorder level
              </p>
              <p className="text-sm text-amber-600 dark:text-amber-400">
                {lowStockItems.map((i) => i.name).join(", ")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ════════════════ CLINIC VISITS TAB ════════════════ */}
      {activeTab === "visits" && (
        <div className="space-y-4">
          <div className="flex items-center justify-end">
            <Button onClick={() => { setVisitForm(emptyVisitForm); setStudentSearch(""); setIsNewVisitOpen(true) }}>
              <Plus className="mr-2 h-4 w-4" />
              New Visit
            </Button>
          </div>

          {initialVisits.length === 0 ? (
            <Card className="border-0 shadow-xl">
              <CardContent className="py-12 text-center text-neutral-500">
                <Stethoscope className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>No clinic visits recorded yet.</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-0 shadow-xl">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date / Time</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>Complaint</TableHead>
                      <TableHead>Diagnosis</TableHead>
                      <TableHead>Action Taken</TableHead>
                      <TableHead>Parent Notified</TableHead>
                      <TableHead>Follow-up</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {initialVisits.map((visit) => (
                      <TableRow key={visit.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {new Date(visit.visit_date).toLocaleDateString()}{" "}
                          <span className="text-neutral-500">
                            {new Date(visit.visit_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium">
                          {visit.students
                            ? `${visit.students.first_name} ${visit.students.last_name}`
                            : "Unknown"}
                          {visit.students && (
                            <span className="block text-xs text-neutral-500">
                              {visit.students.admission_number}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">{visit.complaint}</TableCell>
                        <TableCell className="max-w-[150px] truncate">{visit.diagnosis || "—"}</TableCell>
                        <TableCell>
                          {visit.action_taken ? (
                            <Badge
                              variant="outline"
                              className={
                                visit.action_taken === "sent_home"
                                  ? "border-orange-300 text-orange-700 dark:text-orange-400"
                                  : visit.action_taken === "referred"
                                    ? "border-red-300 text-red-700 dark:text-red-400"
                                    : visit.action_taken === "observation"
                                      ? "border-blue-300 text-blue-700 dark:text-blue-400"
                                      : "border-green-300 text-green-700 dark:text-green-400"
                              }
                            >
                              {getActionLabel(visit.action_taken)}
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          {visit.parent_notified ? (
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                              Yes
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-neutral-500">No</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {visit.follow_up_needed ? (
                            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                              {visit.follow_up_date
                                ? new Date(visit.follow_up_date).toLocaleDateString()
                                : "Needed"}
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ════════════════ INVENTORY TAB ════════════════ */}
      {activeTab === "inventory" && (
        <div className="space-y-4">
          <div className="flex items-center justify-end">
            <Button onClick={() => { setItemForm(emptyItemForm); setIsItemDialogOpen(true) }}>
              <Plus className="mr-2 h-4 w-4" />
              Add Item
            </Button>
          </div>

          {initialInventory.length === 0 ? (
            <Card className="border-0 shadow-xl">
              <CardContent className="py-12 text-center text-neutral-500">
                <Pill className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>No inventory items yet. Add your first item.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {initialInventory.map((item) => {
                const isLow = item.quantity <= item.reorder_level
                const isExpired = item.expiry_date && new Date(item.expiry_date) < new Date()

                return (
                  <Card
                    key={item.id}
                    className={`border-0 shadow-xl hover:shadow-2xl transition-shadow ${
                      isLow ? "ring-2 ring-red-400 dark:ring-red-600" : ""
                    }`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base truncate">{item.name}</CardTitle>
                          <CardDescription className="truncate">
                            {item.category || "Uncategorized"}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-1 ml-2 shrink-0">
                          {isLow && (
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                          )}
                          {isExpired && (
                            <Badge variant="destructive" className="text-xs">Expired</Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-neutral-500">Qty:</span>{" "}
                          <span className={`font-bold ${isLow ? "text-red-600 dark:text-red-400" : ""}`}>
                            {item.quantity}
                          </span>
                          {item.unit && (
                            <span className="text-neutral-500"> {item.unit}</span>
                          )}
                        </div>
                        <div>
                          <span className="text-neutral-500">Reorder at:</span>{" "}
                          <span className="font-medium">{item.reorder_level}</span>
                        </div>
                        {item.expiry_date && (
                          <div className="col-span-2">
                            <span className="text-neutral-500">Expires:</span>{" "}
                            <span className={`font-medium ${isExpired ? "text-red-600 dark:text-red-400" : ""}`}>
                              {new Date(item.expiry_date).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 pt-2 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditItem(item)}
                        >
                          <Pencil className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteItem(item.id)}
                          className="ml-auto text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════════════ HEALTH PROFILES TAB ════════════════ */}
      {activeTab === "profiles" && (
        <div className="space-y-4">
          <Card className="border-0 shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserSearch className="h-5 w-5" />
                Find Student
              </CardTitle>
              <CardDescription>Search by name or admission number to view/edit health profile</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
                <Input
                  placeholder="Search student name or admission number..."
                  value={profileSearch}
                  onChange={(e) => {
                    setProfileSearch(e.target.value)
                    setSelectedStudentId("")
                    setProfileLoaded(false)
                  }}
                  className="pl-10"
                />
              </div>

              {profileSearch.trim() && profileSearchResults.length > 0 && !selectedStudentId && (
                <div className="mt-3 border rounded-lg divide-y max-h-60 overflow-auto">
                  {profileSearchResults.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setProfileSearch(`${s.first_name} ${s.last_name}`)
                        handleSelectStudent(s.id)
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-neutral-100 transition-colors flex items-center justify-between"
                    >
                      <span className="font-medium">{s.first_name} {s.last_name}</span>
                      <span className="text-sm text-neutral-500">{s.admission_number}</span>
                    </button>
                  ))}
                </div>
              )}

              {profileSearch.trim() && profileSearchResults.length === 0 && !selectedStudentId && (
                <p className="mt-3 text-sm text-neutral-500">No students match your search.</p>
              )}
            </CardContent>
          </Card>

          {selectedStudentId && profileLoaded && (
            <Card className="border-0 shadow-xl">
              <CardHeader>
                <CardTitle>Health Profile — {getSelectedStudentName()}</CardTitle>
                <CardDescription>Update medical information for this student</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Blood Group</Label>
                    <Select
                      value={profileForm.blood_group}
                      onValueChange={(v) => setProfileForm({ ...profileForm, blood_group: v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Select blood group" /></SelectTrigger>
                      <SelectContent>
                        {BLOOD_GROUPS.map((bg) => (
                          <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Doctor Name</Label>
                    <Input
                      value={profileForm.doctor_name}
                      onChange={(e) => setProfileForm({ ...profileForm, doctor_name: e.target.value })}
                      placeholder="Family doctor"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Doctor Phone</Label>
                    <Input
                      value={profileForm.doctor_phone}
                      onChange={(e) => setProfileForm({ ...profileForm, doctor_phone: e.target.value })}
                      placeholder="Doctor's phone"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Emergency Contact Name</Label>
                    <Input
                      value={profileForm.emergency_contact_name}
                      onChange={(e) => setProfileForm({ ...profileForm, emergency_contact_name: e.target.value })}
                      placeholder="Emergency contact"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Emergency Contact Phone</Label>
                    <Input
                      value={profileForm.emergency_contact_phone}
                      onChange={(e) => setProfileForm({ ...profileForm, emergency_contact_phone: e.target.value })}
                      placeholder="Emergency phone"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Insurance Provider</Label>
                    <Input
                      value={profileForm.insurance_provider}
                      onChange={(e) => setProfileForm({ ...profileForm, insurance_provider: e.target.value })}
                      placeholder="Insurance company"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Insurance Number</Label>
                    <Input
                      value={profileForm.insurance_number}
                      onChange={(e) => setProfileForm({ ...profileForm, insurance_number: e.target.value })}
                      placeholder="Policy number"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Allergies</Label>
                    <Textarea
                      value={profileForm.allergies}
                      onChange={(e) => setProfileForm({ ...profileForm, allergies: e.target.value })}
                      placeholder="List any known allergies..."
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Chronic Conditions</Label>
                    <Textarea
                      value={profileForm.chronic_conditions}
                      onChange={(e) => setProfileForm({ ...profileForm, chronic_conditions: e.target.value })}
                      placeholder="Asthma, diabetes, epilepsy, etc."
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Current Medications</Label>
                    <Textarea
                      value={profileForm.current_medications}
                      onChange={(e) => setProfileForm({ ...profileForm, current_medications: e.target.value })}
                      placeholder="Medications currently being taken..."
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Immunization Notes</Label>
                    <Textarea
                      value={profileForm.immunization_notes}
                      onChange={(e) => setProfileForm({ ...profileForm, immunization_notes: e.target.value })}
                      placeholder="Vaccination records, pending shots..."
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label>Special Needs</Label>
                    <Textarea
                      value={profileForm.special_needs}
                      onChange={(e) => setProfileForm({ ...profileForm, special_needs: e.target.value })}
                      placeholder="Any special medical needs or accommodations..."
                      rows={3}
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t">
                  <Button onClick={handleSaveProfile} disabled={isLoading}>
                    {isLoading ? "Saving..." : "Save Health Profile"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ════════════════ NEW VISIT DIALOG ════════════════ */}
      <Dialog open={isNewVisitOpen} onOpenChange={setIsNewVisitOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Clinic Visit</DialogTitle>
            <DialogDescription>Record a new student clinic visit</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Student selection */}
            <div className="space-y-2">
              <Label>Student *</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
                <Input
                  placeholder="Search student..."
                  value={studentSearch}
                  onChange={(e) => {
                    setStudentSearch(e.target.value)
                    if (visitForm.student_id) {
                      setVisitForm({ ...visitForm, student_id: "" })
                    }
                  }}
                  className="pl-10"
                />
              </div>
              {visitForm.student_id && (
                <p className="text-sm text-green-600 dark:text-green-400">
                  Selected: {students.find((s) => s.id === visitForm.student_id)
                    ? `${students.find((s) => s.id === visitForm.student_id)!.first_name} ${students.find((s) => s.id === visitForm.student_id)!.last_name}`
                    : ""}
                </p>
              )}
              {studentSearch.trim() && !visitForm.student_id && (
                <div className="border rounded-lg divide-y max-h-40 overflow-auto">
                  {filteredStudentsForDropdown.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setVisitForm({ ...visitForm, student_id: s.id })
                        setStudentSearch(`${s.first_name} ${s.last_name}`)
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-neutral-100 transition-colors text-sm"
                    >
                      {s.first_name} {s.last_name}{" "}
                      <span className="text-neutral-500">({s.admission_number})</span>
                    </button>
                  ))}
                  {filteredStudentsForDropdown.length === 0 && (
                    <p className="px-3 py-2 text-sm text-neutral-500">No students found</p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Complaint *</Label>
              <Textarea
                value={visitForm.complaint}
                onChange={(e) => setVisitForm({ ...visitForm, complaint: e.target.value })}
                placeholder="What brought the student to the clinic?"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Diagnosis</Label>
                <Input
                  value={visitForm.diagnosis}
                  onChange={(e) => setVisitForm({ ...visitForm, diagnosis: e.target.value })}
                  placeholder="Diagnosis"
                />
              </div>
              <div className="space-y-2">
                <Label>Treatment</Label>
                <Input
                  value={visitForm.treatment}
                  onChange={(e) => setVisitForm({ ...visitForm, treatment: e.target.value })}
                  placeholder="Treatment given"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Medication Given</Label>
              <Input
                value={visitForm.medication_given}
                onChange={(e) => setVisitForm({ ...visitForm, medication_given: e.target.value })}
                placeholder="Any medication administered"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Temperature</Label>
                <Input
                  value={visitForm.temperature}
                  onChange={(e) => setVisitForm({ ...visitForm, temperature: e.target.value })}
                  placeholder="e.g. 37.5°C"
                />
              </div>
              <div className="space-y-2">
                <Label>Blood Pressure</Label>
                <Input
                  value={visitForm.blood_pressure}
                  onChange={(e) => setVisitForm({ ...visitForm, blood_pressure: e.target.value })}
                  placeholder="e.g. 120/80"
                />
              </div>
              <div className="space-y-2">
                <Label>Weight</Label>
                <Input
                  value={visitForm.weight}
                  onChange={(e) => setVisitForm({ ...visitForm, weight: e.target.value })}
                  placeholder="e.g. 45 kg"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Action Taken</Label>
              <Select
                value={visitForm.action_taken}
                onValueChange={(v) => setVisitForm({ ...visitForm, action_taken: v })}
              >
                <SelectTrigger><SelectValue placeholder="Select action taken" /></SelectTrigger>
                <SelectContent>
                  {ACTION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="parent_notified"
                  checked={visitForm.parent_notified}
                  onCheckedChange={(checked) =>
                    setVisitForm({ ...visitForm, parent_notified: checked === true })
                  }
                />
                <label htmlFor="parent_notified" className="text-sm font-medium cursor-pointer">
                  Parent Notified
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="follow_up_needed"
                  checked={visitForm.follow_up_needed}
                  onCheckedChange={(checked) =>
                    setVisitForm({ ...visitForm, follow_up_needed: checked === true })
                  }
                />
                <label htmlFor="follow_up_needed" className="text-sm font-medium cursor-pointer">
                  Follow-up Needed
                </label>
              </div>
            </div>

            {visitForm.follow_up_needed && (
              <div className="space-y-2">
                <Label>Follow-up Date</Label>
                <Input
                  type="date"
                  value={visitForm.follow_up_date}
                  onChange={(e) => setVisitForm({ ...visitForm, follow_up_date: e.target.value })}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Additional Notes</Label>
              <Textarea
                value={visitForm.notes}
                onChange={(e) => setVisitForm({ ...visitForm, notes: e.target.value })}
                placeholder="Any additional notes..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewVisitOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreateVisit}
              disabled={isLoading || !visitForm.student_id || !visitForm.complaint.trim()}
            >
              {isLoading ? "Saving..." : "Record Visit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════ INVENTORY ITEM DIALOG ════════════════ */}
      <Dialog open={isItemDialogOpen} onOpenChange={setIsItemDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{itemForm.id ? "Edit Item" : "Add Inventory Item"}</DialogTitle>
            <DialogDescription>
              {itemForm.id ? "Update inventory item details" : "Add a new item to clinic inventory"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  value={itemForm.name}
                  onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                  placeholder="Item name"
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={itemForm.category}
                  onValueChange={(v) => setItemForm({ ...itemForm, category: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {INVENTORY_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min="0"
                  value={itemForm.quantity}
                  onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Input
                  value={itemForm.unit}
                  onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })}
                  placeholder="e.g. tablets, boxes"
                />
              </div>
              <div className="space-y-2">
                <Label>Reorder Level</Label>
                <Input
                  type="number"
                  min="0"
                  value={itemForm.reorder_level}
                  onChange={(e) => setItemForm({ ...itemForm, reorder_level: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Expiry Date</Label>
              <Input
                type="date"
                value={itemForm.expiry_date}
                onChange={(e) => setItemForm({ ...itemForm, expiry_date: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={itemForm.notes}
                onChange={(e) => setItemForm({ ...itemForm, notes: e.target.value })}
                placeholder="Any notes about this item..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsItemDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSaveItem}
              disabled={isLoading || !itemForm.name.trim()}
            >
              {isLoading ? "Saving..." : itemForm.id ? "Save Changes" : "Add Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
