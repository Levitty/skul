"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Printer, Download } from "lucide-react"
import { cn } from "@/lib/utils"
import { generateFeeStatementPDF, type StatementEntry, type FeeStatementPDFData } from "@/lib/services/fee-statement-pdf"

interface FeeStatementClientProps {
  student: { id: string; first_name: string; last_name: string; admission_number?: string }
  className?: string
  school: { name: string; address?: string; phone?: string; email?: string }
  entries: StatementEntry[]
  totalDebits: number
  totalCredits: number
  closingBalance: number
}

export function FeeStatementClient({
  student,
  className: studentClass,
  school,
  entries,
  totalDebits,
  totalCredits,
  closingBalance,
}: FeeStatementClientProps) {
  const handlePrint = () => {
    window.print()
  }

  const handleDownload = () => {
    const pdfData: FeeStatementPDFData = {
      schoolName: school.name,
      schoolAddress: school.address,
      schoolPhone: school.phone,
      schoolEmail: school.email,
      studentName: `${student.first_name} ${student.last_name}`,
      admissionNumber: student.admission_number,
      className: studentClass,
      entries,
      totalDebits,
      totalCredits,
      closingBalance,
      generatedDate: new Date().toLocaleDateString("en-KE"),
    }
    const doc = generateFeeStatementPDF(pdfData)
    doc.save(`Fee-Statement-${student.admission_number || student.id.slice(0, 8)}.pdf`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/dashboard/admin/students/${student.id}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Student
            </Button>
          </Link>
          <h1 className="mt-4 text-3xl font-bold">Fee Statement</h1>
          <p className="text-muted-foreground">
            {student.first_name} {student.last_name}
            {student.admission_number && ` (${student.admission_number})`}
            {studentClass && ` — ${studentClass}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
          <Button variant="outline" onClick={handleDownload}>
            <Download className="mr-2 h-4 w-4" />
            Download PDF
          </Button>
        </div>
      </div>

      <Card className="print:shadow-none print:border-0">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>{school.name}</CardTitle>
              {school.address && <p className="text-sm text-muted-foreground">{school.address}</p>}
            </div>
            <p className="text-sm text-muted-foreground">
              Generated: {new Date().toLocaleDateString("en-KE")}
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {entries.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b-2">
                    <th className="text-left py-2 px-3 font-semibold">Date</th>
                    <th className="text-left py-2 px-3 font-semibold">Description</th>
                    <th className="text-right py-2 px-3 font-semibold">Debit (KES)</th>
                    <th className="text-right py-2 px-3 font-semibold">Credit (KES)</th>
                    <th className="text-right py-2 px-3 font-semibold">Balance (KES)</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry, i) => (
                    <tr key={i} className="border-b">
                      <td className="py-2 px-3">{entry.date}</td>
                      <td className="py-2 px-3">{entry.description}</td>
                      <td className="text-right py-2 px-3 text-red-600">
                        {entry.debit > 0 ? entry.debit.toLocaleString() : ""}
                      </td>
                      <td className="text-right py-2 px-3 text-emerald-600">
                        {entry.credit > 0 ? entry.credit.toLocaleString() : ""}
                      </td>
                      <td className={cn(
                        "text-right py-2 px-3 font-medium",
                        entry.balance > 0 ? "text-red-600" : "text-emerald-600"
                      )}>
                        {entry.balance.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-bold">
                    <td className="py-2 px-3" colSpan={2}>Totals</td>
                    <td className="text-right py-2 px-3 text-red-600">{totalDebits.toLocaleString()}</td>
                    <td className="text-right py-2 px-3 text-emerald-600">{totalCredits.toLocaleString()}</td>
                    <td className={cn(
                      "text-right py-2 px-3",
                      closingBalance > 0 ? "text-red-600" : "text-emerald-600"
                    )}>
                      {closingBalance.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">No financial transactions found for this student.</p>
          )}

          <div className="mt-6 flex justify-end">
            <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border w-64">
              <p className="text-sm text-muted-foreground">Closing Balance</p>
              <p className={cn(
                "text-2xl font-bold",
                closingBalance > 0 ? "text-red-600" : "text-emerald-600"
              )}>
                KES {closingBalance.toLocaleString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
