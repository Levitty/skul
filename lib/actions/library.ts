"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

const LIBRARY_PATH = "/dashboard/admin/library"

// --- Books ---

export async function getBooks(filters?: { category?: string; search?: string }) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated" }

  const context = await requireTenantContext(user.id)

  let query = supabase
    .from("library_books")
    .select("*")
    .eq("school_id", context.schoolId)

  if (filters?.category) {
    query = query.eq("category", filters.category)
  }

  if (filters?.search) {
    const pattern = `%${filters.search}%`
    query = query.or(`title.ilike.${pattern},isbn.ilike.${pattern}`)
  }

  const { data: books, error } = await query.order("title", { ascending: true })

  if (error) return { error: error.message }

  return { data: books }
}

export async function getBook(bookId: string) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated" }

  const context = await requireTenantContext(user.id)

  const { data: book, error } = await supabase
    .from("library_books")
    .select("*")
    .eq("id", bookId)
    .eq("school_id", context.schoolId)
    .single()

  if (error) return { error: error.message }

  return { data: book }
}

export type CreateBookData = {
  isbn?: string
  title: string
  author?: string
  publisher?: string
  category?: string
  subject_id?: string
  edition?: string
  publication_year?: number
  total_copies?: number
  shelf_location?: string
  description?: string
}

export async function createBook(data: CreateBookData) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated" }

  const context = await requireTenantContext(user.id)

  const totalCopies = data.total_copies ?? 1

  const { data: book, error } = await supabase
    .from("library_books")
    // @ts-ignore
    .insert({
      school_id: context.schoolId,
      isbn: data.isbn ?? null,
      title: data.title,
      author: data.author ?? null,
      publisher: data.publisher ?? null,
      category: data.category ?? "general",
      subject_id: data.subject_id ?? null,
      edition: data.edition ?? null,
      publication_year: data.publication_year ?? null,
      total_copies: totalCopies,
      available_copies: totalCopies,
      shelf_location: data.shelf_location ?? null,
      description: data.description ?? null,
    })
    .select()
    .single()

  if (error) return { error: error.message }

  revalidatePath(LIBRARY_PATH)
  return { data: book }
}

export async function updateBook(bookId: string, data: Partial<CreateBookData>) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated" }

  const context = await requireTenantContext(user.id)

  const { data: existing, error: fetchError } = await supabase
    .from("library_books")
    .select("school_id")
    .eq("id", bookId)
    .single()

  if (fetchError || !existing || (existing as any).school_id !== context.schoolId) {
    return { error: "Book not found or access denied" }
  }

  const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (data.isbn !== undefined) updatePayload.isbn = data.isbn
  if (data.title !== undefined) updatePayload.title = data.title
  if (data.author !== undefined) updatePayload.author = data.author
  if (data.publisher !== undefined) updatePayload.publisher = data.publisher
  if (data.category !== undefined) updatePayload.category = data.category
  if (data.subject_id !== undefined) updatePayload.subject_id = data.subject_id
  if (data.edition !== undefined) updatePayload.edition = data.edition
  if (data.publication_year !== undefined) updatePayload.publication_year = data.publication_year
  if (data.total_copies !== undefined) updatePayload.total_copies = data.total_copies
  if (data.shelf_location !== undefined) updatePayload.shelf_location = data.shelf_location
  if (data.description !== undefined) updatePayload.description = data.description

  const { data: book, error } = await supabase
    .from("library_books")
    // @ts-ignore
    .update(updatePayload)
    .eq("id", bookId)
    .eq("school_id", context.schoolId)
    .select()
    .single()

  if (error) return { error: error.message }

  revalidatePath(LIBRARY_PATH)
  return { data: book }
}

export async function deleteBook(bookId: string) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated" }

  const context = await requireTenantContext(user.id)

  const { error } = await supabase
    .from("library_books")
    .delete()
    .eq("id", bookId)
    .eq("school_id", context.schoolId)

  if (error) return { error: error.message }

  revalidatePath(LIBRARY_PATH)
  return { data: null }
}

// --- Transactions ---

export type IssueBookData = {
  book_id: string
  borrower_type: "student" | "teacher" | "staff"
  student_id?: string
  employee_id?: string
  due_date: string
  notes?: string
}

