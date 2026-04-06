"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Plus, Edit, Trash2, Clock } from "lucide-react"
import { createTimetableSlot, updateTimetableSlot, deleteTimetableSlot } from "@/lib/actions/timetable"
import { useRouter } from "next/navigation"

interface Period {
  id: string
  name: string
  start_time: string
  end_time: string
  order_index: number
}

interface Teacher {
  id: string
  first_name: string
  last_name: string
  email: string
  position: string
}

interface Room {
  id: string
  name: string
}

interface Subject {
  id: string
  name: string
  code: string
}

interface TimetableEntry {
  id: string
  class_id: string
  section_id?: string
  period_id: string
  day_of_week: number
  subject: string
  teacher_id?: string
  room_id?: string
  periods: Period
  employees?: Teacher
  rooms?: Room
}

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
const DAY_NUMBER_MAP: { [key: string]: number } = {
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
}

const COLORS = [
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-purple-500 to-pink-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-cyan-500 to-blue-600",
  "from-violet-500 to-purple-600",
  "from-green-500 to-emerald-600",
]

interface TimetableManagerProps {
  classId: string
  className: string
  sectionId?: string
  sectionName?: string
  timetableId: string
  initialEntries: TimetableEntry[]
  periods: Period[]
  teachers: Teacher[]
  rooms: Room[]
  subjects: Subject[]
}

