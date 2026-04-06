"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { transferStudent } from "@/lib/actions/students-transfer"
import { ArrowRightLeft } from "lucide-react"

interface TransferStudentFormProps {
  classes: any[]
  students: any[]
  schoolId: string
}

export function TransferStudentForm({
  classes,
  students,
  schoolId,
}: TransferStudentFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const [formData, setFormData] = useState({
    studentId: "",
    transferType: "transfer_out" as "transfer_in" | "transfer_out",
    fromClassId: "",
    toClassId: "",
    transferDate: new Date().toISOString().split("T")[0],
    reason: "",
  })

  const selectedStudent = students.find((s) => s.id === formData.studentId)
  const currentClass = selectedStudent?.enrollments?.[0]?.classes?.name

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.studentId || !formData.toClassId) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      })
      return
    }

    setLoading(true)

    try {
      const result = await transferStudent({
        studentId: formData.studentId,
        transferType: formData.transferType,
        fromSchoolId: formData.transferType === "transfer_out" ? schoolId : undefined,
        toSchoolId: formData.transferType === "transfer_in" ? schoolId : undefined,
        fromClassId: formData.fromClassId || undefined,
        toClassId: formData.toClassId,
        transferDate: formData.transferDate,
        reason: formData.reason || undefined,
      })

      if (result.error) {
        throw new Error(result.error)
      }

      toast({
        title: "Success!",
        description: "Transfer recorded successfully.",
      })

      router.push("/dashboard/admin/students/transfers")
      router.refresh()
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to record transfer",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5" />
            Transfer Details
          </CardTitle>
          <CardDescription>
            Record a student transfer
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Transfer Type</Label>
            <Select
              value={formData.transferType}
              onValueChange={(v: "transfer_in" | "transfer_out") =>
                setFormData({ ...formData, transferType: v })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select transfer type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="transfer_out">Transfer Out (leaving this school)</SelectItem>
                <SelectItem value="transfer_in">Transfer In (joining this school)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Student *</Label>
            <Select
              value={formData.studentId}
              onValueChange={(v) => setFormData({ ...formData, studentId: v })}
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
            {selectedStudent && currentClass && (
              <p className="text-sm text-muted-foreground">
                Current class: {currentClass}
              </p>
            )}
          </div>

          {formData.transferType === "transfer_out" && (
            <div className="space-y-2">
              <Label>From Class</Label>
              <Select
                value={formData.fromClassId}
                onValueChange={(v) => setFormData({ ...formData, fromClassId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select current class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>To Class *</Label>
            <Select
              value={formData.toClassId}
              onValueChange={(v) => setFormData({ ...formData, toClassId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select destination class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Transfer Date *</Label>
            <Input
              type="date"
              value={formData.transferDate}
              onChange={(e) =>
                setFormData({ ...formData, transferDate: e.target.value })
              }
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Reason</Label>
            <Input
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              placeholder="Optional reason for transfer"
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Recording..." : "Record Transfer"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}



