"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Building2,
  Phone,
  Mail,
  MapPin,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  User,
  Users,
  GraduationCap,
  ClipboardCheck,
  RotateCcw,
} from "lucide-react"

interface PublicApplicationFormProps {
  school: {
    code: string
    name: string
    address?: string
    phone?: string
    email?: string
    logoUrl?: string
  }
  classes: { id: string; name: string }[]
  admissionRules: string | null
  isKiosk: boolean
}

type Step = "rules" | "guardian" | "student" | "review"

const STEPS: { id: Step; label: string; icon: any }[] = [
  { id: "rules", label: "School Info", icon: Building2 },
  { id: "guardian", label: "Guardian", icon: Users },
  { id: "student", label: "Student", icon: GraduationCap },
  { id: "review", label: "Review", icon: ClipboardCheck },
]

export function PublicApplicationForm({
  school,
  classes,
  admissionRules,
  isKiosk,
}: PublicApplicationFormProps) {
  const [currentStep, setCurrentStep] = useState<Step>("rules")
  const [rulesAccepted, setRulesAccepted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [applicationNumber, setApplicationNumber] = useState("")
  const [error, setError] = useState("")

  const [guardian, setGuardian] = useState({
    name: "",
    phone: "",
    email: "",
    relationship: "",
    id_number: "",
    occupation: "",
    address: "",
  })

  const [student, setStudent] = useState({
    first_name: "",
    last_name: "",
    dob: "",
    gender: "",
    applied_class_id: "",
    previous_school: "",
    medical_notes: "",
  })

  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep)

  const canProceedFromRules = admissionRules ? rulesAccepted : true
  const canProceedFromGuardian = guardian.name.trim() && guardian.phone.trim()
  const canProceedFromStudent = student.first_name.trim() && student.last_name.trim()

  const goNext = () => {
    const idx = currentStepIndex
    if (idx < STEPS.length - 1) {
      setCurrentStep(STEPS[idx + 1].id)
    }
  }

  const goBack = () => {
    const idx = currentStepIndex
    if (idx > 0) {
      setCurrentStep(STEPS[idx - 1].id)
    }
  }

  const goToStep = (step: Step) => {
    setCurrentStep(step)
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setError("")

    try {
      const res = await fetch("/api/admissions/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school_code: school.code,
          first_name: student.first_name,
          last_name: student.last_name,
          date_of_birth: student.dob || null,
          gender: student.gender || null,
          previous_school: student.previous_school || null,
          medical_notes: student.medical_notes || null,
          applied_class_id: student.applied_class_id || null,
          guardian_name: guardian.name,
          guardian_phone: guardian.phone,
          guardian_email: guardian.email || null,
          guardian_relationship: guardian.relationship || null,
          guardian_id_number: guardian.id_number || null,
          guardian_occupation: guardian.occupation || null,
          guardian_address: guardian.address || null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Failed to submit application")
        return
      }

      setApplicationNumber(data.applicationNumber)
      setSubmitted(true)
    } catch {
      setError("Network error. Please check your connection and try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const resetForm = () => {
    setSubmitted(false)
    setApplicationNumber("")
    setError("")
    setRulesAccepted(false)
    setCurrentStep("rules")
    setGuardian({ name: "", phone: "", email: "", relationship: "", id_number: "", occupation: "", address: "" })
    setStudent({ first_name: "", last_name: "", dob: "", gender: "", applied_class_id: "", previous_school: "", medical_notes: "" })
  }

  if (submitted) {
    return (
      <div className="space-y-6">
        <Card className="border-0 shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-8 text-center text-white">
            <CheckCircle2 className="w-16 h-16 mx-auto mb-4" />
            <h2 className="text-2xl font-bold">Application Submitted!</h2>
            <p className="mt-2 text-emerald-100">Your application has been received successfully</p>
          </div>
          <CardContent className="p-8 text-center space-y-4">
            <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-6">
              <p className="text-sm text-muted-foreground mb-1">Application Number</p>
              <p className="text-2xl font-bold font-mono">{applicationNumber}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Please save this number for your records. The school will contact you regarding the next steps.
            </p>
            {school.phone && (
              <p className="text-sm">
                For inquiries, contact: <strong>{school.phone}</strong>
              </p>
            )}
            {isKiosk && (
              <Button onClick={resetForm} size="lg" className="mt-6 w-full h-14 text-lg">
                <RotateCcw className="mr-2 h-5 w-5" />
                New Application
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* School Header */}
      <div className="text-center">
        {school.logoUrl && (
          <div className="w-20 h-20 mx-auto mb-4 rounded-xl overflow-hidden bg-white shadow-lg">
            <img src={school.logoUrl} alt={school.name} className="w-full h-full object-contain" />
          </div>
        )}
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{school.name}</h1>
        <p className="text-lg text-muted-foreground mt-1">Student Admission Application</p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center justify-center gap-1 sm:gap-2">
        {STEPS.map((step, i) => {
          const Icon = step.icon
          const isActive = step.id === currentStep
          const isDone = i < currentStepIndex
          return (
            <div key={step.id} className="flex items-center">
              <button
                onClick={() => {
                  if (isDone) goToStep(step.id)
                }}
                disabled={!isDone}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                  isActive
                    ? "bg-blue-600 text-white shadow-md"
                    : isDone
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 cursor-pointer hover:bg-emerald-200"
                    : "bg-gray-100 text-gray-400 dark:bg-gray-800"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{step.label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <ChevronRight className="w-4 h-4 text-gray-300 mx-1" />
              )}
            </div>
          )
        })}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg p-4 text-sm">
          {error}
        </div>
      )}

      {/* Step 1: School Info & Rules */}
      {currentStep === "rules" && (
        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle className="text-xl">School Information</CardTitle>
            <CardDescription>Please review the school details and admission guidelines</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-6 space-y-3">
              <div className="flex items-start gap-3">
                <Building2 className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold">{school.name}</p>
                  {school.address && <p className="text-sm text-muted-foreground">{school.address}</p>}
                </div>
              </div>
              {school.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  <p className="text-sm">{school.phone}</p>
                </div>
              )}
              {school.email && (
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  <p className="text-sm">{school.email}</p>
                </div>
              )}
            </div>

            {admissionRules && (
              <div>
                <h3 className="font-semibold text-lg mb-3">Rules & Regulations</h3>
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6 max-h-96 overflow-y-auto">
                  <div className="text-sm leading-relaxed whitespace-pre-wrap">{admissionRules}</div>
                </div>
                <div className="flex items-start gap-3 mt-4 p-4 rounded-lg border">
                  <Checkbox
                    id="accept-rules"
                    checked={rulesAccepted}
                    onCheckedChange={(checked) => setRulesAccepted(checked === true)}
                  />
                  <label htmlFor="accept-rules" className="text-sm cursor-pointer leading-relaxed">
                    I have read and agree to the school&apos;s rules and regulations
                  </label>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                onClick={goNext}
                disabled={!canProceedFromRules}
                size="lg"
              >
                Continue
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Guardian Details */}
      {currentStep === "guardian" && (
        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Users className="w-5 h-5" />
              Guardian / Parent Details
            </CardTitle>
            <CardDescription>Enter the details of the parent or guardian</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="g-name">Full Name *</Label>
                <Input
                  id="g-name"
                  placeholder="e.g. John Kamau"
                  value={guardian.name}
                  onChange={(e) => setGuardian({ ...guardian, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="g-phone">Phone Number *</Label>
                <Input
                  id="g-phone"
                  type="tel"
                  placeholder="e.g. 0712345678"
                  value={guardian.phone}
                  onChange={(e) => setGuardian({ ...guardian, phone: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="g-email">Email</Label>
                <Input
                  id="g-email"
                  type="email"
                  placeholder="e.g. john@example.com"
                  value={guardian.email}
                  onChange={(e) => setGuardian({ ...guardian, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="g-relationship">Relationship</Label>
                <Select
                  value={guardian.relationship}
                  onValueChange={(val) => setGuardian({ ...guardian, relationship: val })}
                >
                  <SelectTrigger id="g-relationship">
                    <SelectValue placeholder="Select relationship" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="father">Father</SelectItem>
                    <SelectItem value="mother">Mother</SelectItem>
                    <SelectItem value="guardian">Guardian</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="g-id">ID / Passport Number</Label>
                <Input
                  id="g-id"
                  placeholder="e.g. 12345678"
                  value={guardian.id_number}
                  onChange={(e) => setGuardian({ ...guardian, id_number: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="g-occupation">Occupation</Label>
                <Input
                  id="g-occupation"
                  placeholder="e.g. Teacher"
                  value={guardian.occupation}
                  onChange={(e) => setGuardian({ ...guardian, occupation: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="g-address">Address</Label>
              <Input
                id="g-address"
                placeholder="e.g. P.O. Box 123, Nairobi"
                value={guardian.address}
                onChange={(e) => setGuardian({ ...guardian, address: e.target.value })}
              />
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={goBack}>
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button onClick={goNext} disabled={!canProceedFromGuardian} size="lg">
                Continue
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Student Details */}
      {currentStep === "student" && (
        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <GraduationCap className="w-5 h-5" />
              Student Details
            </CardTitle>
            <CardDescription>Enter the student&apos;s information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="s-fname">First Name *</Label>
                <Input
                  id="s-fname"
                  placeholder="e.g. Mary"
                  value={student.first_name}
                  onChange={(e) => setStudent({ ...student, first_name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-lname">Last Name *</Label>
                <Input
                  id="s-lname"
                  placeholder="e.g. Kamau"
                  value={student.last_name}
                  onChange={(e) => setStudent({ ...student, last_name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-dob">Date of Birth</Label>
                <Input
                  id="s-dob"
                  type="date"
                  value={student.dob}
                  onChange={(e) => setStudent({ ...student, dob: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-gender">Gender</Label>
                <Select
                  value={student.gender}
                  onValueChange={(val) => setStudent({ ...student, gender: val })}
                >
                  <SelectTrigger id="s-gender">
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-class">Applying for Class</Label>
                <Select
                  value={student.applied_class_id}
                  onValueChange={(val) => setStudent({ ...student, applied_class_id: val })}
                >
                  <SelectTrigger id="s-class">
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
              <div className="space-y-2">
                <Label htmlFor="s-prev">Previous School</Label>
                <Input
                  id="s-prev"
                  placeholder="e.g. ABC Primary School"
                  value={student.previous_school}
                  onChange={(e) => setStudent({ ...student, previous_school: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-medical">Medical Conditions / Notes</Label>
              <textarea
                id="s-medical"
                className="w-full min-h-[80px] rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="Any medical conditions, allergies, or special needs..."
                value={student.medical_notes}
                onChange={(e) => setStudent({ ...student, medical_notes: e.target.value })}
              />
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={goBack}>
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button onClick={goNext} disabled={!canProceedFromStudent} size="lg">
                Review Application
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Review & Submit */}
      {currentStep === "review" && (
        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5" />
              Review Application
            </CardTitle>
            <CardDescription>Please verify all details before submitting</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Guardian Summary */}
            <div className="rounded-xl border p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Guardian Details
                </h3>
                <Button variant="ghost" size="sm" onClick={() => goToStep("guardian")}>
                  Edit
                </Button>
              </div>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div><span className="text-muted-foreground">Name:</span> {guardian.name}</div>
                <div><span className="text-muted-foreground">Phone:</span> {guardian.phone}</div>
                {guardian.email && <div><span className="text-muted-foreground">Email:</span> {guardian.email}</div>}
                {guardian.relationship && <div><span className="text-muted-foreground">Relationship:</span> {guardian.relationship}</div>}
                {guardian.id_number && <div><span className="text-muted-foreground">ID Number:</span> {guardian.id_number}</div>}
                {guardian.occupation && <div><span className="text-muted-foreground">Occupation:</span> {guardian.occupation}</div>}
                {guardian.address && <div className="sm:col-span-2"><span className="text-muted-foreground">Address:</span> {guardian.address}</div>}
              </div>
            </div>

            {/* Student Summary */}
            <div className="rounded-xl border p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <GraduationCap className="w-4 h-4" />
                  Student Details
                </h3>
                <Button variant="ghost" size="sm" onClick={() => goToStep("student")}>
                  Edit
                </Button>
              </div>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div><span className="text-muted-foreground">First Name:</span> {student.first_name}</div>
                <div><span className="text-muted-foreground">Last Name:</span> {student.last_name}</div>
                {student.dob && <div><span className="text-muted-foreground">Date of Birth:</span> {new Date(student.dob).toLocaleDateString()}</div>}
                {student.gender && <div><span className="text-muted-foreground">Gender:</span> {student.gender}</div>}
                {student.applied_class_id && (
                  <div><span className="text-muted-foreground">Applied Class:</span> {classes.find((c) => c.id === student.applied_class_id)?.name || "—"}</div>
                )}
                {student.previous_school && <div><span className="text-muted-foreground">Previous School:</span> {student.previous_school}</div>}
                {student.medical_notes && <div className="sm:col-span-2"><span className="text-muted-foreground">Medical Notes:</span> {student.medical_notes}</div>}
              </div>
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={goBack}>
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                size="lg"
                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg"
              >
                {submitting ? "Submitting..." : "Submit Application"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
