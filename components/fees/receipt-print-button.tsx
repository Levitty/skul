"use client"

import { Button } from "@/components/ui/button"
import { Printer } from "lucide-react"

export function ReceiptPrintButton() {
  return (
    <Button variant="outline" onClick={() => window.print()}>
      <Printer className="mr-2 h-4 w-4" />
      Print
    </Button>
  )
}
