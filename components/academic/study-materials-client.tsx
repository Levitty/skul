"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import {
  Plus, FileText, Download, Eye, Trash2, Pencil, Link as LinkIcon,
} from "lucide-react"
import {
  createStudyMaterial, deleteStudyMaterial, updateStudyMaterial,
  incrementStudyMaterialDownload, incrementStudyMaterialView,
} from "@/lib/actions/study-materials"

interface Subject {
  id: string
  name: string
}

interface Class {
  id: string
  name: string
}

interface Term {
  id: string
  name: string
}

interface AcademicYear {
  id: string
  name: string
  terms: Term[]
}

interface StudyMaterial {
  id: string
  title: string
  description: string | null
  material_type: string
  file_url: string | null
  file_name: string | null
  file_size: number | null
  external_link: string | null
  class_id: string | null
  subject_id: string | null
  is_downloadable: boolean
  is_visible: boolean
  view_count: number
  download_count: number
  created_at: string
  class: { id: string; name: string } | null
  subject: { id: string; name: string } | null
  uploaded_by: { id: string; first_name: string; last_name: string } | null
}

interface StudyMaterialsClientProps {
  initialMaterials: StudyMaterial[]
  subjects: Subject[]
  classes: Class[]
  currentAcademicYear: AcademicYear | null
}

const MATERIAL_TYPES = [
  { value: "document", label: "Document", icon: FileText },
  { value: "video", label: "Video", icon: "" },
  { value: "audio", label: "Audio", icon: "" },
  { value: "link", label: "Link", icon: LinkIcon },
  { value: "presentation", label: "Presentation", icon: "" },
  { value: "other", label: "Other", icon: "" },
]

const TYPE_COLORS: Record<string, string> = {
  document: "bg-blue-100 text-blue-700",
  video: "bg-purple-100 text-purple-700",
  audio: "bg-green-100 text-green-700",
  link: "bg-orange-100 text-orange-700",
  presentation: "bg-red-100 text-red-700",
  other: "bg-gray-100 text-gray-700",
}

