"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { GlassCard } from "@/components/ui/glass-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { 
  Plus, 
  Package, 
  Edit, 
  Trash2, 
  AlertTriangle,
  ShoppingBag,
  TrendingDown
} from "lucide-react"
import { 
  createUniformProduct, 
  updateUniformProduct, 
  deleteUniformProduct,
  createVariant,
  updateVariant,
  adjustStock
} from "@/lib/actions/uniform-inventory"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"

interface InventoryManagerProps {
  products: any[]
  lowStockItems: any[]
  branches: Array<{ id: string; name: string }>
  hasAllBranchesAccess: boolean
  currentBranchId: string | null
}

export function InventoryManager({
  products: initialProducts,
  lowStockItems,
  branches,
  hasAllBranchesAccess,
  currentBranchId,
}: InventoryManagerProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [products, setProducts] = useState(initialProducts)
  const [selectedProduct, setSelectedProduct] = useState<any>(null)
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false)
  const [isVariantDialogOpen, setIsVariantDialogOpen] = useState(false)
  const [isStockDialogOpen, setIsStockDialogOpen] = useState(false)
  const [selectedVariant, setSelectedVariant] = useState<any>(null)

  const handleCreateProduct = async (formData: FormData) => {
    try {
      const result = await createUniformProduct(formData)
      toast({
        title: "Success",
        description: "Product created successfully",
      })
      setIsProductDialogOpen(false)
      router.refresh()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    }
  }

  const handleUpdateProduct = async (productId: string, formData: FormData) => {
    try {
      await updateUniformProduct(productId, formData)
      toast({
        title: "Success",
        description: "Product updated successfully",
      })
      setIsProductDialogOpen(false)
      router.refresh()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    }
  }

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm("Are you sure you want to delete this product?")) return

    try {
      await deleteUniformProduct(productId)
      toast({
        title: "Success",
        description: "Product deleted successfully",
      })
      router.refresh()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    }
  }

  const handleCreateVariant = async (productId: string, formData: FormData) => {
    try {
      await createVariant(productId, formData)
      toast({
        title: "Success",
        description: "Variant created successfully",
      })
      setIsVariantDialogOpen(false)
      router.refresh()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    }
  }

  const handleAdjustStock = async (formData: FormData) => {
    try {
      await adjustStock(formData)
      toast({
        title: "Success",
        description: "Stock adjusted successfully",
      })
      setIsStockDialogOpen(false)
      router.refresh()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    }
  }

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">
            Uniform Inventory
          </h1>
          <p className="text-neutral-500 mt-1">
            Manage uniform products, variants, and stock levels
          </p>
        </div>
        <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-indigo-600 text-white">
              <Plus className="w-4 h-4 mr-2" />
              Add Product
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{selectedProduct ? "Edit Product" : "New Product"}</DialogTitle>
              <DialogDescription>
                {selectedProduct ? "Update product details" : "Add a new uniform product"}
              </DialogDescription>
            </DialogHeader>
            <ProductForm
              product={selectedProduct}
              branches={branches}
              onSubmit={selectedProduct 
                ? (formData) => handleUpdateProduct(selectedProduct.id, formData)
                : handleCreateProduct
              }
              onCancel={() => {
                setIsProductDialogOpen(false)
                setSelectedProduct(null)
              }}
            />
          </DialogContent>
        </Dialog>
      </motion.div>

      {/* Low Stock Alert */}
      {lowStockItems.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="border border-neutral-200 bg-white rounded-lg p-4 border-l-4 border-l-amber-500">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <div className="flex-1">
                <p className="font-semibold text-amber-600 dark:text-amber-400">
                  Low Stock Alert
                </p>
                <p className="text-sm text-neutral-500">
                  {lowStockItems.length} item{lowStockItems.length !== 1 ? "s" : ""} below reorder level
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Products List */}
      <div className="space-y-6">
        {products.map((product, index) => (
          <motion.div
            key={product.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <div className="border border-neutral-200 bg-white rounded-lg p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-semibold">{product.name}</h3>
                  {product.description && (
                    <p className="text-sm text-muted-foreground mt-1">{product.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline">{product.category}</Badge>
                    <span className="text-sm text-neutral-500">
                      Base Price: KES {Number(product.base_price).toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedProduct(product)
                      setIsProductDialogOpen(true)
                    }}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteProduct(product.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Variants Table */}
              <div className="mt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium">Variants</h4>
                  <Dialog open={isVariantDialogOpen && selectedProduct?.id === product.id} onOpenChange={(open) => {
                    setIsVariantDialogOpen(open)
                    if (!open) setSelectedProduct(null)
                  }}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedProduct(product)}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add Variant
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Variant</DialogTitle>
                        <DialogDescription>Add a size and color variant for {product.name}</DialogDescription>
                      </DialogHeader>
                      <VariantForm
                        productId={product.id}
                        basePrice={product.base_price}
                        onSubmit={handleCreateVariant}
                        onCancel={() => {
                          setIsVariantDialogOpen(false)
                          setSelectedProduct(null)
                        }}
                      />
                    </DialogContent>
                  </Dialog>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Size</TableHead>
                      <TableHead>Color</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {product.uniform_variants?.map((variant: any) => (
                      <TableRow key={variant.id}>
                        <TableCell className="font-medium">{variant.size}</TableCell>
                        <TableCell>{variant.color}</TableCell>
                        <TableCell className="text-neutral-500">{variant.sku || "-"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "font-semibold",
                              variant.stock_quantity <= variant.reorder_level && "text-amber-600",
                              variant.stock_quantity === 0 && "text-red-600"
                            )}>
                              {variant.stock_quantity}
                            </span>
                            {variant.stock_quantity <= variant.reorder_level && (
                              <TrendingDown className="w-4 h-4 text-amber-500" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>KES {Number(variant.price || product.base_price).toLocaleString()}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedVariant(variant)
                                setIsStockDialogOpen(true)
                              }}
                            >
                              Adjust Stock
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!product.uniform_variants || product.uniform_variants.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No variants added yet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </motion.div>
        ))}

        {products.length === 0 && (
          <div className="border border-neutral-200 bg-white rounded-lg p-12 text-center">
            <Package className="w-16 h-16 mx-auto mb-4 text-neutral-500" />
            <h3 className="text-lg font-semibold mb-2">No products yet</h3>
            <p className="text-neutral-500 mb-4">Get started by adding your first uniform product</p>
            <Button onClick={() => setIsProductDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Product
            </Button>
          </div>
        )}
      </div>

      {/* Stock Adjustment Dialog */}
      <Dialog open={isStockDialogOpen} onOpenChange={setIsStockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Stock</DialogTitle>
            <DialogDescription>Update stock quantity for this variant</DialogDescription>
          </DialogHeader>
          {selectedVariant && (
            <StockAdjustmentForm
              variant={selectedVariant}
              onSubmit={handleAdjustStock}
              onCancel={() => {
                setIsStockDialogOpen(false)
                setSelectedVariant(null)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ProductForm({ 
  product, 
  branches, 
  onSubmit, 
  onCancel 
}: { 
  product?: any
  branches: Array<{ id: string; name: string }>
  onSubmit: (formData: FormData) => void
  onCancel: () => void
}) {
  return (
    <form action={onSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Product Name *</Label>
          <Input
            id="name"
            name="name"
            defaultValue={product?.name}
            required
            placeholder="e.g., School Shirt"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="category">Category *</Label>
          <Select name="category" defaultValue={product?.category || "uniform"} required>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="uniform">Uniform</SelectItem>
              <SelectItem value="accessory">Accessory</SelectItem>
              <SelectItem value="sportswear">Sportswear</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="base_price">Base Price (KES) *</Label>
          <Input
            id="base_price"
            name="base_price"
            type="number"
            step="0.01"
            min="0"
            defaultValue={product?.base_price}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cost_price">Cost Price (KES)</Label>
          <Input
            id="cost_price"
            name="cost_price"
            type="number"
            step="0.01"
            min="0"
            defaultValue={product?.cost_price}
          />
        </div>
        {branches.length > 0 && (
          <div className="space-y-2">
            <Label htmlFor="branch_id">Branch</Label>
            <Select name="branch_id" defaultValue={product?.branch_id || "all"}>
              <SelectTrigger>
                <SelectValue placeholder="All branches" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            name="description"
            defaultValue={product?.description}
            placeholder="Product description"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="image_url">Image URL</Label>
          <Input
            id="image_url"
            name="image_url"
            type="url"
            defaultValue={product?.image_url}
            placeholder="https://..."
          />
        </div>
      </div>
      <div className="flex gap-3 justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Save Product</Button>
      </div>
    </form>
  )
}

function VariantForm({
  productId,
  basePrice,
  onSubmit,
  onCancel,
}: {
  productId: string
  basePrice: number
  onSubmit: (productId: string, formData: FormData) => void
  onCancel: () => void
}) {
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    await onSubmit(productId, formData)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="size">Size *</Label>
          <Select name="size" required>
            <SelectTrigger>
              <SelectValue placeholder="Select size" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="XS">XS</SelectItem>
              <SelectItem value="S">S</SelectItem>
              <SelectItem value="M">M</SelectItem>
              <SelectItem value="L">L</SelectItem>
              <SelectItem value="XL">XL</SelectItem>
              <SelectItem value="XXL">XXL</SelectItem>
              <SelectItem value="XXXL">XXXL</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="color">Color *</Label>
          <Input
            id="color"
            name="color"
            required
            placeholder="e.g., Navy Blue"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sku">SKU</Label>
          <Input
            id="sku"
            name="sku"
            placeholder="Product SKU"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="price">Price (KES)</Label>
          <Input
            id="price"
            name="price"
            type="number"
            step="0.01"
            min="0"
            defaultValue={basePrice}
            placeholder={basePrice.toString()}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="stock_quantity">Initial Stock</Label>
          <Input
            id="stock_quantity"
            name="stock_quantity"
            type="number"
            min="0"
            defaultValue="0"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="reorder_level">Reorder Level</Label>
          <Input
            id="reorder_level"
            name="reorder_level"
            type="number"
            min="0"
            defaultValue="10"
          />
        </div>
      </div>
      <div className="flex gap-3 justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Add Variant</Button>
      </div>
    </form>
  )
}

function StockAdjustmentForm({
  variant,
  onSubmit,
  onCancel,
}: {
  variant: any
  onSubmit: (formData: FormData) => void
  onCancel: () => void
}) {
  return (
    <form action={onSubmit} className="space-y-4">
      <div className="p-3 rounded-lg bg-neutral-50">
        <p className="text-sm font-medium">{variant.size} - {variant.color}</p>
        <p className="text-xs text-neutral-500">Current Stock: {variant.stock_quantity}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="adjustment_type">Adjustment Type *</Label>
        <Select name="adjustment_type" required>
          <SelectTrigger>
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="purchase">Purchase (Add Stock)</SelectItem>
            <SelectItem value="return">Return (Add Stock)</SelectItem>
            <SelectItem value="damaged">Damaged (Remove Stock)</SelectItem>
            <SelectItem value="adjustment">Manual Adjustment</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="quantity">Quantity *</Label>
        <Input
          id="quantity"
          name="quantity"
          type="number"
          required
          placeholder="Enter quantity"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="reason">Reason</Label>
        <Input
          id="reason"
          name="reason"
          placeholder="Optional reason for adjustment"
        />
      </div>
      <input type="hidden" name="variant_id" value={variant.id} />
      <div className="flex gap-3 justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Adjust Stock</Button>
      </div>
    </form>
  )
}

