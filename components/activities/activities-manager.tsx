"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createActivity, updateActivity, deleteActivity } from "@/lib/actions/activities"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Plus, Pencil, Trash2, Trophy, DollarSign } from "lucide-react"

type Activity = {
  id: string
  name: string
  fee_amount: number
  description: string | null
  is_active: boolean
  created_at: string
}

export function ActivitiesManager({ activities }: { activities: Activity[] }) {
  const router = useRouter()
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [editActivity, setEditActivity] = useState<Activity | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function handleCreate(formData: FormData) {
    setIsLoading(true)
    const result = await createActivity(formData)
    setIsLoading(false)

    if ((result as any).error) {
      alert((result as any).error)
      return
    }

    setIsAddOpen(false)
    router.refresh()
  }

  async function handleUpdate(formData: FormData) {
    if (!editActivity) return
    setIsLoading(true)
    const result = await updateActivity(editActivity.id, formData)
    setIsLoading(false)

    if ((result as any).error) {
      alert((result as any).error)
      return
    }

    setEditActivity(null)
    router.refresh()
  }

  async function handleDelete(activityId: string, activityName: string) {
    if (!confirm(`Are you sure you want to delete "${activityName}"? This will also remove all student enrollments.`)) {
      return
    }

    const result = await deleteActivity(activityId)
    if ((result as any).error) {
      alert((result as any).error)
      return
    }

    router.refresh()
  }

  return (
    <div className="bg-white rounded-xl border shadow-sm">
      <div className="p-6 border-b flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Activities</h2>
          <p className="text-sm text-muted-foreground">Manage clubs and extracurricular programs</p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Activity
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Activity</DialogTitle>
              <DialogDescription>
                Create a new activity or extracurricular program
              </DialogDescription>
            </DialogHeader>
            <form action={handleCreate}>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Activity Name</Label>
                  <Input id="name" name="name" placeholder="e.g., Swimming Club" required />
                </div>
                <div>
                  <Label htmlFor="fee_amount">Fee Amount (KES)</Label>
                  <Input
                    id="fee_amount"
                    name="fee_amount"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    name="description"
                    placeholder="Brief description of the activity..."
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "Creating..." : "Create Activity"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {activities.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground">
          <Trophy className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">No activities yet</p>
          <p className="text-sm">Create your first activity to get started</p>
        </div>
      ) : (
        <div className="divide-y">
          {activities.map((activity) => (
            <div key={activity.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <Trophy className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{activity.name}</span>
                    <Badge variant={activity.is_active ? "default" : "secondary"}>
                      {activity.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  {activity.description && (
                    <p className="text-sm text-muted-foreground">{activity.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1 text-sm font-medium">
                  <DollarSign className="w-4 h-4 text-green-600" />
                  KES {activity.fee_amount.toLocaleString()}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setEditActivity(activity)}
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-red-500 hover:text-red-700"
                  onClick={() => handleDelete(activity.id, activity.name)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editActivity} onOpenChange={(open) => !open && setEditActivity(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Activity</DialogTitle>
            <DialogDescription>
              Update activity details
            </DialogDescription>
          </DialogHeader>
          {editActivity && (
            <form action={handleUpdate}>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="edit-name">Activity Name</Label>
                  <Input
                    id="edit-name"
                    name="name"
                    defaultValue={editActivity.name}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="edit-fee">Fee Amount (KES)</Label>
                  <Input
                    id="edit-fee"
                    name="fee_amount"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={editActivity.fee_amount}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-description">Description</Label>
                  <Textarea
                    id="edit-description"
                    name="description"
                    defaultValue={editActivity.description || ""}
                    rows={3}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="edit-is-active"
                    name="is_active"
                    defaultChecked={editActivity.is_active}
                    value="true"
                    className="rounded"
                  />
                  <Label htmlFor="edit-is-active">Active</Label>
                </div>
                <input
                  type="hidden"
                  name="is_active"
                  value={editActivity.is_active ? "true" : "false"}
                />
              </div>
              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={() => setEditActivity(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
