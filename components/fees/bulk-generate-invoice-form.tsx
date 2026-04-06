"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { bulkGenerateInvoices } from "@/lib/actions/invoices"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import Link from "next/link"
import { ArrowLeft, Bus } from "lucide-react"

interface BulkGenerateInvoiceFormProps {
  classes: any[]
  terms: any[]
  transportRoutes?: any[]
}

export function BulkGenerateInvoiceForm({ classes, terms, transportRoutes = [] }: BulkGenerateInvoiceFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const [formData, setFormData] = useState({
    class_id: "",
    term_id: "",
    includeBoarding: false,
    includeTransport: false,
    transportRouteId: "",
    includeBalanceForward: true,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const result = await bulkGenerateInvoices(formData.class_id, formData.term_id, {
        includeBoarding: formData.includeBoarding,
        includeTransport: formData.includeTransport,
        skipBalanceForward: !formData.includeBalanceForward,
      })

      toast({
        title: "Bulk Generation Complete!",
        description: `Generated ${result.success.length} invoices for ${result.totalStudents} students. ${result.errors.length > 0 ? `${result.errors.length} errors occurred.` : ""}`,
      })

      router.push("/dashboard/accountant/fees")
      router.refresh()
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to generate invoices",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/accountant/fees">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Fees
          </Button>
        </Link>
        <h1 className="mt-4 text-3xl font-bold">Bulk Generate Invoices</h1>
        <p className="text-muted-foreground">
          Generate invoices for all students in a class for a term
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>Bulk Invoice Generation</CardTitle>
            <CardDescription>
              Generate invoices for all active students in a class
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="class_id">Class *</Label>
                <Select
                  value={formData.class_id}
                  onValueChange={(value) =>
                    setFormData({ ...formData, class_id: value })
                  }
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select class" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="term_id">Term *</Label>
                <Select
                  value={formData.term_id}
                  onValueChange={(value) =>
                    setFormData({ ...formData, term_id: value })
                  }
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select term" />
                  </SelectTrigger>
                  <SelectContent>
                    {terms.map((term) => (
                      <SelectItem key={term.id} value={term.id}>
                        {term.name} {term.due_date && `(Due: ${new Date(term.due_date).toLocaleDateString()})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border-t pt-4 space-y-3">
              <h3 className="font-semibold">Optional Services</h3>
              <p className="text-sm text-muted-foreground">
                These will be included for students who have boarding/transport enabled
              </p>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includeBoarding"
                  checked={formData.includeBoarding}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, includeBoarding: checked as boolean })
                  }
                />
                <Label htmlFor="includeBoarding" className="cursor-pointer">
                  Include Boarding Fee (for students with boarding enabled)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includeTransport"
                  checked={formData.includeTransport}
                  onCheckedChange={(checked) =>
                    setFormData({
                      ...formData,
                      includeTransport: checked as boolean,
                      transportRouteId: checked ? formData.transportRouteId : "",
                    })
                  }
                />
                <Label htmlFor="includeTransport" className="cursor-pointer">
                  Include Transport Fee (for students with transport enabled)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includeBalanceForward"
                  checked={formData.includeBalanceForward}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, includeBalanceForward: checked as boolean })
                  }
                />
                <Label htmlFor="includeBalanceForward" className="cursor-pointer">
                  Carry forward outstanding balances from previous terms
                </Label>
              </div>

              {formData.includeTransport && (
                <div className="ml-6 space-y-2">
                  <Label htmlFor="transport_route" className="flex items-center gap-2">
                    <Bus className="w-4 h-4" />
                    Transport Route Settings
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Transport fees now automatically use each student's assigned route. This setting applies only to students without an assigned route.
                  </p>
                  {transportRoutes.length > 0 ? (
                    <Select
                      value={formData.transportRouteId}
                      onValueChange={(value) => setFormData({ ...formData, transportRouteId: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a default transport route" />
                      </SelectTrigger>
                      <SelectContent>
                        {transportRoutes.map((route: any) => (
                          <SelectItem key={route.id} value={route.id}>
                            {route.name}
                            {route.route_number ? ` (${route.route_number})` : ""}
                            {route.start_location && route.end_location
                              ? ` — ${route.start_location} → ${route.end_location}`
                              : ""}
                            {route.fee_amount > 0 ? ` • KES ${Number(route.fee_amount).toLocaleString()}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      No transport routes configured. Go to Transport &gt; Routes to add routes.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-400 mb-1">
                Important
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                This will generate invoices for all active students in the selected class. 
                If an invoice already exists for a student and term, it will be skipped.
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Link href="/dashboard/accountant/fees">
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Link>
            <Button type="submit" disabled={loading || !formData.class_id || !formData.term_id}>
              {loading ? "Generating..." : "Generate Invoices"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}




