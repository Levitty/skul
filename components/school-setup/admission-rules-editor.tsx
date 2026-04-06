"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { updateAdmissionRules } from "@/lib/actions/school-setup"
import { useToast } from "@/hooks/use-toast"
import { Save, Eye, Edit3 } from "lucide-react"

interface AdmissionRulesEditorProps {
  currentRules: string
}

export function AdmissionRulesEditor({ currentRules }: AdmissionRulesEditorProps) {
  const { toast } = useToast()
  const [rules, setRules] = useState(currentRules)
  const [saving, setSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const result = await updateAdmissionRules(rules)
      if (result.error) {
        toast({ title: "Error", description: result.error, variant: "destructive" })
      } else {
        toast({ title: "Saved", description: "Admission rules updated successfully." })
      }
    } catch {
      toast({ title: "Error", description: "Failed to save rules.", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl">Admission Rules & Regulations</CardTitle>
              <CardDescription className="mt-1">
                These rules will be displayed to parents on the public admission form.
                Parents must accept them before submitting an application.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPreview(!showPreview)}
            >
              {showPreview ? <Edit3 className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
              {showPreview ? "Edit" : "Preview"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showPreview ? (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6 min-h-[300px]">
              {rules ? (
                <div className="text-sm leading-relaxed whitespace-pre-wrap">{rules}</div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No rules configured. Parents will be able to proceed without accepting any rules.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="rules-text">Rules Text</Label>
              <textarea
                id="rules-text"
                className="w-full min-h-[300px] rounded-lg border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono"
                placeholder={`Enter your school's admission rules and regulations here...\n\nExample:\n1. All students must wear the prescribed school uniform.\n2. School fees must be paid before the start of each term.\n3. Parents must attend all scheduled parent-teacher meetings.\n4. Students must maintain good academic standing and discipline.\n5. The school reserves the right to refuse admission.`}
                value={rules}
                onChange={(e) => setRules(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Line breaks will be preserved. Write each rule on a new line for clarity.
              </p>
            </div>
          )}

          <div className="flex justify-end mt-6">
            <Button onClick={handleSave} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save Rules"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
