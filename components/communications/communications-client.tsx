"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  Plus, Pencil, Trash2, Send, Search, MessageSquare, Mail,
  Users, Megaphone, FileText, ChevronDown, ChevronUp, Clock,
  CheckCircle2, XCircle, AlertCircle, BarChart3,
} from "lucide-react"
import {
  createTemplate, updateTemplate, deleteTemplate,
  createCampaign, sendCampaign,
} from "@/lib/actions/communications"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"

// ── Types ──

interface TemplateData {
  id: string
  name: string
  channel: string
  subject: string | null
  body: string
  variables: string | null
  created_at: string
}

interface CampaignData {
  id: string
  name: string
  channel: string
  subject: string | null
  body: string
  recipient_type: string
  recipient_filter: Record<string, any> | null
  template_id: string | null
  status: string
  total_recipients: number
  sent_count: number
  failed_count: number
  scheduled_at: string | null
  sent_at: string | null
  created_at: string
}

interface ClassData {
  id: string
  name: string
  section: string | null
}

interface CommunicationsClientProps {
  initialCampaigns: CampaignData[]
  initialTemplates: TemplateData[]
  classes: ClassData[]
}

const emptyCampaignForm = {
  name: "",
  channel: "sms",
  template_id: "",
  subject: "",
  body: "",
  recipient_type: "all_parents",
  class_id: "",
  schedule_type: "now" as "now" | "scheduled",
  scheduled_at: "",
}

const emptyTemplateForm = {
  name: "",
  channel: "sms",
  subject: "",
  body: "",
  variables: "",
}