export function TimetableManager({
  classId,
  className,
  sectionId,
  sectionName,
  timetableId,
  initialEntries,
  periods,
  teachers,
  rooms,
  subjects,
}: TimetableManagerProps) {
  const router = useRouter()
  const [entries, setEntries] = useState<TimetableEntry[]>(initialEntries)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingSlot, setEditingSlot] = useState<TimetableEntry | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const [formData, setFormData] = useState({
    period_id: "",
    day_of_week: "",
    subject: "",
    teacher_id: "unassigned",
    room_id: "no-room",
  })

  const resetForm = () => {
    setFormData({
      period_id: "",
      day_of_week: "",
      subject: "",
      teacher_id: "",
      room_id: "",
    })
    setEditingSlot(null)
  }

  const handleOpenDialog = (slot?: TimetableEntry) => {
    if (slot) {
      setEditingSlot(slot)
      setFormData({
        period_id: slot.period_id,
        day_of_week: slot.day_of_week.toString(),
        subject: slot.subject,
        teacher_id: slot.teacher_id || "unassigned",
        room_id: slot.room_id || "no-room",
      })
    } else {
      resetForm()
    }
    setIsDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formData.period_id || !formData.day_of_week || !formData.subject) {
      return
    }

    setIsLoading(true)
    try {
      const fd = new FormData()
      fd.append("timetable_id", timetableId)
      fd.append("class_id", classId)
      if (sectionId) fd.append("section_id", sectionId)
      fd.append("period_id", formData.period_id)
      fd.append("day_of_week", formData.day_of_week)
      fd.append("subject", formData.subject)
      if (formData.teacher_id && formData.teacher_id !== "unassigned") fd.append("teacher_id", formData.teacher_id)
      if (formData.room_id && formData.room_id !== "no-room") fd.append("room_id", formData.room_id)

      let result
      if (editingSlot) {
        result = await updateTimetableSlot(editingSlot.id, fd)
      } else {
        result = await createTimetableSlot(fd)
      }

      if (result.error) {
        console.error(result.error)
      } else {
        setIsDialogOpen(false)
        resetForm()
        router.refresh()
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (slotId: string) => {
    if (!confirm("Are you sure you want to delete this timetable slot?")) {
      return
    }

    setIsLoading(true)
    try {
      const result = await deleteTimetableSlot(slotId)
      if (result.error) {
        console.error(result.error)
      } else {
        router.refresh()
      }
    } finally {
      setIsLoading(false)
    }
  }

  const getSlotForDayAndPeriod = (dayNum: number, periodId: string) => {
    return entries.find(
      (e) => e.day_of_week === dayNum && e.period_id === periodId
    )
  }

  const getColorForSubject = (subject: string, index: number) => {
    return COLORS[index % COLORS.length]
  }

  const getTeacherName = (slot: TimetableEntry) => {
    if (!slot.employees) return "Unassigned"
    return `${slot.employees.first_name} ${slot.employees.last_name}`
  }

  const getRoomName = (slot: TimetableEntry) => {
    return slot.rooms?.name || "No Room"
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">
            {className}
            {sectionName && ` - ${sectionName}`}
          </h2>
          <p className="text-muted-foreground">
            Manage the timetable for this class
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button
              className="bg-neutral-900 text-white hover:bg-neutral-800"
              onClick={() => handleOpenDialog()}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Lesson
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingSlot ? "Edit Lesson" : "Add Lesson"}
              </DialogTitle>
              <DialogDescription>
                {editingSlot ? "Update the lesson details" : "Create a new lesson slot"}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Day of Week *</Label>
                <Select
                  value={formData.day_of_week}
                  onValueChange={(value) =>
                    setFormData({ ...formData, day_of_week: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select day" />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS_OF_WEEK.map((day) => (
                      <SelectItem
                        key={day}
                        value={DAY_NUMBER_MAP[day].toString()}
                      >
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Period *</Label>
                <Select
                  value={formData.period_id}
                  onValueChange={(value) =>
                    setFormData({ ...formData, period_id: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select period" />
                  </SelectTrigger>
                  <SelectContent>
                    {periods.map((period) => (
                      <SelectItem key={period.id} value={period.id}>
                        {period.name} ({period.start_time} - {period.end_time})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Subject *</Label>
                <Select
                  value={formData.subject}
                  onValueChange={(value) =>
                    setFormData({ ...formData, subject: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects.map((subject) => (
                      <SelectItem key={subject.id} value={subject.name}>
                        {subject.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Teacher</Label>
                <Select
                  value={formData.teacher_id}
                  onValueChange={(value) =>
                    setFormData({ ...formData, teacher_id: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select teacher" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {teachers.map((teacher) => (
                      <SelectItem key={teacher.id} value={teacher.id}>
                        {teacher.first_name} {teacher.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Room</Label>
                <Select
                  value={formData.room_id}
                  onValueChange={(value) =>
                    setFormData({ ...formData, room_id: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select room" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no-room">No Room</SelectItem>
                    {rooms.map((room) => (
                      <SelectItem key={room.id} value={room.id}>
                        {room.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={isLoading}
                className="bg-neutral-900 hover:bg-neutral-800"
              >
                {isLoading ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Timetable Grid */}
      <Card className="border border-neutral-200 shadow-sm overflow-hidden">
        <CardHeader className="bg-neutral-50">
          <CardTitle className="text-xl text-neutral-900">Weekly Schedule</CardTitle>
          <CardDescription className="text-neutral-500">Click on a cell to add or edit lessons</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-neutral-50">
                  <th className="sticky left-0 bg-neutral-50 px-4 py-3 text-left text-sm font-semibold border-b border-r border-neutral-200 min-w-[140px]">
                    Period
                  </th>
                  {DAYS_OF_WEEK.map((day) => (
                    <th
                      key={day}
                      className="px-4 py-3 text-center text-sm font-semibold border-b border-neutral-200 min-w-[180px]"
                    >
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map((period, periodIdx) => (
                  <tr key={period.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="sticky left-0 bg-white px-4 py-4 font-medium text-sm border-b border-r border-neutral-200">
                      <div className="flex flex-col gap-1">
                        <span className="font-semibold">{period.name}</span>
                        <span className="text-xs text-neutral-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {period.start_time} - {period.end_time}
                        </span>
                      </div>
                    </td>
                    {DAYS_OF_WEEK.map((day) => {
                      const dayNum = DAY_NUMBER_MAP[day]
                      const slot = getSlotForDayAndPeriod(dayNum, period.id)
                      const color = slot
                        ? getColorForSubject(slot.subject, periodIdx)
                        : "bg-gray-100 dark:bg-gray-800"

                      return (
                        <td
                          key={`${day}-${period.id}`}
                          className="px-3 py-3 border-b border-neutral-200"
                        >
                          {slot ? (
                            <div
                              className={`p-3 rounded-lg text-white shadow-sm hover:shadow-md transition-all duration-200 group relative bg-gradient-to-br ${color}`}
                            >
                              <div className="font-semibold text-sm mb-1">
                                {slot.subject}
                              </div>
                              <div className="text-xs opacity-90 mb-1">
                                {getTeacherName(slot)}
                              </div>
                              <div className="text-xs opacity-75 mb-2">
                                {getRoomName(slot)}
                              </div>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => handleOpenDialog(slot)}
                                  className="p-1 bg-white/20 hover:bg-white/30 rounded transition-colors"
                                  title="Edit"
                                >
                                  <Edit className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => handleDelete(slot.id)}
                                  className="p-1 bg-white/20 hover:bg-white/30 rounded transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleOpenDialog()}
                              className="w-full h-20 border-2 border-dashed border-neutral-300 rounded-lg hover:border-neutral-400 hover:bg-neutral-50 transition-colors flex items-center justify-center text-xs text-neutral-500 hover:text-neutral-600"
                            >
                              + Add Lesson
                            </button>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <Card className="border border-neutral-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-neutral-900">Subject Legend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {subjects.slice(0, 8).map((subject, idx) => (
              <div key={subject.id} className="flex items-center gap-2">
                <div
                  className={`w-4 h-4 rounded bg-gradient-to-br ${getColorForSubject(subject.name, idx)}`}
                />
                <span className="text-sm">{subject.name}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