function TypeBadge({ type }: { type: string }) {
  const typeInfo = MATERIAL_TYPES.find((t) => t.value === type)
  const label = typeInfo?.label || type
  return (
    <Badge className={TYPE_COLORS[type] || TYPE_COLORS.other}>
      {label}
    </Badge>
  )
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "-"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export function StudyMaterialsClient({
  initialMaterials,
  subjects,
  classes,
  currentAcademicYear,
}: StudyMaterialsClientProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [materials, setMaterials] = useState<StudyMaterial[]>(initialMaterials)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState<StudyMaterial | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    material_type: "document",
    file_url: "",
    file_name: "",
    file_size: 0,
    external_link: "",
    class_id: "",
    subject_id: "",
    is_downloadable: true,
    is_visible: true,
  })

  const [filters, setFilters] = useState({
    subject_id: "",
    class_id: "",
    material_type: "",
  })

  const filteredMaterials = useMemo(() => {
    return materials.filter((material) => {
      if (filters.subject_id && material.subject_id !== filters.subject_id) return false
      if (filters.class_id && material.class_id !== filters.class_id) return false
      if (filters.material_type && material.material_type !== filters.material_type) return false
      return true
    })
  }, [materials, filters])

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      material_type: "document",
      file_url: "",
      file_name: "",
      file_size: 0,
      external_link: "",
      class_id: "",
      subject_id: "",
      is_downloadable: true,
      is_visible: true,
    })
    setEditingMaterial(null)
  }

  const handleCreateOrUpdate = async () => {
    if (!formData.title) {
      toast({
        title: "Error",
        description: "Title is required",
        variant: "destructive",
      })
      return
    }

    if (formData.material_type === "link" && !formData.external_link) {
      toast({
        title: "Error",
        description: "External link is required for link-type materials",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)

    if (editingMaterial) {
      const result = await updateStudyMaterial(editingMaterial.id, {
        title: formData.title,
        description: formData.description || undefined,
        class_id: formData.class_id || undefined,
        subject_id: formData.subject_id || undefined,
        is_downloadable: formData.is_downloadable,
        is_visible: formData.is_visible,
      })
      setIsLoading(false)

      if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Success",
        description: "Material updated successfully",
      })
    } else {
      const result = await createStudyMaterial({
        title: formData.title,
        description: formData.description || undefined,
        material_type: formData.material_type,
        file_url: formData.file_url || undefined,
        file_name: formData.file_name || undefined,
        file_size: formData.file_size || undefined,
        external_link: formData.external_link || undefined,
        class_id: formData.class_id || undefined,
        subject_id: formData.subject_id || undefined,
        is_downloadable: formData.is_downloadable,
        is_visible: formData.is_visible,
        term_id: currentAcademicYear?.terms.find((t) => t.name === "Current")?.id,
      })
      setIsLoading(false)

      if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Success",
        description: "Material created successfully",
      })
    }

    resetForm()
    setIsCreateOpen(false)
    router.refresh()
  }

  const handleDeleteMaterial = async (materialId: string) => {
    if (!confirm("Are you sure you want to delete this material?")) return

    setIsLoading(true)
    const result = await deleteStudyMaterial(materialId)
    setIsLoading(false)

    if (result.error) {
      toast({
        title: "Error",
        description: result.error,
        variant: "destructive",
      })
      return
    }

    toast({
      title: "Success",
      description: "Material deleted successfully",
    })

    setMaterials(materials.filter((m) => m.id !== materialId))
    router.refresh()
  }

  const handleDownload = async (material: StudyMaterial) => {
    if (material.file_url) {
      await incrementStudyMaterialDownload(material.id)
      window.open(material.file_url, "_blank")
    } else if (material.external_link) {
      await incrementStudyMaterialDownload(material.id)
      window.open(material.external_link, "_blank")
    }
  }

  const handleEditMaterial = (material: StudyMaterial) => {
    setEditingMaterial(material)
    setFormData({
      title: material.title,
      description: material.description || "",
      material_type: material.material_type,
      file_url: material.file_url || "",
      file_name: material.file_name || "",
      file_size: material.file_size || 0,
      external_link: material.external_link || "",
      class_id: material.class_id || "",
      subject_id: material.subject_id || "",
      is_downloadable: material.is_downloadable,
      is_visible: material.is_visible,
    })
    setIsCreateOpen(true)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Study Materials</h1>
          <p className="text-muted-foreground mt-2">
            Upload and manage study materials for your students
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={(open) => {
          setIsCreateOpen(open)
          if (!open) resetForm()
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Upload Material
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingMaterial ? "Edit" : "Upload"} Study Material
              </DialogTitle>
              <DialogDescription>
                {editingMaterial
                  ? "Update the study material details"
                  : "Add a new study material for your students"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 max-h-96 overflow-y-auto">
              <div>
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g., Chapter 5 Study Notes"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Add any notes or description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="type">Material Type *</Label>
                  <Select value={formData.material_type} onValueChange={(value) => setFormData({ ...formData, material_type: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MATERIAL_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="subject">Subject</Label>
                  <Select value={formData.subject_id} onValueChange={(value) => setFormData({ ...formData, subject_id: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select subject" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {subjects.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="class">Class</Label>
                  <Select value={formData.class_id} onValueChange={(value) => setFormData({ ...formData, class_id: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Classes</SelectItem>
                      {classes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {formData.material_type === "link" && (
                <div>
                  <Label htmlFor="link">External Link *</Label>
                  <Input
                    id="link"
                    type="url"
                    placeholder="https://example.com"
                    value={formData.external_link}
                    onChange={(e) => setFormData({ ...formData, external_link: e.target.value })}
                  />
                </div>
              )}
              {!editingMaterial && formData.material_type !== "link" && (
                <>
                  <div>
                    <Label htmlFor="file_url">File URL</Label>
                    <Input
                      id="file_url"
                      type="url"
                      placeholder="URL to the file on storage service"
                      value={formData.file_url}
                      onChange={(e) => setFormData({ ...formData, file_url: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="file_name">File Name</Label>
                      <Input
                        id="file_name"
                        placeholder="document.pdf"
                        value={formData.file_name}
                        onChange={(e) => setFormData({ ...formData, file_name: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="file_size">File Size (bytes)</Label>
                      <Input
                        id="file_size"
                        type="number"
                        value={formData.file_size}
                        onChange={(e) => setFormData({ ...formData, file_size: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                </>
              )}
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.is_downloadable}
                    onChange={(e) => setFormData({ ...formData, is_downloadable: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm">Allow downloads</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.is_visible}
                    onChange={(e) => setFormData({ ...formData, is_visible: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm">Visible to students</span>
                </label>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsCreateOpen(false)
                  resetForm()
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleCreateOrUpdate} disabled={isLoading}>
                {isLoading ? "Saving..." : editingMaterial ? "Update Material" : "Upload Material"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Materials</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{materials.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Views</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {materials.reduce((acc, m) => acc + m.view_count, 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Downloads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {materials.reduce((acc, m) => acc + m.download_count, 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Downloadable</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {materials.filter((m) => m.is_downloadable).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            <Select value={filters.subject_id} onValueChange={(value) => setFilters({ ...filters, subject_id: value })}>
              <SelectTrigger>
                <SelectValue placeholder="All Subjects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Subjects</SelectItem>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.class_id} onValueChange={(value) => setFilters({ ...filters, class_id: value })}>
              <SelectTrigger>
                <SelectValue placeholder="All Classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Classes</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.material_type} onValueChange={(value) => setFilters({ ...filters, material_type: value })}>
              <SelectTrigger>
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Types</SelectItem>
                {MATERIAL_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Materials Table */}
      <Card>
        <CardHeader>
          <CardTitle>Study Materials</CardTitle>
          <CardDescription>
            {filteredMaterials.length} material{filteredMaterials.length !== 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Class</TableHead>
                <TableHead className="text-center">Views</TableHead>
                <TableHead className="text-center">Downloads</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMaterials.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    <FileText className="w-12 h-12 mx-auto mb-2 opacity-20" />
                    No materials found. Upload one to get started!
                  </TableCell>
                </TableRow>
              ) : (
                filteredMaterials.map((material) => (
                  <TableRow key={material.id}>
                    <TableCell className="font-medium max-w-xs truncate">{material.title}</TableCell>
                    <TableCell>
                      <TypeBadge type={material.material_type} />
                    </TableCell>
                    <TableCell className="text-sm">{material.subject?.name || "-"}</TableCell>
                    <TableCell className="text-sm">{material.class?.name || "All"}</TableCell>
                    <TableCell className="text-center text-sm">
                      <div className="flex items-center justify-center gap-1">
                        <Eye className="w-3 h-3 text-muted-foreground" />
                        {material.view_count}
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      <div className="flex items-center justify-center gap-1">
                        <Download className="w-3 h-3 text-muted-foreground" />
                        {material.download_count}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(material.created_at)}</TableCell>
                    <TableCell className="text-right space-x-2">
                      {material.is_downloadable && (material.file_url || material.external_link) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownload(material)}
                        >
                          <Download className="w-3 h-3" />
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditMaterial(material)}
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteMaterial(material.id)}
                        disabled={isLoading}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
