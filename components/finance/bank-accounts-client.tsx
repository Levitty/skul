"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface BankAccountsClientProps {
  bankAccounts: any[]
}

export function BankAccountsClient({ bankAccounts }: BankAccountsClientProps) {
  if (bankAccounts.length === 0) {
    return (
      <Card className="border-0 shadow-xl">
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground mb-4">No bank accounts configured</p>
          <Button asChild>
            <Link href="/dashboard/accountant/finance/banking/new">Add Bank Account</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-0 shadow-xl">
      <CardHeader>
        <CardTitle>Bank Accounts</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {bankAccounts.map((account: any) => (
            <div key={account.id} className="p-4 rounded-lg border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold">{account.account_name}</h3>
                    {account.account_type && (
                      <Badge variant="outline">
                        {account.account_type}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {account.bank_name} • {account.account_number}
                  </p>
                  {account.chart_of_accounts && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Account: {account.chart_of_accounts.account_code} - {account.chart_of_accounts.account_name}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    KES {Number(account.current_balance).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Opening: KES {Number(account.opening_balance).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/dashboard/accountant/finance/bank-reconciliation?accountId=${account.id}`}>
                    Reconcile
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/dashboard/accountant/finance/banking/${account.id}/edit`}>
                    Edit
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}



