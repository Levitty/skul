"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  Plus, Pencil, Trash2, Search, BookOpen, BookCopy,
  ArrowLeftRight, RotateCcw, AlertTriangle, Library
} from "lucide-react"
import { createBook, updateBook, deleteBook, issueBook, returnBook, markBookLost } from "@/lib/actions/library"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"

interface BookData {
  id: string
  title: string
  author: string | null
  isbn: string | null
  category: string | null
  publisher: string | null
  edition: string | null
  total_copies: number
  available_copies: number
  shelf_location: string | null
  description: string | null
}

interface TransactionData {
  id: string
  book_id: string
  student_id: string | null
  employee_id: string | null
  borrower_type: string
  issue_date: string
  due_date: string
  return_date: string | null
  status: string
  notes: string | null
  library_books: { title: string } | null
  students: { first_name: string; last_name: string; admission_number: string } | null
  employees: { first_name: string; last_name: string } | null
}

interface StudentData {
  id: string
  first_name: string
  last_name: string
  admission_number: string
}

interface EmployeeData {
  id: string
  first_name: string
  last_name: string
  role: string
}

interface LibraryClientProps {
  initialBooks: BookData[]
  initialTransactions: TransactionData[]
  students: StudentData[]
  employees: EmployeeData[]
}

const BOOK_CATEGORIES = [
  "Fiction", "Non-Fiction", "Science", "Mathematics", "History",
  "Geography", "English", "Literature", "Computer Science", "Arts",
  "Music", "Religion", "Reference", "Encyclopedia", "Biography", "Other",
]

const emptyBookForm = {
  title: "",
  author: "",
  isbn: "",
  category: "",
  publisher: "",
  edition: "",
  total_copies: "1",
  shelf_location: "",
  description: "",
}

