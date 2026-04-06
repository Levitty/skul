"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface ChartOfAccountsClientProps {
  accounts: any[]
}

export function ChartOfAccountsClient({ accounts }: ChartOfAccountsClientProps) {
  // Group accounts by type
  const accountsByType: Record<string, any[]> = {
    asset: [],
    liability: [],
    equity: [],
    revenue: [],
    expense: [],
  }

  accounts.forEach((account) => {
    const type = account.account_type
    if (accountsByType[type]) {
      accountsByType[type].push(account)
    }
  })

  const typeLabels: Record<string, string> = {
    asset: "Assets",
    liability: "Liabilities",
    equity: "Equity",
    revenue: "Revenue",
    expense: "Expenses",
  }

  const typeColors: Record<string, string> = {
    asset: "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200",
    liability: "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200",
    equity: "bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200",
    revenue: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200",
    expense: "bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200",
  }

  return (
    <div className="space-y-6">
      {Object.entries(accountsByType).map(([type, typeAccounts]) => {
        if (typeAccounts.length === 0) return null

        return (
          <Card key={type} className="border-0 shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Badge className={typeColors[type]}>
                  {typeLabels[type]}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {typeAccounts.length} accounts
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {typeAccounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="font-mono text-sm font-semibold text-muted-foreground w-20">
                        {account.account_code}
                      </div>
                      <div>
                        <p className="font-medium">{account.account_name}</p>
                        {account.description && (
                          <p className="text-sm text-muted-foreground">{account.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {account.account_type === "revenue" && account.account_code >= "4000" && account.account_code < "4600" && (
                        <Badge variant="outline" className="bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
                          PRIMARY
                        </Badge>
                      )}
                      {account.account_type === "revenue" && account.account_code >= "4600" && (
                        <Badge variant="outline" className="bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800">
                          SECONDARY
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}



