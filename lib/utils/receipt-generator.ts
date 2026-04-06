/**
 * Receipt Generation Utilities
 * Formats receipt data for display and printing
 */

export interface ReceiptData {
  sale: {
    sale_number: string
    sale_date: string
    total_amount: number
    payment_method: string
    transaction_ref?: string | null
    customer_name?: string | null
    customer_phone?: string | null
    student?: {
      first_name: string
      last_name: string
      admission_number?: string | null
    } | null
    sold_by?: {
      full_name?: string | null
    } | null
    items: Array<{
      quantity: number
      unit_price: number
      total_price: number
      uniform_variants: {
        size: string
        color: string
        uniform_products: {
          name: string
        }
      }
    }>
  }
  school: {
    name: string
    address?: string | null
    phone?: string | null
    email?: string | null
    logo_url?: string | null
  } | null
  receipt_number: string
}

/**
 * Format receipt number
 */
export function formatReceiptNumber(saleNumber: string): string {
  return `REC-${saleNumber}`
}

/**
 * Format currency
 */
export function formatCurrency(amount: number): string {
  return `KES ${amount.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * Format date for receipt
 */
export function formatReceiptDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString("en-KE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

/**
 * Get customer display name
 */
export function getCustomerDisplayName(receiptData: ReceiptData): string {
  if (receiptData.sale.student) {
    return `${receiptData.sale.student.first_name} ${receiptData.sale.student.last_name}${receiptData.sale.student.admission_number ? ` (${receiptData.sale.student.admission_number})` : ""}`
  }
  if (receiptData.sale.customer_name) {
    return receiptData.sale.customer_name
  }
  return "Walk-in Customer"
}

/**
 * Format payment method for display
 */
export function formatPaymentMethod(method: string): string {
  const methods: Record<string, string> = {
    cash: "Cash",
    bank_transfer: "Bank Transfer",
    mpesa: "M-Pesa",
    paystack: "Paystack",
    cheque: "Cheque",
    other: "Other",
  }
  return methods[method] || method
}

/**
 * Calculate receipt totals
 */
export function calculateReceiptTotals(items: ReceiptData["sale"]["items"]) {
  const subtotal = items.reduce((sum, item) => sum + item.total_price, 0)
  // Tax can be added here if needed
  const tax = 0
  const total = subtotal + tax

  return {
    subtotal,
    tax,
    total,
  }
}


