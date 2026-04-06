"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import { createStudentWithFullDetails, type EnhancedStudentData } from "@/lib/actions/students-enhanced"
import { ChevronLeft, ChevronRight, Check, User, School, GraduationCap, BookOpen, Users, Phone, Bus, Home, DollarSign, Lock, Activity } from "lucide-react"

interface EnhancedAdmissionFormProps {
  classes: any[]
  sections: any[]
  subjects: any[]
  activities: any[]
  transportRoutes: any[]
  hostels: any[]
  feeStructures: any[]
  terms: any[]
}

const STEPS = [
  { id: 1, name: "Personal Details", icon: User },
  { id: 2, name: "Previous School", icon: School },
  { id: 3, name: "Admission Details", icon: GraduationCap },
  { id: 4, name: "Subjects", icon: BookOpen },
  { id: 5, name: "Activities", icon: Activity },
  { id: 6, name: "Parent/Guardian", icon: Users },
  { id: 7, name: "Emergency Contact", icon: Phone },
  { id: 8, name: "Transport", icon: Bus },
  { id: 9, name: "Hostel", icon: Home },
  { id: 10, name: "Fee Structure", icon: DollarSign },
  { id: 11, name: "Login Details", icon: Lock },
  { id: 12, name: "Status", icon: Check },
]

