"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Plus, Pencil, Trash2, Calendar, MapPin } from "lucide-react"
import { createEvent, updateEvent, deleteEvent } from "@/lib/actions/events"
import { useRouter } from "next/navigation"

interface EventData {
  id: string
  title: string
  description: string | null
  event_type: string
  start_date: string
  end_date: string | null
  start_time: string | null
  end_time: string | null
  is_all_day: boolean
  location: string | null
  venue: string | null
  organizer: string | null
  color: string
  is_published: boolean
}

interface EventsManagerProps {
  initialEvents: EventData[]
}

export function EventsManager({ initialEvents }: EventsManagerProps) {
  const router = useRouter()
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<EventData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    event_type: "general",
    start_date: "",
    end_date: "",
    start_time: "",
    end_time: "",
    is_all_day: false,
    location: "",
    venue: "",
    organizer: "",
    color: "#3b82f6",
    is_published: true,
  })
  
  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      event_type: "general",
      start_date: "",
      end_date: "",
      start_time: "",
      end_time: "",
      is_all_day: false,
      location: "",
      venue: "",
      organizer: "",
      color: "#3b82f6",
      is_published: true,
    })
  }
  
  const handleAdd = async () => {
    if (!formData.title.trim() || !formData.start_date) return
    
    setIsLoading(true)
    const fd = new FormData()
    Object.entries(formData).forEach(([key, value]) => {
      if (value !== "" && value !== null) {
        fd.append(key, value.toString())
      }
    })
    
    const result = await createEvent(fd)
    setIsLoading(false)
    
    if (result.error) {
      alert(result.error)
      return
    }
    
    setIsAddDialogOpen(false)
    resetForm()
    router.refresh()
  }
  
  const handleUpdate = async () => {
    if (!editingEvent || !formData.title.trim() || !formData.start_date) return
    
    setIsLoading(true)
    const fd = new FormData()
    Object.entries(formData).forEach(([key, value]) => {
      if (value !== "" && value !== null) {
        fd.append(key, value.toString())
      }
    })
    
    const result = await updateEvent(editingEvent.id, fd)
    setIsLoading(false)
    
    if (result.error) {
      alert(result.error)
      return
    }
    
    setEditingEvent(null)
    resetForm()
    router.refresh()
  }
  
  const handleDelete = async (eventId: string) => {
    if (!confirm("Are you sure you want to delete this event?")) return
    
    const result = await deleteEvent(eventId)
    if (result.error) {
      alert(result.error)
      return
    }
    router.refresh()
  }
  
  const openEditDialog = (event: EventData) => {
    setEditingEvent(event)
    setFormData({
      title: event.title,
      description: event.description || "",
      event_type: event.event_type,
      start_date: event.start_date,
      end_date: event.end_date || "",
      start_time: event.start_time || "",
      end_time: event.end_time || "",
      is_all_day: event.is_all_day,
      location: event.location || "",
      venue: event.venue || "",
      organizer: event.organizer || "",
      color: event.color,
      is_published: event.is_published,
    })
  }
  
  const getEventTypeColor = (type: string) => {
    switch (type) {
      case "holiday": return "bg-red-100 text-red-800"
      case "exam": return "bg-yellow-100 text-yellow-800"
      case "sports": return "bg-green-100 text-green-800"
      case "cultural": return "bg-purple-100 text-purple-800"
      case "meeting": return "bg-blue-100 text-blue-800"
      default: return "bg-gray-100 text-gray-800"
    }
  }
  
  const EventForm = () => (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label>Event Title *</Label>
        <Input
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          placeholder="Event title"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Event Type</Label>
          <Select value={formData.event_type} onValueChange={(v) => setFormData({ ...formData, event_type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="general">General</SelectItem>
              <SelectItem value="holiday">Holiday</SelectItem>
              <SelectItem value="exam">Exam</SelectItem>
              <SelectItem value="meeting">Meeting</SelectItem>
              <SelectItem value="sports">Sports</SelectItem>
              <SelectItem value="cultural">Cultural</SelectItem>
              <SelectItem value="academic">Academic</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Color</Label>
          <Input
            type="color"
            value={formData.color}
            onChange={(e) => setFormData({ ...formData, color: e.target.value })}
            className="h-10 p-1"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Start Date *</Label>
          <Input
            type="date"
            value={formData.start_date}
            onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>End Date</Label>
          <Input
            type="date"
            value={formData.end_date}
            onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
          />
        </div>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <input
          type="checkbox"
          id="is_all_day"
          checked={formData.is_all_day}
          onChange={(e) => setFormData({ ...formData, is_all_day: e.target.checked })}
          className="rounded"
        />
        <Label htmlFor="is_all_day">All day event</Label>
      </div>
      {!formData.is_all_day && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Start Time</Label>
            <Input
              type="time"
              value={formData.start_time}
              onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>End Time</Label>
            <Input
              type="time"
              value={formData.end_time}
              onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
            />
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Location</Label>
          <Input
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            placeholder="Event location"
          />
        </div>
        <div className="space-y-2">
          <Label>Venue</Label>
          <Input
            value={formData.venue}
            onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
            placeholder="Specific venue"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Event description"
          rows={3}
        />
      </div>
      <div className="space-y-2">
        <Label>Organizer</Label>
        <Input
          value={formData.organizer}
          onChange={(e) => setFormData({ ...formData, organizer: e.target.value })}
          placeholder="Event organizer"
        />
      </div>
    </div>
  )
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Events</CardTitle>
            <CardDescription>{initialEvents.length} events</CardDescription>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="mr-2 h-4 w-4" />
                Add Event
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Event</DialogTitle>
                <DialogDescription>Add a new event to the school calendar</DialogDescription>
              </DialogHeader>
              <EventForm />
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleAdd} disabled={isLoading || !formData.title.trim() || !formData.start_date}>
                  {isLoading ? "Creating..." : "Create Event"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {initialEvents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>No events yet. Create your first event.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {initialEvents.map((event) => (
                <Card key={event.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div 
                          className="w-2 h-full min-h-[60px] rounded-full"
                          style={{ backgroundColor: event.color }}
                        />
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold">{event.title}</h3>
                            <span className={`text-xs px-2 py-0.5 rounded ${getEventTypeColor(event.event_type)}`}>
                              {event.event_type}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(event.start_date).toLocaleDateString()}
                              {event.end_date && event.end_date !== event.start_date && (
                                <> - {new Date(event.end_date).toLocaleDateString()}</>
                              )}
                            </span>
                            {event.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {event.location}
                              </span>
                            )}
                          </div>
                          {event.description && (
                            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                              {event.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={event.is_published ? "default" : "outline"}>
                          {event.is_published ? "Published" : "Draft"}
                        </Badge>
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(event)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(event.id)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Edit Dialog */}
      <Dialog open={!!editingEvent} onOpenChange={(open: boolean) => !open && setEditingEvent(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Event</DialogTitle>
            <DialogDescription>Update event details</DialogDescription>
          </DialogHeader>
          <EventForm />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEvent(null)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={isLoading || !formData.title.trim() || !formData.start_date}>
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}