export function LibraryClient({ initialBooks, initialTransactions, students, employees }: LibraryClientProps) {
  const router = useRouter()
  const { toast } = useToast()

  const [activeTab, setActiveTab] = useState<"books" | "issues" | "history">("books")
  const [searchQuery, setSearchQuery] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  // Book form state
  const [isAddBookOpen, setIsAddBookOpen] = useState(false)
  const [editingBook, setEditingBook] = useState<BookData | null>(null)
  const [bookForm, setBookForm] = useState(emptyBookForm)

  // Issue form state
  const [isIssueOpen, setIsIssueOpen] = useState(false)
  const [issueForm, setIssueForm] = useState({
    book_id: "",
    borrower_type: "student",
    borrower_id: "",
    due_date: "",
    notes: "",
  })

  // Stats
  const totalBooks = initialBooks.reduce((sum, b) => sum + b.total_copies, 0)
  const availableBooks = initialBooks.reduce((sum, b) => sum + b.available_copies, 0)
  const issuedBooks = totalBooks - availableBooks

  const filteredBooks = initialBooks.filter((book) =>
    book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    book.author?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    book.isbn?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // ── Book CRUD ──

  const resetBookForm = () => setBookForm(emptyBookForm)

  const openEditBook = (book: BookData) => {
    setEditingBook(book)
    setBookForm({
      title: book.title,
      author: book.author || "",
      isbn: book.isbn || "",
      category: book.category || "",
      publisher: book.publisher || "",
      edition: book.edition || "",
      total_copies: String(book.total_copies),
      shelf_location: book.shelf_location || "",
      description: book.description || "",
    })
  }

  const handleSaveBook = async () => {
    if (!bookForm.title.trim()) return

    setIsLoading(true)
    const fd = new FormData()
    const bookData: Record<string, any> = {}
    Object.entries(bookForm).forEach(([k, v]) => {
      if (v) bookData[k] = v
    })
    if (bookData.total_copies) bookData.total_copies = Number(bookData.total_copies)
    if (bookData.publication_year) bookData.publication_year = Number(bookData.publication_year)

    const result = editingBook
      ? await updateBook(editingBook.id, bookData)
      : await createBook(bookData as any)

    setIsLoading(false)

    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    toast({ title: editingBook ? "Book updated" : "Book added" })
    setIsAddBookOpen(false)
    setEditingBook(null)
    resetBookForm()
    router.refresh()
  }

  const handleDeleteBook = async (bookId: string) => {
    if (!confirm("Delete this book? This cannot be undone.")) return

    const result = await deleteBook(bookId)
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }
    toast({ title: "Book deleted" })
    router.refresh()
  }

  // ── Issue / Return ──

  const openIssueDialog = (bookId?: string) => {
    setIssueForm({
      book_id: bookId || "",
      borrower_type: "student",
      borrower_id: "",
      due_date: "",
      notes: "",
    })
    setIsIssueOpen(true)
  }

  const handleIssueBook = async () => {
    if (!issueForm.book_id || !issueForm.borrower_id || !issueForm.due_date) {
      toast({ title: "Missing fields", description: "Book, borrower, and due date are required", variant: "destructive" })
      return
    }

    setIsLoading(true)
    const issueData: Record<string, any> = {
      book_id: issueForm.book_id,
      borrower_type: issueForm.borrower_type,
      due_date: issueForm.due_date,
      notes: issueForm.notes || undefined,
    }
    if (issueForm.borrower_type === "student") {
      issueData.student_id = issueForm.borrower_id
    } else {
      issueData.employee_id = issueForm.borrower_id
    }

    const result = await issueBook(issueData as any)
    setIsLoading(false)

    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    toast({ title: "Book issued successfully" })
    setIsIssueOpen(false)
    router.refresh()
  }

  const handleReturn = async (txId: string) => {
    setIsLoading(true)
    const result = await returnBook(txId)
    setIsLoading(false)

    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }
    toast({ title: "Book returned" })
    router.refresh()
  }

  const handleMarkLost = async (txId: string) => {
    if (!confirm("Mark this book as lost? This will reduce the total copy count.")) return

    setIsLoading(true)
    const result = await markBookLost(txId)
    setIsLoading(false)

    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }
    toast({ title: "Book marked as lost" })
    router.refresh()
  }

  const getDaysOverdue = (dueDate: string) => {
    const due = new Date(dueDate)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    due.setHours(0, 0, 0, 0)
    const diff = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
    return diff > 0 ? diff : 0
  }

  const getBorrowerName = (tx: TransactionData) => {
    if (tx.borrower_type === "student" && tx.students) {
      return `${tx.students.first_name} ${tx.students.last_name} (${tx.students.admission_number})`
    }
    if (tx.employees) {
      return `${tx.employees.first_name} ${tx.employees.last_name}`
    }
    return "Unknown"
  }

  // ── Tab buttons ──

  const tabs = [
    { key: "books" as const, label: "Books", icon: BookOpen },
    { key: "issues" as const, label: "Active Issues", icon: ArrowLeftRight },
    { key: "history" as const, label: "History", icon: RotateCcw },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-neutral-900 mb-2">
            Library Management
          </h1>
          <p className="text-lg text-neutral-500">
            Manage books, issue tracking, and returns
          </p>
        </div>
      </div>

      {/* Stats */}
      <Card className="border-0 shadow-sm bg-amber-600 text-white">
        <CardContent className="p-6">
          <div className="grid grid-cols-3 gap-6">
            <div className="text-center">
              <Library className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold">{totalBooks}</p>
              <p className="text-white/70 text-sm">Total Books</p>
            </div>
            <div className="text-center">
              <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold">{availableBooks}</p>
              <p className="text-white/70 text-sm">Available</p>
            </div>
            <div className="text-center">
              <BookCopy className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold">{issuedBooks}</p>
              <p className="text-white/70 text-sm">Issued</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-neutral-900 text-white shadow-sm"
                : "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.key === "issues" && initialTransactions.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                {initialTransactions.length}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {/* ════════════════ BOOKS TAB ════════════════ */}
      {activeTab === "books" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
              <Input
                placeholder="Search by title, author, or ISBN..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => openIssueDialog()} variant="outline">
                <ArrowLeftRight className="mr-2 h-4 w-4" />
                Issue Book
              </Button>
              <Button onClick={() => { resetBookForm(); setIsAddBookOpen(true) }}>
                <Plus className="mr-2 h-4 w-4" />
                Add Book
              </Button>
            </div>
          </div>

          {filteredBooks.length === 0 ? (
            <Card className="border-0 shadow-xl">
              <CardContent className="py-12 text-center text-neutral-500">
                <BookOpen className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>{searchQuery ? "No books match your search." : "No books yet. Add your first book."}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredBooks.map((book) => (
                <Card key={book.id} className="border-0 shadow-xl hover:shadow-2xl transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base truncate">{book.title}</CardTitle>
                        <CardDescription className="truncate">
                          {book.author || "Unknown author"}
                        </CardDescription>
                      </div>
                      <Badge
                        variant={book.available_copies > 0 ? "default" : "destructive"}
                        className="ml-2 shrink-0"
                      >
                        {book.available_copies}/{book.total_copies}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {book.category && (
                        <div>
                          <span className="text-neutral-500">Category:</span>{" "}
                          <span className="font-medium">{book.category}</span>
                        </div>
                      )}
                      {book.isbn && (
                        <div>
                          <span className="text-neutral-500">ISBN:</span>{" "}
                          <span className="font-medium">{book.isbn}</span>
                        </div>
                      )}
                      {book.shelf_location && (
                        <div className="col-span-2">
                          <span className="text-neutral-500">Shelf:</span>{" "}
                          <span className="font-medium">{book.shelf_location}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditBook(book)}
                      >
                        <Pencil className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openIssueDialog(book.id)}
                        disabled={book.available_copies < 1}
                      >
                        <ArrowLeftRight className="h-3 w-3 mr-1" />
                        Issue
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteBook(book.id)}
                        className="ml-auto text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════ ACTIVE ISSUES TAB ════════════════ */}
      {activeTab === "issues" && (
        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle>Active Issues</CardTitle>
            <CardDescription>
              {initialTransactions.length} book{initialTransactions.length !== 1 && "s"} currently issued
            </CardDescription>
          </CardHeader>
          <CardContent>
            {initialTransactions.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <BookCopy className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>No books currently issued.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Book</TableHead>
                    <TableHead>Borrower</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Issue Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Overdue</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {initialTransactions.map((tx) => {
                    const overdue = getDaysOverdue(tx.due_date)
                    return (
                      <TableRow key={tx.id}>
                        <TableCell className="font-medium">
                          {tx.library_books?.title || "Unknown"}
                        </TableCell>
                        <TableCell>{getBorrowerName(tx)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {tx.borrower_type}
                          </Badge>
                        </TableCell>
                        <TableCell>{new Date(tx.issue_date).toLocaleDateString()}</TableCell>
                        <TableCell>{new Date(tx.due_date).toLocaleDateString()}</TableCell>
                        <TableCell>
                          {overdue > 0 ? (
                            <span className="text-red-600 font-semibold flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              {overdue} day{overdue !== 1 && "s"}
                            </span>
                          ) : (
                            <span className="text-green-600">On time</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleReturn(tx.id)}
                              disabled={isLoading}
                            >
                              <RotateCcw className="h-3 w-3 mr-1" />
                              Return
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleMarkLost(tx.id)}
                              disabled={isLoading}
                            >
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Lost
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* ════════════════ HISTORY TAB (placeholder) ════════════════ */}
      {activeTab === "history" && (
        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle>Transaction History</CardTitle>
            <CardDescription>View past library transactions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="py-12 text-center text-muted-foreground">
              <RotateCcw className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>Transaction history will appear here once books are returned.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ════════════════ ADD / EDIT BOOK DIALOG ════════════════ */}
      <Dialog
        open={isAddBookOpen || !!editingBook}
        onOpenChange={(open) => {
          if (!open) {
            setIsAddBookOpen(false)
            setEditingBook(null)
            resetBookForm()
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingBook ? "Edit Book" : "Add Book"}</DialogTitle>
            <DialogDescription>
              {editingBook ? "Update book details" : "Add a new book to the library"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input
                  value={bookForm.title}
                  onChange={(e) => setBookForm({ ...bookForm, title: e.target.value })}
                  placeholder="Book title"
                />
              </div>
              <div className="space-y-2">
                <Label>Author</Label>
                <Input
                  value={bookForm.author}
                  onChange={(e) => setBookForm({ ...bookForm, author: e.target.value })}
                  placeholder="Author name"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>ISBN</Label>
                <Input
                  value={bookForm.isbn}
                  onChange={(e) => setBookForm({ ...bookForm, isbn: e.target.value })}
                  placeholder="ISBN number"
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={bookForm.category}
                  onValueChange={(v) => setBookForm({ ...bookForm, category: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {BOOK_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Publisher</Label>
                <Input
                  value={bookForm.publisher}
                  onChange={(e) => setBookForm({ ...bookForm, publisher: e.target.value })}
                  placeholder="Publisher"
                />
              </div>
              <div className="space-y-2">
                <Label>Edition</Label>
                <Input
                  value={bookForm.edition}
                  onChange={(e) => setBookForm({ ...bookForm, edition: e.target.value })}
                  placeholder="e.g. 3rd"
                />
              </div>
              <div className="space-y-2">
                <Label>Total Copies</Label>
                <Input
                  type="number"
                  min="1"
                  value={bookForm.total_copies}
                  onChange={(e) => setBookForm({ ...bookForm, total_copies: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Shelf Location</Label>
              <Input
                value={bookForm.shelf_location}
                onChange={(e) => setBookForm({ ...bookForm, shelf_location: e.target.value })}
                placeholder="e.g. A-3-12"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={bookForm.description}
                onChange={(e) => setBookForm({ ...bookForm, description: e.target.value })}
                placeholder="Brief description"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setIsAddBookOpen(false); setEditingBook(null); resetBookForm() }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveBook}
              disabled={isLoading || !bookForm.title.trim()}
            >
              {isLoading ? "Saving..." : editingBook ? "Save Changes" : "Add Book"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════ ISSUE BOOK DIALOG ════════════════ */}
      <Dialog open={isIssueOpen} onOpenChange={setIsIssueOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Issue Book</DialogTitle>
            <DialogDescription>Issue a book to a student or staff member</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Book *</Label>
              <Select
                value={issueForm.book_id}
                onValueChange={(v) => setIssueForm({ ...issueForm, book_id: v })}
              >
                <SelectTrigger><SelectValue placeholder="Select a book" /></SelectTrigger>
                <SelectContent>
                  {initialBooks
                    .filter((b) => b.available_copies > 0)
                    .map((book) => (
                      <SelectItem key={book.id} value={book.id}>
                        {book.title} ({book.available_copies} available)
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Borrower Type *</Label>
              <div className="flex gap-4">
                {(["student", "teacher", "staff"] as const).map((type) => (
                  <label key={type} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="borrower_type"
                      value={type}
                      checked={issueForm.borrower_type === type}
                      onChange={(e) =>
                        setIssueForm({ ...issueForm, borrower_type: e.target.value, borrower_id: "" })
                      }
                      className="accent-primary"
                    />
                    <span className="text-sm capitalize">{type}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Borrower *</Label>
              {issueForm.borrower_type === "student" ? (
                <Select
                  value={issueForm.borrower_id}
                  onValueChange={(v) => setIssueForm({ ...issueForm, borrower_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                  <SelectContent>
                    {students.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.first_name} {s.last_name} ({s.admission_number})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select
                  value={issueForm.borrower_id}
                  onValueChange={(v) => setIssueForm({ ...issueForm, borrower_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.first_name} {e.last_name} ({e.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label>Due Date *</Label>
              <Input
                type="date"
                value={issueForm.due_date}
                onChange={(e) => setIssueForm({ ...issueForm, due_date: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={issueForm.notes}
                onChange={(e) => setIssueForm({ ...issueForm, notes: e.target.value })}
                placeholder="Optional notes"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsIssueOpen(false)}>Cancel</Button>
            <Button
              onClick={handleIssueBook}
              disabled={isLoading || !issueForm.book_id || !issueForm.borrower_id || !issueForm.due_date}
            >
              {isLoading ? "Issuing..." : "Issue Book"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