export async function issueBook(data: IssueBookData) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated" }

  const context = await requireTenantContext(user.id)

  if (data.borrower_type === "student" && !data.student_id) {
    return { error: "Student ID is required when borrower type is student" }
  }
  if ((data.borrower_type === "teacher" || data.borrower_type === "staff") && !data.employee_id) {
    return { error: "Employee ID is required when borrower type is teacher or staff" }
  }

  const today = new Date().toISOString().slice(0, 10)

  const { data: book, error: bookError } = await supabase
    .from("library_books")
    .select("id, school_id, available_copies")
    .eq("id", data.book_id)
    .eq("school_id", context.schoolId)
    .single()

  if (bookError || !book || (book as any).available_copies < 1) {
    return { error: "Book not found or no copies available" }
  }

  const { data: transaction, error: txError } = await supabase
    .from("library_transactions")
    // @ts-ignore
    .insert({
      school_id: context.schoolId,
      book_id: data.book_id,
      borrower_type: data.borrower_type,
      student_id: data.student_id ?? null,
      employee_id: data.employee_id ?? null,
      issue_date: today,
      due_date: data.due_date,
      status: "issued",
      notes: data.notes ?? null,
      issued_by: user.id,
    })
    .select()
    .single()

  if (txError) return { error: txError.message }

  const newAvailable = (book as any).available_copies - 1
  const { error: updateError } = await supabase
    .from("library_books")
    // @ts-ignore
    .update({ available_copies: newAvailable, updated_at: new Date().toISOString() })
    .eq("id", data.book_id)
    .eq("school_id", context.schoolId)

  if (updateError) {
    return { error: "Book issued but failed to update available copies: " + updateError.message }
  }

  revalidatePath(LIBRARY_PATH)
  return { data: transaction }
}

export async function returnBook(transactionId: string) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated" }

  const context = await requireTenantContext(user.id)

  const { data: tx, error: fetchError } = await supabase
    .from("library_transactions")
    .select("id, book_id, status")
    .eq("id", transactionId)
    .eq("school_id", context.schoolId)
    .single()

  if (fetchError || !tx) return { error: "Transaction not found" }
  if ((tx as any).status !== "issued" && (tx as any).status !== "overdue") {
    return { error: "Transaction is not in issued or overdue status" }
  }

  const today = new Date().toISOString().slice(0, 10)

  const { error: updateTxError } = await supabase
    .from("library_transactions")
    // @ts-ignore
    .update({ return_date: today, status: "returned" })
    .eq("id", transactionId)
    .eq("school_id", context.schoolId)

  if (updateTxError) return { error: updateTxError.message }

  const { data: book } = await supabase
    .from("library_books")
    .select("available_copies")
    .eq("id", (tx as any).book_id)
    .eq("school_id", context.schoolId)
    .single()

  if (book) {
    const newAvailable = (book as any).available_copies + 1
    await supabase
      .from("library_books")
      // @ts-ignore
      .update({ available_copies: newAvailable, updated_at: new Date().toISOString() })
      .eq("id", (tx as any).book_id)
      .eq("school_id", context.schoolId)
  }

  revalidatePath(LIBRARY_PATH)
  return { data: null }
}

export async function markBookLost(transactionId: string, fineAmount?: number) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated" }

  const context = await requireTenantContext(user.id)

  const updatePayload: Record<string, unknown> = { status: "lost" }
  if (fineAmount !== undefined) updatePayload.fine_amount = fineAmount

  const { data: tx, error: fetchError } = await supabase
    .from("library_transactions")
    .select("id, book_id, status")
    .eq("id", transactionId)
    .eq("school_id", context.schoolId)
    .single()

  if (fetchError || !tx) return { error: "Transaction not found" }

  if ((tx as any).status !== "issued" && (tx as any).status !== "overdue") {
    return { error: "Only issued or overdue transactions can be marked as lost" }
  }

  const { error: updateError } = await supabase
    .from("library_transactions")
    // @ts-ignore
    .update(updatePayload)
    .eq("id", transactionId)
    .eq("school_id", context.schoolId)

  if (updateError) return { error: updateError.message }

  const { data: book } = await supabase
    .from("library_books")
    .select("available_copies")
    .eq("id", (tx as any).book_id)
    .eq("school_id", context.schoolId)
    .single()

  if (book) {
    const newAvailable = (book as any).available_copies + 1
    await supabase
      .from("library_books")
      // @ts-ignore
      .update({ available_copies: newAvailable, updated_at: new Date().toISOString() })
      .eq("id", (tx as any).book_id)
      .eq("school_id", context.schoolId)
  }

  revalidatePath(LIBRARY_PATH)
  return { data: null }
}

export async function getTransactions(filters?: {
  status?: string
  student_id?: string
  book_id?: string
}) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated" }

  const context = await requireTenantContext(user.id)

  let query = supabase
    .from("library_transactions")
    .select(`
      *,
      library_books(title),
      students(first_name, last_name),
      employees(first_name, last_name)
    `)
    .eq("school_id", context.schoolId)

  if (filters?.status) query = query.eq("status", filters.status)
  if (filters?.student_id) query = query.eq("student_id", filters.student_id)
  if (filters?.book_id) query = query.eq("book_id", filters.book_id)

  const { data: transactions, error } = await query.order("created_at", { ascending: false })

  if (error) return { error: error.message }

  return { data: transactions }
}

export async function getOverdueBooks() {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: "Not authenticated" }

  const context = await requireTenantContext(user.id)

  const today = new Date().toISOString().slice(0, 10)

  const { data: transactions, error } = await supabase
    .from("library_transactions")
    .select(`
      *,
      library_books(title),
      students(first_name, last_name),
      employees(first_name, last_name)
    `)
    .eq("school_id", context.schoolId)
    .eq("status", "issued")
    .lt("due_date", today)
    .order("created_at", { ascending: false })

  if (error) return { error: error.message }

  return { data: transactions }
}
