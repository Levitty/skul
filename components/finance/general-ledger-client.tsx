"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface GeneralLedgerClientProps {
  entries: any[]
}

export function GeneralLedgerClient({ entries }: GeneralLedgerClientProps) {
  if (entries.length === 0) {
    return (
      <Card className="border-0 shadow-xl">
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No ledger entries found</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-0 shadow-xl">
      <CardHeader>
        <CardTitle>Ledger Entries</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="text-left p-3 text-sm font-semibold">Date</th>
                <th className="text-left p-3 text-sm font-semibold">Account</th>
                <th className="text-left p-3 text-sm font-semibold">Description</th>
                <th className="text-right p-3 text-sm font-semibold">Debit</th>
                <th className="text-right p-3 text-sm font-semibold">Credit</th>
                <th className="text-right p-3 text-sm font-semibold">Balance</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry: any) => (
                <tr key={entry.id} className="border-b border-gray-100 dark:border-gray-900 hover:bg-gray-50 dark:hover:bg-gray-900">
                  <td className="p-3 text-sm">
                    {new Date(entry.transaction_date).toLocaleDateString()}
                  </td>
                  <td className="p-3">
                    <div>
                      <p className="font-medium text-sm">
                        {entry.chart_of_accounts?.account_code} - {entry.chart_of_accounts?.account_name}
                      </p>
                      <Badge variant="outline" className="text-xs mt-1">
                        {entry.chart_of_accounts?.account_type}
                      </Badge>
                    </div>
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">
                    {entry.description}
                  </td>
                  <td className="p-3 text-right text-sm">
                    {Number(entry.debit_amount) > 0 ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        {Number(entry.debit_amount).toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="p-3 text-right text-sm">
                    {Number(entry.credit_amount) > 0 ? (
                      <span className="text-red-600 dark:text-red-400 font-medium">
                        {Number(entry.credit_amount).toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="p-3 text-right text-sm font-medium">
                    {Number(entry.balance).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}