export function CommunicationsClient({
  initialCampaigns,
  initialTemplates,
  classes,
}: CommunicationsClientProps) {
  const router = useRouter()
  const { toast } = useToast()

  const [activeTab, setActiveTab] = useState<"campaigns" | "templates">("campaigns")
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  // Campaign state
  const [isCampaignOpen, setIsCampaignOpen] = useState(false)
  const [campaignForm, setCampaignForm] = useState(emptyCampaignForm)
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null)
  const [isSendConfirmOpen, setIsSendConfirmOpen] = useState(false)
  const [sendingCampaignId, setSendingCampaignId] = useState<string | null>(null)

  // Template state
  const [isTemplateOpen, setIsTemplateOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<TemplateData | null>(null)
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm)

  // ── Stats ──

  const totalCampaigns = initialCampaigns.length
  const sentCampaigns = initialCampaigns.filter((c) => c.status === "sent").length
  const totalMessages = initialCampaigns.reduce((sum, c) => sum + (c.sent_count || 0), 0)

  // ── Template selection auto-fill ──

  const handleTemplateSelect = (templateId: string) => {
    setCampaignForm((prev) => ({ ...prev, template_id: templateId }))
    const tpl = initialTemplates.find((t) => t.id === templateId)
    if (tpl) {
      setCampaignForm((prev) => ({
        ...prev,
        template_id: templateId,
        subject: tpl.subject || "",
        body: tpl.body,
        channel: tpl.channel,
      }))
    }
  }

  // ── Campaign CRUD ──

  const handleCreateCampaign = async () => {
    if (!campaignForm.name.trim() || !campaignForm.body.trim()) {
      toast({ title: "Missing fields", description: "Name and body are required", variant: "destructive" })
      return
    }

    setIsLoading(true)

    const recipientFilter: Record<string, any> = {}
    if (campaignForm.recipient_type === "class" && campaignForm.class_id) {
      recipientFilter.class_id = campaignForm.class_id
    }

    const result = await createCampaign({
      name: campaignForm.name,
      channel: campaignForm.channel,
      subject: campaignForm.subject || undefined,
      body: campaignForm.body,
      recipient_type: campaignForm.recipient_type,
      recipient_filter: Object.keys(recipientFilter).length > 0 ? recipientFilter : undefined,
      template_id: campaignForm.template_id || undefined,
      scheduled_at: campaignForm.schedule_type === "scheduled" && campaignForm.scheduled_at
        ? new Date(campaignForm.scheduled_at).toISOString()
        : undefined,
    })

    setIsLoading(false)

    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    toast({ title: "Campaign created successfully" })
    setIsCampaignOpen(false)
    setCampaignForm(emptyCampaignForm)
    router.refresh()
  }

  const handleSendCampaign = async () => {
    if (!sendingCampaignId) return

    setIsLoading(true)
    const result = await sendCampaign(sendingCampaignId)
    setIsLoading(false)

    if (result.error) {
      toast({ title: "Error sending campaign", description: result.error, variant: "destructive" })
    } else {
      toast({ title: "Campaign sent", description: `${result.sent} recipients reached` })
    }

    setIsSendConfirmOpen(false)
    setSendingCampaignId(null)
    router.refresh()
  }

  const openSendConfirm = (id: string) => {
    setSendingCampaignId(id)
    setIsSendConfirmOpen(true)
  }

  // ── Template CRUD ──

  const resetTemplateForm = () => setTemplateForm(emptyTemplateForm)

  const openEditTemplate = (tpl: TemplateData) => {
    setEditingTemplate(tpl)
    setTemplateForm({
      name: tpl.name,
      channel: tpl.channel,
      subject: tpl.subject || "",
      body: tpl.body,
      variables: tpl.variables || "",
    })
  }

  const handleSaveTemplate = async () => {
    if (!templateForm.name.trim() || !templateForm.body.trim()) {
      toast({ title: "Missing fields", description: "Name and body are required", variant: "destructive" })
      return
    }

    setIsLoading(true)

    const payload = {
      name: templateForm.name,
      channel: templateForm.channel,
      subject: templateForm.subject || undefined,
      body: templateForm.body,
      variables: templateForm.variables || undefined,
    }

    const result = editingTemplate
      ? await updateTemplate(editingTemplate.id, payload)
      : await createTemplate(payload)

    setIsLoading(false)

    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    toast({ title: editingTemplate ? "Template updated" : "Template created" })
    setIsTemplateOpen(false)
    setEditingTemplate(null)
    resetTemplateForm()
    router.refresh()
  }

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm("Delete this template? This cannot be undone.")) return

    const result = await deleteTemplate(id)
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }
    toast({ title: "Template deleted" })
    router.refresh()
  }

  // ── Filtering ──

  const filteredCampaigns = initialCampaigns.filter((c) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      c.name.toLowerCase().includes(q) ||
      c.channel.toLowerCase().includes(q) ||
      c.recipient_type.toLowerCase().includes(q)
    )
  })

  // ── Status Badges ──

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-800/40 dark:text-gray-300">Draft</Badge>
      case "scheduled":
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">Scheduled</Badge>
      case "sending":
        return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">Sending</Badge>
      case "sent":
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">Sent</Badge>
      case "failed":
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">Failed</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getChannelBadge = (channel: string) => {
    switch (channel) {
      case "sms":
        return <Badge variant="outline" className="border-violet-300 text-violet-700 dark:text-violet-300"><MessageSquare className="w-3 h-3 mr-1" />SMS</Badge>
      case "email":
        return <Badge variant="outline" className="border-sky-300 text-sky-700 dark:text-sky-300"><Mail className="w-3 h-3 mr-1" />Email</Badge>
      case "both":
        return <Badge variant="outline" className="border-emerald-300 text-emerald-700 dark:text-emerald-300"><Send className="w-3 h-3 mr-1" />Both</Badge>
      default:
        return <Badge variant="outline">{channel}</Badge>
    }
  }

  const getRecipientLabel = (type: string) => {
    switch (type) {
      case "all_parents": return "All Parents"
      case "class": return "By Class"
      case "staff": return "Staff"
      case "individual": return "Individual"
      default: return type
    }
  }

  // ── Tabs ──

  const tabs = [
    { key: "campaigns" as const, label: "Campaigns", icon: Megaphone },
    { key: "templates" as const, label: "Templates", icon: FileText },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-neutral-900 mb-2">
            Communications
          </h1>
          <p className="text-lg text-neutral-500">
            Send bulk SMS and email messages to parents, staff, and students
          </p>
        </div>
      </div>

      {/* Stats Banner */}
      <Card className="border-0 shadow-sm bg-violet-600 text-white">
        <CardContent className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            <div className="text-center">
              <Megaphone className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold">{totalCampaigns}</p>
              <p className="text-white/70 text-sm">Total Campaigns</p>
            </div>
            <div className="text-center">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold">{sentCampaigns}</p>
              <p className="text-white/70 text-sm">Sent</p>
            </div>
            <div className="text-center">
              <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold">{totalMessages}</p>
              <p className="text-white/70 text-sm">Total Messages</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-neutral-900 text-white shadow-sm"
                : "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.key === "campaigns" && (
              <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                {totalCampaigns}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {/* ════════════════ CAMPAIGNS TAB ════════════════ */}
      {activeTab === "campaigns" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
              <Input
                placeholder="Search campaigns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button onClick={() => { setCampaignForm(emptyCampaignForm); setIsCampaignOpen(true) }}>
              <Plus className="mr-2 h-4 w-4" />
              New Campaign
            </Button>
          </div>

          {filteredCampaigns.length === 0 ? (
            <Card className="border-0 shadow-xl">
              <CardContent className="py-12 text-center text-neutral-500">
                <Megaphone className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>{searchQuery ? "No campaigns match your search." : "No campaigns yet. Create your first campaign."}</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-0 shadow-xl">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Recipients</TableHead>
                      <TableHead>Sent / Failed</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCampaigns.map((campaign) => (
                      <>
                        <TableRow key={campaign.id} className="cursor-pointer" onClick={() => setExpandedCampaign(expandedCampaign === campaign.id ? null : campaign.id)}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {expandedCampaign === campaign.id ? (
                                <ChevronUp className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                              )}
                              <span className="font-medium">{campaign.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>{getChannelBadge(campaign.channel)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5 text-neutral-500" />
                              <span className="text-sm">{getRecipientLabel(campaign.recipient_type)}</span>
                              {campaign.total_recipients > 0 && (
                                <span className="text-xs text-neutral-500">({campaign.total_recipients})</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-green-600 dark:text-green-400">{campaign.sent_count}</span>
                              <span className="text-neutral-500">/</span>
                              <span className="text-red-600 dark:text-red-400">{campaign.failed_count}</span>
                            </div>
                          </TableCell>
                          <TableCell>{getStatusBadge(campaign.status)}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {new Date(campaign.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                              {campaign.status === "draft" && (
                                <Button
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700 text-white"
                                  onClick={() => openSendConfirm(campaign.id)}
                                  disabled={isLoading}
                                >
                                  <Send className="h-3 w-3 mr-1" />
                                  Send
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* Expanded details */}
                        {expandedCampaign === campaign.id && (
                          <TableRow key={`${campaign.id}-detail`}>
                            <TableCell colSpan={7} className="bg-neutral-50 p-4">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                  <p className="text-neutral-500 mb-1">Subject</p>
                                  <p className="font-medium">{campaign.subject || "—"}</p>
                                </div>
                                <div>
                                  <p className="text-neutral-500 mb-1">Total Recipients</p>
                                  <p className="font-medium">{campaign.total_recipients}</p>
                                </div>
                                <div>
                                  <p className="text-neutral-500 mb-1">Sent At</p>
                                  <p className="font-medium">
                                    {campaign.sent_at ? new Date(campaign.sent_at).toLocaleString() : "—"}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-neutral-500 mb-1">Scheduled At</p>
                                  <p className="font-medium">
                                    {campaign.scheduled_at ? new Date(campaign.scheduled_at).toLocaleString() : "—"}
                                  </p>
                                </div>
                                <div className="col-span-2 md:col-span-4">
                                  <p className="text-neutral-500 mb-1">Message Body</p>
                                  <p className="font-medium whitespace-pre-wrap bg-white rounded-md p-3 border border-neutral-200">{campaign.body}</p>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ════════════════ TEMPLATES TAB ════════════════ */}
      {activeTab === "templates" && (
        <div className="space-y-4">
          <div className="flex items-center justify-end">
            <Button onClick={() => { resetTemplateForm(); setEditingTemplate(null); setIsTemplateOpen(true) }}>
              <Plus className="mr-2 h-4 w-4" />
              New Template
            </Button>
          </div>

          {initialTemplates.length === 0 ? (
            <Card className="border-0 shadow-xl">
              <CardContent className="py-12 text-center text-neutral-500">
                <FileText className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>No templates yet. Create your first message template.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {initialTemplates.map((tpl) => (
                <Card key={tpl.id} className="border-0 shadow-xl hover:shadow-2xl transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base">{tpl.name}</CardTitle>
                      {getChannelBadge(tpl.channel)}
                    </div>
                    {tpl.subject && (
                      <p className="text-sm text-neutral-500 truncate">Subject: {tpl.subject}</p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-neutral-500 line-clamp-3">{tpl.body}</p>
                    {tpl.variables && (
                      <div className="flex flex-wrap gap-1">
                        {tpl.variables.split(",").map((v) => (
                          <Badge key={v.trim()} variant="secondary" className="text-xs">
                            {v.trim()}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-2 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { openEditTemplate(tpl); setIsTemplateOpen(true) }}
                      >
                        <Pencil className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteTemplate(tpl.id)}
                        className="ml-auto text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════ NEW CAMPAIGN DIALOG ════════════════ */}
      <Dialog open={isCampaignOpen} onOpenChange={setIsCampaignOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Campaign</DialogTitle>
            <DialogDescription>Create a bulk message campaign</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Campaign Name *</Label>
              <Input
                value={campaignForm.name}
                onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
                placeholder="e.g. Term 2 Fee Reminder"
              />
            </div>

            <div className="space-y-2">
              <Label>Channel</Label>
              <div className="flex gap-3">
                {(["sms", "email", "both"] as const).map((ch) => (
                  <label
                    key={ch}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors ${
                      campaignForm.channel === ch
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-muted hover:bg-muted"
                    }`}
                  >
                    <input
                      type="radio"
                      name="channel"
                      value={ch}
                      checked={campaignForm.channel === ch}
                      onChange={(e) => setCampaignForm({ ...campaignForm, channel: e.target.value })}
                      className="sr-only"
                    />
                    {ch === "sms" && <MessageSquare className="w-4 h-4" />}
                    {ch === "email" && <Mail className="w-4 h-4" />}
                    {ch === "both" && <Send className="w-4 h-4" />}
                    <span className="capitalize text-sm font-medium">{ch === "both" ? "Both" : ch.toUpperCase()}</span>
                  </label>
                ))}
              </div>
            </div>

            {initialTemplates.length > 0 && (
              <div className="space-y-2">
                <Label>Template (optional)</Label>
                <Select
                  value={campaignForm.template_id}
                  onValueChange={handleTemplateSelect}
                >
                  <SelectTrigger><SelectValue placeholder="Select a template to auto-fill" /></SelectTrigger>
                  <SelectContent>
                    {initialTemplates.map((tpl) => (
                      <SelectItem key={tpl.id} value={tpl.id}>
                        {tpl.name} ({tpl.channel.toUpperCase()})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {(campaignForm.channel === "email" || campaignForm.channel === "both") && (
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input
                  value={campaignForm.subject}
                  onChange={(e) => setCampaignForm({ ...campaignForm, subject: e.target.value })}
                  placeholder="Email subject line"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Message Body *</Label>
              <Textarea
                value={campaignForm.body}
                onChange={(e) => setCampaignForm({ ...campaignForm, body: e.target.value })}
                placeholder="Type your message here..."
                rows={5}
              />
              <p className="text-xs text-muted-foreground">
                Available variables: {"{student_name}"}, {"{parent_name}"}, {"{class}"}, {"{balance}"}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Recipient Type</Label>
              <Select
                value={campaignForm.recipient_type}
                onValueChange={(v) => setCampaignForm({ ...campaignForm, recipient_type: v, class_id: "" })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_parents">All Parents</SelectItem>
                  <SelectItem value="class">By Class</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="individual">Individual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {campaignForm.recipient_type === "class" && (
              <div className="space-y-2">
                <Label>Select Class</Label>
                <Select
                  value={campaignForm.class_id}
                  onValueChange={(v) => setCampaignForm({ ...campaignForm, class_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Choose a class" /></SelectTrigger>
                  <SelectContent>
                    {classes.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.name}{cls.section ? ` - ${cls.section}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Schedule</Label>
              <div className="flex gap-3">
                {([
                  { value: "now", label: "Send Now", icon: Send },
                  { value: "scheduled", label: "Schedule", icon: Clock },
                ] as const).map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors ${
                      campaignForm.schedule_type === opt.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-muted hover:bg-muted"
                    }`}
                  >
                    <input
                      type="radio"
                      name="schedule_type"
                      value={opt.value}
                      checked={campaignForm.schedule_type === opt.value}
                      onChange={(e) => setCampaignForm({ ...campaignForm, schedule_type: e.target.value as "now" | "scheduled" })}
                      className="sr-only"
                    />
                    <opt.icon className="w-4 h-4" />
                    <span className="text-sm font-medium">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {campaignForm.schedule_type === "scheduled" && (
              <div className="space-y-2">
                <Label>Send Date & Time</Label>
                <Input
                  type="datetime-local"
                  value={campaignForm.scheduled_at}
                  onChange={(e) => setCampaignForm({ ...campaignForm, scheduled_at: e.target.value })}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCampaignOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreateCampaign}
              disabled={isLoading || !campaignForm.name.trim() || !campaignForm.body.trim()}
            >
              {isLoading ? "Creating..." : "Create Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════ SEND CONFIRMATION DIALOG ════════════════ */}
      <Dialog open={isSendConfirmOpen} onOpenChange={setIsSendConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Send</DialogTitle>
            <DialogDescription>
              Are you sure you want to send this campaign? This action will deliver messages to all resolved recipients.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              <p className="text-sm text-amber-800">
                No SMS/email provider is currently configured. Messages will be logged but not actually delivered.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSendConfirmOpen(false)}>Cancel</Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={handleSendCampaign}
              disabled={isLoading}
            >
              {isLoading ? "Sending..." : "Confirm & Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════ TEMPLATE DIALOG ════════════════ */}
      <Dialog
        open={isTemplateOpen || !!editingTemplate}
        onOpenChange={(open) => {
          if (!open) {
            setIsTemplateOpen(false)
            setEditingTemplate(null)
            resetTemplateForm()
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Edit Template" : "New Template"}</DialogTitle>
            <DialogDescription>
              {editingTemplate ? "Update message template" : "Create a reusable message template"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={templateForm.name}
                onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                placeholder="e.g. Fee Reminder"
              />
            </div>
            <div className="space-y-2">
              <Label>Channel</Label>
              <Select
                value={templateForm.channel}
                onValueChange={(v) => setTemplateForm({ ...templateForm, channel: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(templateForm.channel === "email" || templateForm.channel === "both") && (
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input
                  value={templateForm.subject}
                  onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })}
                  placeholder="Email subject"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Body *</Label>
              <Textarea
                value={templateForm.body}
                onChange={(e) => setTemplateForm({ ...templateForm, body: e.target.value })}
                placeholder="Message body with {variables}..."
                rows={5}
              />
            </div>
            <div className="space-y-2">
              <Label>Variables (comma-separated)</Label>
              <Input
                value={templateForm.variables}
                onChange={(e) => setTemplateForm({ ...templateForm, variables: e.target.value })}
                placeholder="e.g. student_name, parent_name, class, balance"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setIsTemplateOpen(false); setEditingTemplate(null); resetTemplateForm() }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveTemplate}
              disabled={isLoading || !templateForm.name.trim() || !templateForm.body.trim()}
            >
              {isLoading ? "Saving..." : editingTemplate ? "Save Changes" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
