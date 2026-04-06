"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { previewTermTransition, runTermTransition } from "@/lib/actions/term-transition"
import type { TermTransitionResult } from "@/lib/actions/term-transition"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ArrowRight, ArrowLeft, CheckCircle, AlertTriangle, Loader2, Calendar } from "lucide-react"

interface TermTransitionClientProps {
  terms: any[]
  classes: any[]
}

type Step = "select" | "preview" | "confirm" | "results"

// Matches the return type of previewTermTransition
interface PreviewData {
  term: {
    id: string
    name: string
    academicYear: string
    startDate: string
    endDate: string
    dueDate: string
  }
  currentTerm: {
    id: string
    name: string
    academicYear: string
  } | null
  classes: Array<{
    classId: string
    className: string
    totalStudents: number
    alreadyInvoiced: number
    pendingInvoice: number
    studentsWithOutstandingBalance: number
  }>
  totals: {
    totalClasses: number
    totalStudents: number
    alreadyInvoiced: number
    pendingInvoice: number
    studentsWithOutstandingBalance: number
  }
}

export function TermTransitionClient({ terms, classes }: TermTransitionClientProps) {
  const router = useRouter()
  const { toast } = useToast()

  const [currentStep, setCurrentStep] = useState<Step>("select")
  const [selectedTerm, setSelectedTerm] = useState<string>("")
  const [previewData, setPreviewData] = useState<PreviewData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [results, setResults] = useState<TermTransitionResult | null>(null)

  // Configuration options
  const [includeTransport, setIncludeTransport] = useState(true)
  const [includeBoarding, setIncludeBoarding] = useState(true)
  const [includeBalanceForward, setIncludeBalanceForward] = useState(true)
  const [selectedClasses, setSelectedClasses] = useState<string[]>(classes.map((c) => c.id))

  const handlePreviewTransition = async () => {
    if (!selectedTerm) {
      toast({ title: "Error", description: "Please select a term", variant: "destructive" })
      return
    }

    setIsLoading(true)
    try {
      const data = await previewTermTransition(selectedTerm)
      setPreviewData(data as PreviewData)
      setCurrentStep("preview")
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load preview",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleRunTransition = async () => {
    setIsLoading(true)
    try {
      const transitionResult = await runTermTransition({
        newTermId: selectedTerm,
        generateInvoices: true,
        includeTransport,
        includeBoarding,
        includeBalanceForward: includeBalanceForward,
        classIds: selectedClasses,
      })
      setResults(transitionResult)
      setCurrentStep("results")
      toast({ title: "Term transition completed" })
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to run transition",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDone = () => {
    router.push("/dashboard/accountant/fees")
    router.refresh()
  }

  const handleBack = () => {
    if (currentStep === "preview") {
      setCurrentStep("select")
      setPreviewData(null)
    } else if (currentStep === "confirm") {
      setCurrentStep("preview")
    }
  }

  const toggleClassSelection = (classId: string) => {
    setSelectedClasses((prev) =>
      prev.includes(classId) ? prev.filter((id) => id !== classId) : [...prev, classId]
    )
  }

  // Get the selected term display name
  const selectedTermObj = terms.find((t) => t.id === selectedTerm)
  const selectedTermLabel = selectedTermObj
    ? `${selectedTermObj.name}${selectedTermObj.academic_years?.name ? ` (${selectedTermObj.academic_years.name})` : ""}`
    : ""

  return (
    <div className="space-y-6">
      {/* Step 1: Select Term */}
      {currentStep === "select" && (
        <Card className="border border-neutral-200 bg-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-neutral-900">
              <Calendar className="h-5 w-5 text-neutral-600" />
              Select Term to Transition
            </CardTitle>
            <CardDescription className="text-neutral-500">
              Choose which term to move to. The system will show you a preview of what will happen before making any changes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700">Target Term</label>
              <Select value={selectedTerm} onValueChange={setSelectedTerm}>
                <SelectTrigger className="border-neutral-200 bg-white text-neutral-900">
                  <SelectValue placeholder="Select a term" />
                </SelectTrigger>
                <SelectContent>
                  {terms.map((term) => (
                    <SelectItem key={term.id} value={term.id}>
                      {term.name}
                      {term.academic_years?.name ? ` — ${term.academic_years.name}` : ""}
                      {term.is_current ? " (Current)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handlePreviewTransition}
              disabled={!selectedTerm || isLoading}
              className="w-full bg-neutral-900 text-white hover:bg-neutral-800"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading Preview...
                </>
              ) : (
                <>
                  Preview Transition
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Preview & Configure */}
      {currentStep === "preview" && previewData && (
        <div className="space-y-6">
          {/* Term comparison */}
          <Card className="border border-neutral-200 bg-white">
            <CardHeader>
              <CardTitle className="text-neutral-900">Term Transition Preview</CardTitle>
              <CardDescription className="text-neutral-500">
                Review the data that will be affected by this transition
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                <div>
                  <p className="text-xs font-medium uppercase text-neutral-500">Current Term</p>
                  <p className="text-lg font-semibold text-neutral-900">
                    {previewData.currentTerm?.name || "None set"}
                  </p>
                  {previewData.currentTerm?.academicYear && (
                    <p className="text-sm text-neutral-500">{previewData.currentTerm.academicYear}</p>
                  )}
                </div>
                <ArrowRight className="h-5 w-5 text-neutral-400" />
                <div className="text-right">
                  <p className="text-xs font-medium uppercase text-neutral-500">New Term</p>
                  <p className="text-lg font-semibold text-neutral-900">{previewData.term.name}</p>
                  {previewData.term.academicYear && (
                    <p className="text-sm text-neutral-500">{previewData.term.academicYear}</p>
                  )}
                </div>
              </div>

              {/* Summary stats */}
              <div className="grid grid-cols-4 gap-3">
                <div className="rounded-lg border border-neutral-200 p-3 text-center">
                  <p className="text-2xl font-bold text-neutral-900">{previewData.totals.totalStudents}</p>
                  <p className="text-xs text-neutral-500">Total Students</p>
                </div>
                <div className="rounded-lg border border-neutral-200 p-3 text-center">
                  <p className="text-2xl font-bold text-neutral-900">{previewData.totals.pendingInvoice}</p>
                  <p className="text-xs text-neutral-500">Need Invoices</p>
                </div>
                <div className="rounded-lg border border-neutral-200 p-3 text-center">
                  <p className="text-2xl font-bold text-neutral-900">{previewData.totals.alreadyInvoiced}</p>
                  <p className="text-xs text-neutral-500">Already Invoiced</p>
                </div>
                <div className="rounded-lg border border-neutral-200 p-3 text-center">
                  <p className="text-2xl font-bold text-neutral-900">{previewData.totals.studentsWithOutstandingBalance}</p>
                  <p className="text-xs text-neutral-500">With Balance</p>
                </div>
              </div>

              {/* Class details table */}
              <Table>
                <TableHeader>
                  <TableRow className="border-neutral-200 hover:bg-transparent">
                    <TableHead className="text-neutral-700">Class</TableHead>
                    <TableHead className="text-right text-neutral-700">Students</TableHead>
                    <TableHead className="text-right text-neutral-700">Invoiced</TableHead>
                    <TableHead className="text-right text-neutral-700">Pending</TableHead>
                    <TableHead className="text-right text-neutral-700">With Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData.classes.map((cls) => (
                    <TableRow key={cls.classId} className="border-neutral-200 hover:bg-neutral-50">
                      <TableCell className="font-medium text-neutral-900">{cls.className}</TableCell>
                      <TableCell className="text-right text-neutral-700">{cls.totalStudents}</TableCell>
                      <TableCell className="text-right text-neutral-700">{cls.alreadyInvoiced}</TableCell>
                      <TableCell className="text-right text-neutral-700">{cls.pendingInvoice}</TableCell>
                      <TableCell className="text-right text-neutral-700">{cls.studentsWithOutstandingBalance}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Configuration */}
          <Card className="border border-neutral-200 bg-white">
            <CardHeader>
              <CardTitle className="text-neutral-900">Invoice Settings</CardTitle>
              <CardDescription className="text-neutral-500">
                Configure what gets included in the new term invoices
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="transport"
                  checked={includeTransport}
                  onCheckedChange={(checked) => setIncludeTransport(checked === true)}
                  className="border-neutral-300"
                />
                <div>
                  <label htmlFor="transport" className="text-sm font-medium text-neutral-700">
                    Include transport fees
                  </label>
                  <p className="text-xs text-neutral-500">
                    Uses each student's assigned route and actual fee amount
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="boarding"
                  checked={includeBoarding}
                  onCheckedChange={(checked) => setIncludeBoarding(checked === true)}
                  className="border-neutral-300"
                />
                <label htmlFor="boarding" className="text-sm font-medium text-neutral-700">
                  Include boarding fees
                </label>
              </div>

              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="carryforward"
                    checked={includeBalanceForward}
                    onCheckedChange={(checked) => setIncludeBalanceForward(checked === true)}
                    className="mt-1 border-neutral-300"
                  />
                  <div className="space-y-1">
                    <label htmlFor="carryforward" className="text-sm font-medium text-neutral-700">
                      Carry forward outstanding balances
                    </label>
                    <p className="text-xs text-neutral-500">
                      Unpaid balances and overpayment credits from previous terms will be added as a
                      line item on each student's new invoice. This keeps the accounting clean —
                      you won't lose track of what's owed or credited.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Class selection */}
          <Card className="border border-neutral-200 bg-white">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-neutral-900">Select Classes</CardTitle>
                  <CardDescription className="text-neutral-500">
                    Choose which classes to generate invoices for
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-neutral-200 text-neutral-700"
                  onClick={() => {
                    if (selectedClasses.length === classes.length) {
                      setSelectedClasses([])
                    } else {
                      setSelectedClasses(classes.map((c) => c.id))
                    }
                  }}
                >
                  {selectedClasses.length === classes.length ? "Deselect All" : "Select All"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {classes.map((classItem) => (
                  <div
                    key={classItem.id}
                    className={`flex items-center space-x-2 rounded-lg border p-3 cursor-pointer transition-colors ${
                      selectedClasses.includes(classItem.id)
                        ? "border-neutral-400 bg-neutral-50"
                        : "border-neutral-200 bg-white"
                    }`}
                    onClick={() => toggleClassSelection(classItem.id)}
                  >
                    <Checkbox
                      checked={selectedClasses.includes(classItem.id)}
                      onCheckedChange={() => toggleClassSelection(classItem.id)}
                      className="border-neutral-300"
                    />
                    <label className="text-sm font-medium text-neutral-700 cursor-pointer">
                      {classItem.name}
                    </label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleBack}
              className="flex-1 border-neutral-200 text-neutral-900 hover:bg-neutral-50"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button
              onClick={() => setCurrentStep("confirm")}
              disabled={selectedClasses.length === 0}
              className="flex-1 bg-neutral-900 text-white hover:bg-neutral-800"
            >
              Continue to Confirmation
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Confirm & Run */}
      {currentStep === "confirm" && previewData && (
        <Card className="border border-neutral-200 bg-white">
          <CardHeader>
            <CardTitle className="text-neutral-900">Confirm Term Transition</CardTitle>
            <CardDescription className="text-neutral-500">
              Review your settings before starting
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-neutral-200 p-3">
                  <p className="text-xs font-medium uppercase text-neutral-500">FROM TERM</p>
                  <p className="mt-1 font-semibold text-neutral-900">
                    {previewData.currentTerm?.name || "None"}
                  </p>
                </div>
                <div className="rounded-lg border border-neutral-200 p-3">
                  <p className="text-xs font-medium uppercase text-neutral-500">TO TERM</p>
                  <p className="mt-1 font-semibold text-neutral-900">{previewData.term.name}</p>
                </div>
              </div>

              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 space-y-1">
                <p className="text-xs font-medium uppercase text-neutral-500">CONFIGURATION</p>
                <p className="text-sm text-neutral-700">
                  Transport Fees: <span className="font-medium">{includeTransport ? "Included" : "Not Included"}</span>
                </p>
                <p className="text-sm text-neutral-700">
                  Boarding Fees: <span className="font-medium">{includeBoarding ? "Included" : "Not Included"}</span>
                </p>
                <p className="text-sm text-neutral-700">
                  Balance Carry-Forward: <span className="font-medium">{includeBalanceForward ? "Yes" : "No"}</span>
                </p>
                <p className="text-sm text-neutral-700">
                  Classes: <span className="font-medium">{selectedClasses.length} of {classes.length} selected</span>
                </p>
              </div>

              <div className="flex items-start gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-neutral-600" />
                <p className="text-sm text-neutral-700">
                  This will set {previewData.term.name} as the active term and generate invoices for
                  all pending students in the selected classes. Existing invoices will not be affected.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={isLoading}
                className="flex-1 border-neutral-200 text-neutral-900 hover:bg-neutral-50"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={handleRunTransition}
                disabled={isLoading}
                className="flex-1 bg-neutral-900 text-white hover:bg-neutral-800"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Start Term Transition"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Results */}
      {currentStep === "results" && results && (
        <Card className="border border-neutral-200 bg-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-neutral-900">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
              Transition Complete
            </CardTitle>
            <CardDescription className="text-neutral-500">
              {selectedTermLabel} is now the active term
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {results.invoiceResults && (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-lg border border-neutral-200 p-4 text-center">
                    <p className="text-2xl font-bold text-neutral-900">{results.invoiceResults.totalStudents}</p>
                    <p className="text-xs text-neutral-500">Total Students</p>
                  </div>
                  <div className="rounded-lg border border-neutral-200 p-4 text-center">
                    <p className="text-2xl font-bold text-emerald-700">{results.invoiceResults.successCount}</p>
                    <p className="text-xs text-neutral-500">Invoices Created</p>
                  </div>
                  {results.invoiceResults.errorCount > 0 && (
                    <div className="rounded-lg border border-neutral-200 p-4 text-center">
                      <p className="text-2xl font-bold text-red-700">{results.invoiceResults.errorCount}</p>
                      <p className="text-xs text-neutral-500">Errors</p>
                    </div>
                  )}
                </div>

                {results.invoiceResults.errorCount > 0 && results.invoiceResults.errors.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-semibold text-neutral-900">Errors</h3>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-neutral-200 hover:bg-transparent">
                          <TableHead className="text-neutral-700">Class</TableHead>
                          <TableHead className="text-neutral-700">Error</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {results.invoiceResults.errors.map((err, idx) => (
                          <TableRow key={idx} className="border-neutral-200 hover:bg-neutral-50">
                            <TableCell className="font-medium text-neutral-900">{err.className}</TableCell>
                            <TableCell className="text-sm text-neutral-600">{err.error}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            )}

            <Button
              onClick={handleDone}
              className="w-full bg-neutral-900 text-white hover:bg-neutral-800"
            >
              Done
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
