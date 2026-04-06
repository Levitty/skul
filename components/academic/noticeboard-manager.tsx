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
import { Plus, Pencil, Trash2, Megaphone, Pin } from "lucide-react"
import { createAnnouncement, updateAnnouncement, deleteAnnouncement } from "@/lib/actions/announcements"
import { useRouter } from "next/navigation"

interface AnnouncementData {
  id: string
  title: string
  content: string
  summary: string | null
  target_audience: string
  priority: string
  publish_date: string
  expiry_date: string | null
  is_pinned: boolean
  is_published: boolean
}

interface NoticeboardManagerProps {
  initialAnnouncements: AnnouncementData[]
}

export function NoticeboardManager({ initialAnnouncements }: NoticeboardManagerProps) {
  const router = useRouter()
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [editingAnnouncement, setEditingAnnouncement] = useState<AnnouncementData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    summary: "",
    target_audience: "all",
    priority: "normal",
    publish_date: new Date().toISOString().split("T")[0],
    expiry_date: "",
    is_pinned: false,
    is_published: true,
  })
  
  const resetForm = () => {
    setFormData({
      title: "",
      content: "",
      summary: "",
      target_audience: "all",
      priority: "normal",
      publish_date: new Date().toISOString().split("T")[0],
      expiry_date: "",
      is_pinned: false,
      is_published: true,
    })
  }
  
  const handleAdd = async () => {
    if (!formData.title.trim() || !formData.content.trim()) return
    
    setIsLoading(true)
    const fd = new FormData()
    Object.entries(formData).forEach(([key, value]) => {
      if (value !== "" && value !== null) {
        fd.append(key, value.toString())
      }
    })
    
    const result = await createAnnouncement(fd)
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
    if (!editingAnnouncement || !formData.title.trim() || !formData.content.trim()) return
    
    setIsLoading(true)
    const fd = new FormData()
    Object.entries(formData).forEach(([key, value]) => {
      if (value !== "" && value !== null) {
        fd.append(key, value.toString())
      }
    })
    
    const result = await updateAnnouncement(editingAnnouncement.id, fd)
    setIsLoading(false)
    
    if (result.error) {
      alert(result.error)
      return
    }
    
    setEditingAnnouncement(null)
    resetForm()
    router.refresh()
  }
  
  const handleDelete = async (announcementId: string) => {
    if (!confirm("Are you sure you want to delete this announcement?")) return
    
    const result = await deleteAnnouncement(announcementId)
    if (result.error) {
      alert(result.error)
      return
    }
    router.refresh()
  }
  
  const openEditDialog = (announcement: AnnouncementData) => {
    setEditingAnnouncement(announcement)
    setFormData({
      title: announcement.title,
      content: announcement.content,
      summary: announcement.summary || "",
      target_audience: announcement.target_audience,
      priority: announcement.priority,
      publish_date: announcement.publish_date.split("T")[0],
      expiry_date: announcement.expiry_date?.split("T")[0] || "",
      is_pinned: announcement.is_pinned,
      is_published: announcement.is_published,
    })
  }
  
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent": return "destructive"
      case "high": return "default"
      case "normal": return "secondary"
      default: return "outline"
    }
  }
  
  const AnnouncementForm = () => (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label>Title *</Label>
        <Input
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          placeholder="Announcement title"
        />
      </div>
      <div className="space-y-2">
        <Label>Content *</Label>
        <Textarea
          value={formData.content}
          onChange={(e) => setFormData({ ...formData, content: e.target.value })}
          placeholder="Full announcement content"
          rows={5}
        />
      </div>
      <div className="space-y-2">
        <Label>Summary (optional)</Label>
        <Input
          value={formData.summary}
          onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
          placeholder="Brief summary for preview"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Target Audience</Label>
          <Select value={formData.target_audience} onValueChange={(v) => setFormData({ ...formData, target_audience: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              <SelectItem value="students">Students Only</SelectItem>
              <SelectItem value="teachers">Teachers Only</SelectItem>
              <SelectItem value="parents">Parents Only</SelectItem>
              <SelectItem value="staff">Staff Only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Priority</Label>
          <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Publish Date</Label>
          <Input
            type="date"
            value={formData.publish_date}
            onChange={(e) => setFormData({ ...formData, publish_date: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Expiry Date (optional)</Label>
          <Input
            type="date"
            value={formData.expiry_date}
            onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
          />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.is_pinned}
            onChange={(e) => setFormData({ ...formData, is_pinned: e.target.checked })}
            className="rounded"
          />
          <span className="text-sm">Pin to top</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.is_published}
            onChange={(e) => setFormData({ ...formData, is_published: e.target.checked })}
            className="rounded"
          />
          <span className="text-sm">Publish immediately</span>
        </label>
      </div>
    </div>
  )
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Announcements</CardTitle>
            <CardDescription>{initialAnnouncements.length} announcements</CardDescription>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="mr-2 h-4 w-4" />
                New Announcement
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Announcement</DialogTitle>
                <DialogDescription>Post a new announcement to the noticeboard</DialogDescription>
              </DialogHeader>
              <AnnouncementForm />
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleAdd} disabled={isLoading || !formData.title.trim() || !formData.content.trim()}>
                  {isLoading ? "Creating..." : "Create Announcement"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {initialAnnouncements.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Megaphone className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>No announcements yet. Create your first announcement.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {initialAnnouncements.map((announcement) => (
                <Card key={announcement.id} className={announcement.is_pinned ? "border-primary" : ""}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {announcement.is_pinned && <Pin className="h-4 w-4 text-primary" />}
                        <CardTitle className="text-lg">{announcement.title}</CardTitle>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={getPriorityColor(announcement.priority) as any}>
                          {announcement.priority}
                        </Badge>
                        <Badge variant={announcement.is_published ? "default" : "outline"}>
                          {announcement.is_published ? "Published" : "Draft"}
                        </Badge>
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(announcement)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(announcement.id)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                    <CardDescription>
                      {new Date(announcement.publish_date).toLocaleDateString()} · {announcement.target_audience}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {announcement.summary || announcement.content}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Edit Dialog */}
      <Dialog open={!!editingAnnouncement} onOpenChange={(open: boolean) => !open && setEditingAnnouncement(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Announcement</DialogTitle>
            <DialogDescription>Update announcement details</DialogDescription>
          </DialogHeader>
          <AnnouncementForm />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingAnnouncement(null)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={isLoading || !formData.title.trim() || !formData.content.trim()}>
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}


