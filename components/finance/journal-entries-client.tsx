"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { createJournalEntry, createInterAccountTransfer } from "@/lib/actions/journal-entries"
import {
  Plus,
  ArrowLeftRight,
  ChevronDown,
  ChevronRight,
  Loader2,
  Trash2,
} from "lucide-react"

interface JournalEntryLine {
  id?: string
  account_id: string
  debit_amount: number
  credit_amount: number
  description?: string
  chart_of_accounts?: { account_code: string; account_name: string }
}

interface JournalEntry {
  id: string
  entry_number: string
  entry_date: string
  description: string
  journal_entry_lines: JournalEntryLine[]
}

interface ChartAccount {
  id: string
  account_code: string
  account_name: string
  account_type: string
}

interface JournalEntriesClientProps {
  journalEntries: JournalEntry[]
  chartOfAccounts: ChartAccount[]
}

const emptyLine = (): JournalEntryLine => ({
  account_id: "",
  debit_amount: 0,
  credit_amount: 0,
  description: "",
})

export function JournalEntriesClient({
  journalEntries,
  chartOfAccounts,
}: JournalEntriesClientProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // New Journal Entry state
  const [journalDialogOpen, setJournalDialogOpen] = useState(false)
  const [journalSubmitting, setJournalSubmitting] = useState(false)
  const [journalForm, setJournalForm] = useState({
    description: "",
    entry_date: new Date().toISOString().split("T")[0],
    lines: [emptyLine(), emptyLine()] as JournalEntryLine[],
  })

  // Inter-Account Transfer state
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [transferSubmitting, setTransferSubmitting] = useState(false)
  const [transferForm, setTransferForm] = useState({
    from_account_id: "",
    to_account_id: "",
    amount: "",
    description: "",
    transfer_date: new Date().toISOString().split("T")[0],
  })

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const getEntryTotal = (entry: JournalEntry) => {
    const lines = entry.journal_entry_lines || []
    return lines.reduce(
      (sum, l) => sum + (Number(l.debit_amount) || 0),
      0
    )
  }

  const addJournalLine = () => {
    setJournalForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }))
  }

  const removeJournalLine = (idx: number) => {
    if (journalForm.lines.length <= 2) return
    setJournalForm((f) => ({
      ...f,
      lines: f.lines.filter((_, i) => i !== idx),
    }))
  }

  const updateJournalLine = (idx: number, field: keyof JournalEntryLine, value: string | number) => {
    setJournalForm((f) => ({
      ...f,
      lines: f.lines.map((l, i) =>
        i === idx ? { ...l, [field]: value } : l
      ),
    }))
  }

  const journalTotals = journalForm.lines.reduce(
    (acc, l) => ({
      debits: acc.debits + (Number(l.debit_amount) || 0),
      credits: acc.credits + (Number(l.credit_amount) || 0),
    }),
    { debits: 0, credits: 0 }
  )
  const journalBalanced = Math.abs(journalTotals.debits - journalTotals.credits) < 0.01
  const journalCanSubmit =
    journalForm.description.trim() &&
    journalForm.entry_date &&
    journalForm.lines.length >= 2 &&
    journalForm.lines.every(
      (l) =>
        l.account_id &&
        ((Number(l.debit_amount) || 0) > 0) !== ((Number(l.credit_amount) || 0) > 0)
    ) &&
    journalBalanced

  const handleJournalSubmit = async () => {
    if (!journalCanSubmit) return
    setJournalSubmitting(true)
    try {
      await createJournalEntry({
        description: journalForm.description.trim(),
        entry_date: journalForm.entry_date,
        lines: journalForm.lines
          .filter((l) => l.account_id && ((Number(l.debit_amount) || 0) > 0 || (Number(l.credit_amount) || 0) > 0))
          .map((l) => ({
            account_id: l.account_id,
            debit_amount: Number(l.debit_amount) || 0,
            credit_amount: Number(l.credit_amount) || 0,
            description: l.description?.trim() || undefined,
          })),
      })
      toast({ title: "Journal entry created", description: "The entry has been recorded." })
      setJournalDialogOpen(false)
      setJournalForm({
        description: "",
        entry_date: new Date().toISOString().split("T")[0],
        lines: [emptyLine(), emptyLine()],
      })
      router.refresh()
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Failed to create journal entry",
        variant: "destructive",
      })
    } finally {
      setJournalSubmitting(false)
    }
  }

  const transferCanSubmit =
    transferForm.from_account_id &&
    transferForm.to_account_id &&
    transferForm.from_account_id !== transferForm.to_account_id &&
    Number(transferForm.amount) > 0 &&
    transferForm.description.trim() &&
    transferForm.transfer_date

  const handleTransferSubmit = async () => {
    if (!transferCanSubmit) return
    setTransferSubmitting(true)
    try {
      await createInterAccountTransfer({
        from_account_id: transferForm.from_account_id,
        to_account_id: transferForm.to_account_id,
        amount: Number(transferForm.amount),
        description: transferForm.description.trim(),
        transfer_date: transferForm.transfer_date,
      })
      toast({ title: "Transfer completed", description: "The inter-account transfer has been recorded." })
      setTransferDialogOpen(false)
      setTransferForm({
        from_account_id: "",
        to_account_id: "",
        amount: "",
        description: "",
        transfer_date: new Date().toISOString().split("T")[0],
      })
      router.refresh()
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Failed to create transfer",
        variant: "destructive",
      })
    } finally {
      setTransferSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        <Dialog open={journalDialogOpen} onOpenChange={setJournalDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white">
              <Plus className="w-4 h-4 mr-2" />
              New Journal Entry
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New Journal Entry</DialogTitle>
              <DialogDescription>
                Add a manual journal entry. Debits must equal credits.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="journal-desc">Description (required)</Label>
                <Input
                  id="journal-desc"
                  value={journalForm.description}
                  onChange={(e) =>
                    setJournalForm((f) => ({ ...f, description: e.target.value }))
                  }
                  placeholder="e.g. Office supplies purchase"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="journal-date">Date (required)</Label>
                <Input
                  id="journal-date"
                  type="date"
                  value={journalForm.entry_date}
                  onChange={(e) =>
                    setJournalForm((f) => ({ ...f, entry_date: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Line items</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addJournalLine}>
                    <Plus className="w-4 h-4 mr-1" />
                    Add Line
                  </Button>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {journalForm.lines.map((line, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <Select
                              value={line.account_id}
                              onValueChange={(v) => updateJournalLine(idx, "account_id", v)}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Select account" />
                              </SelectTrigger>
                              <SelectContent>
                                {chartOfAccounts.map((a) => (
                                  <SelectItem key={a.id} value={a.id}>
                                    {a.account_code} - {a.account_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              className="text-right h-9"
                              value={line.debit_amount || ""}
                              onChange={(e) => {
                                const v = e.target.value
                                updateJournalLine(idx, "debit_amount", v ? Number(v) : 0)
                                if (v) updateJournalLine(idx, "credit_amount", 0)
                              }}
                              placeholder="0"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              className="text-right h-9"
                              value={line.credit_amount || ""}
                              onChange={(e) => {
                                const v = e.target.value
                                updateJournalLine(idx, "credit_amount", v ? Number(v) : 0)
                                if (v) updateJournalLine(idx, "debit_amount", 0)
                              }}
                              placeholder="0"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-9"
                              value={line.description || ""}
                              onChange={(e) =>
                                updateJournalLine(idx, "description", e.target.value)
                              }
                              placeholder="Line description"
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 text-destructive"
                              onClick={() => removeJournalLine(idx)}
                              disabled={journalForm.lines.length <= 2}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex justify-end gap-4 text-sm">
                  <span>
                    Total Debits:{" "}
                    <strong>{journalTotals.debits.toFixed(2)}</strong>
                  </span>
                  <span>
                    Total Credits:{" "}
                    <strong>{journalTotals.credits.toFixed(2)}</strong>
                  </span>
                  {!journalBalanced && (
                    <span className="text-destructive">Must match</span>
                  )}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setJournalDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleJournalSubmit}
                disabled={!journalCanSubmit || journalSubmitting}
              >
                {journalSubmitting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                Create Entry
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <ArrowLeftRight className="w-4 h-4 mr-2" />
              Inter-Account Transfer
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Inter-Account Transfer</DialogTitle>
              <DialogDescription>
                Move funds from one account to another. Creates a journal entry automatically.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid gap-2">
                <Label>From Account</Label>
                <Select
                  value={transferForm.from_account_id}
                  onValueChange={(v) =>
                    setTransferForm((f) => ({ ...f, from_account_id: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {chartOfAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.account_code} - {a.account_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>To Account</Label>
                <Select
                  value={transferForm.to_account_id}
                  onValueChange={(v) =>
                    setTransferForm((f) => ({ ...f, to_account_id: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {chartOfAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.account_code} - {a.account_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="transfer-amount">Amount</Label>
                <Input
                  id="transfer-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={transferForm.amount}
                  onChange={(e) =>
                    setTransferForm((f) => ({ ...f, amount: e.target.value }))
                  }
                  placeholder="0.00"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="transfer-desc">Description</Label>
                <Input
                  id="transfer-desc"
                  value={transferForm.description}
                  onChange={(e) =>
                    setTransferForm((f) => ({ ...f, description: e.target.value }))
                  }
                  placeholder="e.g. Transfer to petty cash"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="transfer-date">Date</Label>
                <Input
                  id="transfer-date"
                  type="date"
                  value={transferForm.transfer_date}
                  onChange={(e) =>
                    setTransferForm((f) => ({ ...f, transfer_date: e.target.value }))
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTransferDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleTransferSubmit}
                disabled={!transferCanSubmit || transferSubmitting}
              >
                {transferSubmitting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                Create Transfer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-0 shadow-xl">
        <CardHeader>
          <CardTitle>Recent Journal Entries</CardTitle>
        </CardHeader>
        <CardContent>
          {journalEntries.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center">
              No journal entries yet. Create one to get started.
            </p>
          ) : (
            <div className="space-y-1">
              {journalEntries.map((entry) => {
                const expanded = expandedIds.has(entry.id)
                const total = getEntryTotal(entry)
                const lines = entry.journal_entry_lines || []

                return (
                  <div
                    key={entry.id}
                    className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden"
                  >
                    <button
                      type="button"
                      className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
                      onClick={() => toggleExpanded(entry.id)}
                    >
                      {expanded ? (
                        <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
                      )}
                      <span className="font-mono font-medium w-28 shrink-0">
                        {entry.entry_number}
                      </span>
                      <span className="text-muted-foreground shrink-0">
                        {entry.entry_date}
                      </span>
                      <span className="flex-1 truncate">{entry.description}</span>
                      <span className="font-semibold shrink-0">
                        {total.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </button>
                    {expanded && lines.length > 0 && (
                      <div className="border-t border-gray-200 dark:border-gray-800 bg-muted/30">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Account</TableHead>
                              <TableHead className="text-right">Debit</TableHead>
                              <TableHead className="text-right">Credit</TableHead>
                              <TableHead>Description</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {lines.map((line) => {
                              const acct = line.chart_of_accounts
                              const acctLabel = acct
                                ? `${acct.account_code} - ${acct.account_name}`
                                : "—"
                              return (
                                <TableRow key={line.id || Math.random()}>
                                  <TableCell className="font-medium">
                                    {acctLabel}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {(Number(line.debit_amount) || 0) > 0
                                      ? Number(line.debit_amount).toLocaleString(
                                          undefined,
                                          {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                          }
                                        )
                                      : "—"}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {(Number(line.credit_amount) || 0) > 0
                                      ? Number(line.credit_amount).toLocaleString(
                                          undefined,
                                          {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                          }
                                        )
                                      : "—"}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground">
                                    {line.description || "—"}
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
