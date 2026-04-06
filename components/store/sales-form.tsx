"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { GlassCard } from "@/components/ui/glass-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { 
  ShoppingCart, 
  Plus, 
  Trash2, 
  Receipt,
  User,
  CreditCard
} from "lucide-react"
import { createSale } from "@/lib/actions/uniform-sales"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import Link from "next/link"

interface SalesFormProps {
  products: any[]
  students: Array<{ id: string; first_name: string; last_name: string; admission_number?: string | null }>
  branches: Array<{ id: string; name: string }>
  hasAllBranchesAccess: boolean
  currentBranchId: string | null
}

interface SaleItem {
  variant_id: string
  product_name: string
  variant_name: string
  size: string
  color: string
  quantity: number
  unit_price: number
  total_price: number
  stock_available: number
}

export function SalesForm({
  products,
  students,
  branches,
  hasAllBranchesAccess,
  currentBranchId,
}: SalesFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [saleItems, setSaleItems] = useState<SaleItem[]>([])
  const [selectedProductId, setSelectedProductId] = useState<string>("")
  const [selectedVariantId, setSelectedVariantId] = useState<string>("")
  const [quantity, setQuantity] = useState<string>("1")
  const [studentId, setStudentId] = useState<string>("")
  const [customerName, setCustomerName] = useState<string>("")
  const [customerPhone, setCustomerPhone] = useState<string>("")
  const [paymentMethod, setPaymentMethod] = useState<string>("cash")
  const [transactionRef, setTransactionRef] = useState<string>("")
  const [notes, setNotes] = useState<string>("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Get available variants for selected product
  const selectedProduct = products.find(p => p.id === selectedProductId)
  const availableVariants = selectedProduct?.uniform_variants?.filter((v: any) => v.is_active && v.stock_quantity > 0) || []
  const selectedVariant = availableVariants.find((v: any) => v.id === selectedVariantId)

  const addItem = () => {
    if (!selectedVariant || !selectedProduct) {
      toast({
        title: "Error",
        description: "Please select a product and variant",
        variant: "destructive",
      })
      return
    }

    const qty = parseInt(quantity)
    if (qty <= 0) {
      toast({
        title: "Error",
        description: "Quantity must be greater than 0",
        variant: "destructive",
      })
      return
    }

    if (qty > selectedVariant.stock_quantity) {
      toast({
        title: "Error",
        description: `Only ${selectedVariant.stock_quantity} units available in stock`,
        variant: "destructive",
      })
      return
    }

    // Check if variant already in cart
    const existingIndex = saleItems.findIndex(item => item.variant_id === selectedVariant.id)
    if (existingIndex >= 0) {
      const updated = [...saleItems]
      const newQty = updated[existingIndex].quantity + qty
      if (newQty > selectedVariant.stock_quantity) {
        toast({
          title: "Error",
          description: `Total quantity exceeds available stock`,
          variant: "destructive",
        })
        return
      }
      updated[existingIndex].quantity = newQty
      updated[existingIndex].total_price = updated[existingIndex].unit_price * newQty
      setSaleItems(updated)
    } else {
      const newItem: SaleItem = {
        variant_id: selectedVariant.id,
        product_name: selectedProduct.name,
        variant_name: `${selectedVariant.size} - ${selectedVariant.color}`,
        size: selectedVariant.size,
        color: selectedVariant.color,
        quantity: qty,
        unit_price: selectedVariant.price || selectedProduct.base_price,
        total_price: (selectedVariant.price || selectedProduct.base_price) * qty,
        stock_available: selectedVariant.stock_quantity,
      }
      setSaleItems([...saleItems, newItem])
    }

    // Reset form
    setSelectedVariantId("")
    setQuantity("1")
  }

  const removeItem = (index: number) => {
    setSaleItems(saleItems.filter((_, i) => i !== index))
  }

  const updateItemQuantity = (index: number, newQty: number) => {
    if (newQty <= 0) {
      removeItem(index)
      return
    }

    const item = saleItems[index]
    if (newQty > item.stock_available) {
      toast({
        title: "Error",
        description: `Only ${item.stock_available} units available`,
        variant: "destructive",
      })
      return
    }

    const updated = [...saleItems]
    updated[index].quantity = newQty
    updated[index].total_price = updated[index].unit_price * newQty
    setSaleItems(updated)
  }

  const totalAmount = saleItems.reduce((sum, item) => sum + item.total_price, 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (saleItems.length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one item to the sale",
        variant: "destructive",
      })
      return
    }

    if ((!studentId || studentId === "none") && !customerName) {
      toast({
        title: "Error",
        description: "Please select a student or enter customer name",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)

    try {
      const formData = new FormData()
      formData.append("items", JSON.stringify(saleItems.map(item => ({
        variant_id: item.variant_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
      }))))
      formData.append("student_id", studentId && studentId !== "none" ? studentId : "")
      formData.append("customer_name", customerName)
      formData.append("customer_phone", customerPhone)
      formData.append("payment_method", paymentMethod)
      formData.append("transaction_ref", transactionRef)
      formData.append("notes", notes)
      if (currentBranchId && !hasAllBranchesAccess) {
        formData.append("branch_id", currentBranchId)
      }

      const result = await createSale(formData)
      
      toast({
        title: "Success",
        description: "Sale recorded successfully",
      })

      // Redirect to receipt page
      router.push(`/dashboard/store/sales/${(result.data as any).id}/receipt`)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to record sale",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">
            New Sale
          </h1>
          <p className="text-neutral-500 mt-1">
            Record a uniform sale transaction
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/store/sales/history">
            View History
          </Link>
        </Button>
      </motion.div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column - Add Items */}
          <div className="lg:col-span-2 space-y-6">
            {/* Add Item Form */}
            <div className="border border-neutral-200 bg-white rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">Add Items</h2>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="product">Product</Label>
                  <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select product" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="variant">Variant</Label>
                  <Select 
                    value={selectedVariantId} 
                    onValueChange={setSelectedVariantId}
                    disabled={!selectedProductId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select variant" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableVariants.map((variant: any) => (
                        <SelectItem key={variant.id} value={variant.id}>
                          {variant.size} - {variant.color} ({variant.stock_quantity} in stock)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    id="quantity"
                    type="number"
                    min="1"
                    max={selectedVariant?.stock_quantity || 0}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    disabled={!selectedVariantId}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    onClick={addItem}
                    disabled={!selectedVariantId || !quantity}
                    className="w-full"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add
                  </Button>
                </div>
              </div>
              {selectedVariant && (
                <div className="mt-4 p-3 rounded-lg bg-neutral-50">
                  <p className="text-sm">
                    <span className="font-medium">Price:</span> KES {Number(selectedVariant.price || selectedProduct?.base_price).toLocaleString()} per unit
                  </p>
                  <p className="text-sm">
                    <span className="font-medium">Available:</span> {selectedVariant.stock_quantity} units
                  </p>
                </div>
              )}
            </div>

            {/* Sale Items */}
            {saleItems.length > 0 && (
              <div className="border border-neutral-200 bg-white rounded-lg p-6">
                <h2 className="text-lg font-semibold mb-4">Sale Items</h2>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Variant</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Unit Price</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {saleItems.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{item.product_name}</TableCell>
                        <TableCell>{item.variant_name}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="1"
                            max={item.stock_available}
                            value={item.quantity}
                            onChange={(e) => updateItemQuantity(index, parseInt(e.target.value) || 0)}
                            className="w-20"
                          />
                        </TableCell>
                        <TableCell>KES {item.unit_price.toLocaleString()}</TableCell>
                        <TableCell className="font-semibold">KES {item.total_price.toLocaleString()}</TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeItem(index)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="mt-4 flex justify-end">
                  <div className="text-right">
                    <p className="text-sm text-neutral-500">Total Amount</p>
                    <p className="text-2xl font-bold">KES {totalAmount.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Customer & Payment */}
          <div className="space-y-6">
            {/* Customer Info */}
            <div className="border border-neutral-200 bg-white rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <User className="w-5 h-5" />
                Customer Information
              </h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="student_id">Student (Optional)</Label>
                  <Select value={studentId} onValueChange={setStudentId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select student" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Walk-in Customer</SelectItem>
                      {students.map((student) => (
                        <SelectItem key={student.id} value={student.id}>
                          {student.first_name} {student.last_name} {student.admission_number ? `(${student.admission_number})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {!studentId && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="customer_name">Customer Name *</Label>
                      <Input
                        id="customer_name"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Enter customer name"
                        required={!studentId}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="customer_phone">Phone</Label>
                      <Input
                        id="customer_phone"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="Phone number"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Payment Info */}
            <div className="border border-neutral-200 bg-white rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Payment Information
              </h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="payment_method">Payment Method *</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod} required>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="mpesa">M-Pesa</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="paystack">Paystack</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="transaction_ref">Transaction Reference</Label>
                  <Input
                    id="transaction_ref"
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    placeholder="Optional reference number"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Input
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Additional notes"
                  />
                </div>
              </div>
            </div>

            {/* Total & Submit */}
            <div className="border border-neutral-200 bg-white rounded-lg p-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-semibold">Total Amount</span>
                  <span className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                    KES {totalAmount.toLocaleString()}
                  </span>
                </div>
                <Button
                  type="submit"
                  disabled={isSubmitting || saleItems.length === 0}
                  className="w-full bg-emerald-600 text-white"
                  size="lg"
                >
                  {isSubmitting ? (
                    "Processing..."
                  ) : (
                    <>
                      <Receipt className="w-5 h-5 mr-2" />
                      Complete Sale
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}