export function EnhancedAdmissionForm({
  classes,
  sections,
  subjects,
  activities,
  transportRoutes,
  hostels,
  feeStructures,
  terms,
}: EnhancedAdmissionFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)

  const [formData, setFormData] = useState<Partial<EnhancedStudentData>>({
    first_name: "",
    last_name: "",
    middle_name: "",
    dob: "",
    gender: "",
    religion: "",
    blood_group: "",
    address: "",
    phone: "",
    email: "",
    city: "",
    country: "",
    extra_notes: "",
    dob_in_words: "",
    birth_place: "",
    previous_school_name: "",
    previous_school_address: "",
    previous_school_class: "",
    previous_school_passout_year: undefined,
    admission_date: new Date().toISOString().split("T")[0],
    class_id: "",
    section_id: "",
    subject_ids: [],
    activity_ids: [],
    guardians: [{ name: "", relation: "parent", phone: "", email: "", occupation: "", is_primary: true, is_billing_contact: true }],
    emergency_contacts: [{ name: "", relation: "", phone: "", email: "", address: "", is_primary: true }],
    transport_route_id: "",
    hostel_id: "",
    boarding_enabled: false,
    transport_enabled: false,
    selected_fee_structure_ids: [],
    login_option: "disallow",
    status: "active",
    generate_invoice: true,
    term_id: "",
  })

  const updateFormData = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // Filter sections by selected class
  const filteredSections = (sections || []).filter((s: any) => {
    // Handle both direct class_id and nested classes.class_id
    const sectionClassId = s.class_id || s.classes?.id
    return sectionClassId === formData.class_id
  })
  const filteredSubjects = subjects.filter((s: any) => 
    s.class_subjects?.some((cs: any) => cs.class_id === formData.class_id) || true
  )
  const filteredFeeStructures = feeStructures.filter((f: any) => 
    !f.class_id || f.class_id === formData.class_id
  )

  const handleNext = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(prev => prev + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1)
    }
  }

  const handleSubmit = async () => {
    console.log("SUBMIT CLICKED - formData:", JSON.stringify({first_name: formData.first_name, last_name: formData.last_name, class_id: formData.class_id, guardians: formData.guardians}))
    if (!formData.first_name || !formData.last_name || !formData.class_id) {
      console.log("VALIDATION FAILED: missing required fields")
      toast({
        title: "Error",
        description: "Please fill in required fields (First Name, Last Name, Class)",
        variant: "destructive",
      })
      return
    }

    if (!formData.guardians || formData.guardians.length === 0 || !formData.guardians[0].name) {
      toast({
        title: "Error",
        description: "Please add at least one guardian",
        variant: "destructive",
      })
      return
    }

    setLoading(true)
    console.log("CALLING createStudentWithFullDetails...")

    try {
      const result = await createStudentWithFullDetails(formData as EnhancedStudentData)
      console.log("SERVER ACTION RESULT:", JSON.stringify(result))

      if (result.error) {
        throw new Error(result.error)
      }

      const warnings = result.data?.warnings || []
      if (warnings.length > 0) {
        toast({
          title: "Student Admitted (with warnings)",
          description: warnings.join(" | "),
          variant: "destructive",
        })
      } else {
        toast({
          title: "Success!",
          description: "Student admitted successfully.",
        })
      }

      router.push(`/dashboard/admin/students/${result.data?.student.id}`)
      router.refresh()
    } catch (err: any) {
      console.log("CATCH ERROR:", err.message)
      toast({
        title: "Error",
        description: err.message || "Failed to create student",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
      console.log("SUBMIT COMPLETE")
    }
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="first_name">First Name *</Label>
                <Input
                  id="first_name"
                  value={formData.first_name || ""}
                  onChange={(e) => updateFormData("first_name", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="middle_name">Middle Name</Label>
                <Input
                  id="middle_name"
                  value={formData.middle_name || ""}
                  onChange={(e) => updateFormData("middle_name", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Last Name *</Label>
                <Input
                  id="last_name"
                  value={formData.last_name || ""}
                  onChange={(e) => updateFormData("last_name", e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="gender">Gender</Label>
                <Select value={formData.gender || ""} onValueChange={(v) => updateFormData("gender", v)}>
                  <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dob">Date of Birth</Label>
                <Input
                  id="dob"
                  type="date"
                  value={formData.dob || ""}
                  onChange={(e) => updateFormData("dob", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dob_in_words">DOB in Words</Label>
                <Input
                  id="dob_in_words"
                  value={formData.dob_in_words || ""}
                  onChange={(e) => updateFormData("dob_in_words", e.target.value)}
                  placeholder="e.g., First of January, Two Thousand Ten"
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="religion">Religion</Label>
                <Input
                  id="religion"
                  value={formData.religion || ""}
                  onChange={(e) => updateFormData("religion", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="blood_group">Blood Group</Label>
                <Select value={formData.blood_group || ""} onValueChange={(v) => updateFormData("blood_group", v)}>
                  <SelectTrigger><SelectValue placeholder="Select blood group" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A+">A+</SelectItem>
                    <SelectItem value="A-">A-</SelectItem>
                    <SelectItem value="B+">B+</SelectItem>
                    <SelectItem value="B-">B-</SelectItem>
                    <SelectItem value="AB+">AB+</SelectItem>
                    <SelectItem value="AB-">AB-</SelectItem>
                    <SelectItem value="O+">O+</SelectItem>
                    <SelectItem value="O-">O-</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="birth_place">Birth Place</Label>
                <Input
                  id="birth_place"
                  value={formData.birth_place || ""}
                  onChange={(e) => updateFormData("birth_place", e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={formData.address || ""}
                  onChange={(e) => updateFormData("address", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={formData.city || ""}
                  onChange={(e) => updateFormData("city", e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  value={formData.country || ""}
                  onChange={(e) => updateFormData("country", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone || ""}
                  onChange={(e) => updateFormData("phone", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email || ""}
                  onChange={(e) => updateFormData("email", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="extra_notes">Extra Notes / Details</Label>
              <Input
                id="extra_notes"
                value={formData.extra_notes || ""}
                onChange={(e) => updateFormData("extra_notes", e.target.value)}
              />
            </div>
          </div>
        )

      case 2:
        return (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="previous_school_name">School Name</Label>
                <Input
                  id="previous_school_name"
                  value={formData.previous_school_name || ""}
                  onChange={(e) => updateFormData("previous_school_name", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="previous_school_address">School Address</Label>
                <Input
                  id="previous_school_address"
                  value={formData.previous_school_address || ""}
                  onChange={(e) => updateFormData("previous_school_address", e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="previous_school_class">Class</Label>
                <Input
                  id="previous_school_class"
                  value={formData.previous_school_class || ""}
                  onChange={(e) => updateFormData("previous_school_class", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="previous_school_passout_year">Passout Year</Label>
                <Input
                  id="previous_school_passout_year"
                  type="number"
                  value={formData.previous_school_passout_year || ""}
                  onChange={(e) => updateFormData("previous_school_passout_year", e.target.value ? parseInt(e.target.value) : undefined)}
                />
              </div>
            </div>
          </div>
        )

      case 3:
        return (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="admission_date">Admission Date</Label>
                <Input
                  id="admission_date"
                  type="date"
                  value={formData.admission_date || ""}
                  onChange={(e) => updateFormData("admission_date", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="class_id">Class *</Label>
                <Select value={formData.class_id || ""} onValueChange={(v) => updateFormData("class_id", v)}>
                  <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                  <SelectContent>
                    {classes.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="section_id">Section</Label>
                <Select 
                  value={formData.section_id || ""} 
                  onValueChange={(v) => updateFormData("section_id", v)}
                  disabled={!formData.class_id || filteredSections.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={
                      !formData.class_id 
                        ? "Select a class first" 
                        : filteredSections.length === 0 
                        ? "No sections available" 
                        : "Select section"
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredSections.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        No sections found for this class
                      </div>
                    ) : (
                      filteredSections.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Admission Number</Label>
                <Input disabled placeholder="Auto-generated" />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Roll Number</Label>
                <Input disabled placeholder="Auto-generated" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="photo">Upload Photo</Label>
                <Input id="photo" type="file" accept="image/*" />
              </div>
            </div>
          </div>
        )

      case 4:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Select subjects for the student:</p>
            {filteredSubjects.length === 0 ? (
              <p className="text-muted-foreground">No subjects available for the selected class.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {filteredSubjects.map((subject: any) => (
                  <div key={subject.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`subject-${subject.id}`}
                      checked={formData.subject_ids?.includes(subject.id)}
                      onCheckedChange={(checked) => {
                        const current = formData.subject_ids || []
                        if (checked) {
                          updateFormData("subject_ids", [...current, subject.id])
                        } else {
                          updateFormData("subject_ids", current.filter(id => id !== subject.id))
                        }
                      }}
                    />
                    <Label htmlFor={`subject-${subject.id}`} className="cursor-pointer">
                      {subject.name}
                    </Label>
                  </div>
                ))}
              </div>
            )}
          </div>
        )

      case 5:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Select activities for the student (amounts will be added to invoice):</p>
            {activities.length === 0 ? (
              <p className="text-muted-foreground">No activities available.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {activities.map((activity: any) => (
                  <div key={activity.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={`activity-${activity.id}`}
                        checked={formData.activity_ids?.includes(activity.id)}
                        onCheckedChange={(checked) => {
                          const current = formData.activity_ids || []
                          if (checked) {
                            updateFormData("activity_ids", [...current, activity.id])
                          } else {
                            updateFormData("activity_ids", current.filter(id => id !== activity.id))
                          }
                        }}
                      />
                      <Label htmlFor={`activity-${activity.id}`} className="cursor-pointer">
                        {activity.name}
                      </Label>
                    </div>
                    <span className="text-sm font-medium text-green-600">
                      KES {activity.fee_amount?.toLocaleString() || 0}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )

      case 6:
        return (
          <div className="space-y-6">
            {formData.guardians?.map((guardian, index) => (
              <Card key={index}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">
                    {index === 0 ? "Primary Guardian" : `Guardian ${index + 1}`}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Name *</Label>
                      <Input
                        value={guardian.name}
                        onChange={(e) => {
                          const updated = [...(formData.guardians || [])]
                          updated[index] = { ...updated[index], name: e.target.value }
                          updateFormData("guardians", updated)
                        }}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Relation</Label>
                      <Select 
                        value={guardian.relation} 
                        onValueChange={(v) => {
                          const updated = [...(formData.guardians || [])]
                          updated[index] = { ...updated[index], relation: v }
                          updateFormData("guardians", updated)
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Select relation" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="parent">Parent</SelectItem>
                          <SelectItem value="mother">Mother</SelectItem>
                          <SelectItem value="father">Father</SelectItem>
                          <SelectItem value="guardian">Guardian</SelectItem>
                          <SelectItem value="uncle">Uncle</SelectItem>
                          <SelectItem value="aunt">Aunt</SelectItem>
                          <SelectItem value="grandparent">Grandparent</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Phone *</Label>
                      <Input
                        value={guardian.phone}
                        onChange={(e) => {
                          const updated = [...(formData.guardians || [])]
                          updated[index] = { ...updated[index], phone: e.target.value }
                          updateFormData("guardians", updated)
                        }}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={guardian.email}
                        onChange={(e) => {
                          const updated = [...(formData.guardians || [])]
                          updated[index] = { ...updated[index], email: e.target.value }
                          updateFormData("guardians", updated)
                        }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Occupation</Label>
                    <Input
                      value={guardian.occupation}
                      onChange={(e) => {
                        const updated = [...(formData.guardians || [])]
                        updated[index] = { ...updated[index], occupation: e.target.value }
                        updateFormData("guardians", updated)
                      }}
                    />
                  </div>
                  {index > 0 && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        const updated = formData.guardians?.filter((_, i) => i !== index)
                        updateFormData("guardians", updated)
                      }}
                    >
                      Remove Guardian
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const updated = [
                  ...(formData.guardians || []),
                  { name: "", relation: "guardian", phone: "", email: "", occupation: "", is_primary: false, is_billing_contact: false }
                ]
                updateFormData("guardians", updated)
              }}
            >
              + Add Another Guardian
            </Button>
          </div>
        )

      case 7:
        return (
          <div className="space-y-6">
            {formData.emergency_contacts?.map((contact, index) => (
              <Card key={index}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">
                    {index === 0 ? "Primary Emergency Contact" : `Emergency Contact ${index + 1}`}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Name *</Label>
                      <Input
                        value={contact.name}
                        onChange={(e) => {
                          const updated = [...(formData.emergency_contacts || [])]
                          updated[index] = { ...updated[index], name: e.target.value }
                          updateFormData("emergency_contacts", updated)
                        }}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Relation *</Label>
                      <Input
                        value={contact.relation}
                        onChange={(e) => {
                          const updated = [...(formData.emergency_contacts || [])]
                          updated[index] = { ...updated[index], relation: e.target.value }
                          updateFormData("emergency_contacts", updated)
                        }}
                        required
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Phone *</Label>
                      <Input
                        value={contact.phone}
                        onChange={(e) => {
                          const updated = [...(formData.emergency_contacts || [])]
                          updated[index] = { ...updated[index], phone: e.target.value }
                          updateFormData("emergency_contacts", updated)
                        }}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={contact.email}
                        onChange={(e) => {
                          const updated = [...(formData.emergency_contacts || [])]
                          updated[index] = { ...updated[index], email: e.target.value }
                          updateFormData("emergency_contacts", updated)
                        }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Address</Label>
                    <Input
                      value={contact.address}
                      onChange={(e) => {
                        const updated = [...(formData.emergency_contacts || [])]
                        updated[index] = { ...updated[index], address: e.target.value }
                        updateFormData("emergency_contacts", updated)
                      }}
                    />
                  </div>
                  {index > 0 && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        const updated = formData.emergency_contacts?.filter((_, i) => i !== index)
                        updateFormData("emergency_contacts", updated)
                      }}
                    >
                      Remove Contact
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const updated = [
                  ...(formData.emergency_contacts || []),
                  { name: "", relation: "", phone: "", email: "", address: "", is_primary: false }
                ]
                updateFormData("emergency_contacts", updated)
              }}
            >
              + Add Another Emergency Contact
            </Button>
          </div>
        )

      case 8:
        return (
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="transport_enabled"
                checked={formData.transport_enabled}
                onCheckedChange={(checked) => updateFormData("transport_enabled", checked)}
              />
              <Label htmlFor="transport_enabled" className="cursor-pointer">
                Enable Transport
              </Label>
            </div>
            {formData.transport_enabled && (
              <div className="space-y-2">
                <Label htmlFor="transport_route_id">Transport Route</Label>
                <Select 
                  value={formData.transport_route_id || ""} 
                  onValueChange={(v) => updateFormData("transport_route_id", v)}
                >
                  <SelectTrigger><SelectValue placeholder="Select transport route" /></SelectTrigger>
                  <SelectContent>
                    {transportRoutes.map((route: any) => (
                      <SelectItem key={route.id} value={route.id}>
                        {route.name} - KES {route.fee_amount?.toLocaleString() || 0}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )

      case 9:
        return (
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="boarding_enabled"
                checked={formData.boarding_enabled}
                onCheckedChange={(checked) => updateFormData("boarding_enabled", checked)}
              />
              <Label htmlFor="boarding_enabled" className="cursor-pointer">
                Enable Boarding
              </Label>
            </div>
            {formData.boarding_enabled && (
              <div className="space-y-2">
                <Label htmlFor="hostel_id">Hostel</Label>
                <Select 
                  value={formData.hostel_id || ""} 
                  onValueChange={(v) => updateFormData("hostel_id", v)}
                >
                  <SelectTrigger><SelectValue placeholder="Select hostel" /></SelectTrigger>
                  <SelectContent>
                    {hostels.map((hostel: any) => (
                      <SelectItem key={hostel.id} value={hostel.id}>
                        {hostel.name} ({hostel.current_occupancy || 0}/{hostel.capacity || "∞"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )

      case 10:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Fee structure for the selected class. Uncheck any that don&apos;t apply:
            </p>
            {filteredFeeStructures.length === 0 ? (
              <p className="text-muted-foreground">No fee structures found for the selected class.</p>
            ) : (
              <div className="space-y-3">
                {filteredFeeStructures.map((fee: any) => (
                  <div key={fee.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={`fee-${fee.id}`}
                        checked={formData.selected_fee_structure_ids?.includes(fee.id)}
                        onCheckedChange={(checked) => {
                          const current = formData.selected_fee_structure_ids || []
                          if (checked) {
                            updateFormData("selected_fee_structure_ids", [...current, fee.id])
                          } else {
                            updateFormData("selected_fee_structure_ids", current.filter(id => id !== fee.id))
                          }
                        }}
                      />
                      <Label htmlFor={`fee-${fee.id}`} className="cursor-pointer">
                        {fee.name} <span className="text-xs text-muted-foreground">({fee.fee_type})</span>
                      </Label>
                    </div>
                    <span className="text-sm font-medium text-green-600">
                      KES {fee.amount?.toLocaleString() || 0}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center space-x-2 pt-4">
              <Checkbox
                id="generate_invoice"
                checked={formData.generate_invoice}
                onCheckedChange={(checked) => updateFormData("generate_invoice", checked)}
              />
              <Label htmlFor="generate_invoice" className="cursor-pointer">
                Generate invoice on admission
              </Label>
            </div>
            {formData.generate_invoice && (
              <div className="space-y-2">
                <Label htmlFor="term_id">Term</Label>
                <Select 
                  value={formData.term_id || ""} 
                  onValueChange={(v) => updateFormData("term_id", v)}
                >
                  <SelectTrigger><SelectValue placeholder="Select term" /></SelectTrigger>
                  <SelectContent>
                    {terms.map((term: any) => (
                      <SelectItem key={term.id} value={term.id}>
                        {term.name} {term.is_current && "(Current)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )

      case 11:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Login Option</Label>
              <Select 
                value={formData.login_option || "disallow"} 
                onValueChange={(v: any) => updateFormData("login_option", v)}
              >
                <SelectTrigger><SelectValue placeholder="Select login option" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="disallow">Disallow Login</SelectItem>
                  <SelectItem value="existing">Existing User</SelectItem>
                  <SelectItem value="new">Create New User</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formData.login_option === "new" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="new_user_email">Email</Label>
                  <Input
                    id="new_user_email"
                    type="email"
                    value={formData.new_user_email || ""}
                    onChange={(e) => updateFormData("new_user_email", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new_user_password">Password</Label>
                  <Input
                    id="new_user_password"
                    type="password"
                    value={formData.new_user_password || ""}
                    onChange={(e) => updateFormData("new_user_password", e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
        )

      case 12:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Student Status</Label>
              <Select 
                value={formData.status || "active"} 
                onValueChange={(v: any) => updateFormData("status", v)}
              >
                <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formData.status === "inactive" && (
              <p className="text-sm text-muted-foreground">
                Student information will be kept but the student will be marked as inactive.
              </p>
            )}
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <div className="relative">
        <div className="overflow-x-auto pb-2">
          <div className="flex items-center min-w-max">
            {STEPS.map((step, index) => {
              const StepIcon = step.icon
              const isActive = step.id === currentStep
              const isCompleted = step.id < currentStep

              return (
                <div key={step.id} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(step.id)}
                    className={`flex flex-col items-center min-w-[80px] ${
                      isActive ? "text-primary" : isCompleted ? "text-green-600" : "text-muted-foreground"
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                        isActive
                          ? "border-primary bg-primary text-primary-foreground"
                          : isCompleted
                          ? "border-green-600 bg-green-600 text-white"
                          : "border-muted-foreground/30"
                      }`}
                    >
                      {isCompleted ? <Check className="w-5 h-5" /> : <StepIcon className="w-5 h-5" />}
                    </div>
                    <span className="text-xs mt-1 text-center">{step.name}</span>
                  </button>
                  {index < STEPS.length - 1 && (
                    <div
                      className={`w-8 h-0.5 mx-1 ${
                        step.id < currentStep ? "bg-green-600" : "bg-muted-foreground/30"
                      }`}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Form Content */}
      <Card>
        <CardHeader>
          <CardTitle>{STEPS[currentStep - 1].name}</CardTitle>
          <CardDescription>
            Step {currentStep} of {STEPS.length}
          </CardDescription>
        </CardHeader>
        <CardContent>{renderStepContent()}</CardContent>
        <CardFooter className="flex justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 1}
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          {currentStep === STEPS.length ? (
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? "Submitting..." : "Submit Admission"}
            </Button>
          ) : (
            <Button onClick={handleNext}>
              Next
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}

