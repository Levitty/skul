# TypeScript Error Fix Pattern

## Quick Fix Template for All Files

### Pattern 1: Single Row Queries (`.single()`)

**Before (causes `never` type):**
```typescript
const { data: item } = await supabase
  .from("table")
  .select("*")
  .eq("id", id)
  .single()

if (!item) return // TypeScript error
console.log(item.field) // Error: Property doesn't exist
```

**After (fixed):**
```typescript
const { data: item, error } = await supabase
  .from("table")
  .select("*")
  .eq("id", id)
  .single()

if (error || !item) return // ✅ Works
console.log(item.field) // ✅ Works (use `as any` if needed)
```

### Pattern 2: Array Queries

**Before:**
```typescript
const { data } = await supabase.from("table").select()
const filtered = data?.filter(x => x.status === "active") // Error
```

**After:**
```typescript
const { data, error } = await supabase.from("table").select()
if (error) return
const dataList = data || []
const filtered = dataList.filter((x: any) => x.status === "active") // ✅ Works
```

### Pattern 3: Nested Queries with Joins

**Before:**
```typescript
const { data } = await supabase
  .from("invoices")
  .select("*, students(*)")
  .single()
console.log(data.students.first_name) // Error
```

**After:**
```typescript
const { data, error } = await supabase
  .from("invoices")
  .select("*, students(*)")
  .single()

if (error || !data) return
const invoice = data as any
console.log(invoice.students?.first_name) // ✅ Works
```

### Pattern 4: Property Access on Query Results

**Before:**
```typescript
const { data: term } = await supabase.from("terms").select("*, academic_years(*)").single()
console.log(term.academic_years.name) // Error
```

**After:**
```typescript
const { data: term, error } = await supabase.from("terms").select("*, academic_years(*)").single()
if (error || !term) return
const termData = term as any
console.log(termData.academic_years?.name) // ✅ Works
```

## Files That Need Fixing (Priority Order)

### High Priority (Core Actions - 41+ errors each)
1. ✅ `lib/actions/invoices.ts` - PARTIALLY FIXED
2. `lib/actions/payments.ts` (15 errors)
3. `lib/actions/students-enhanced.ts` (16 errors)
4. `lib/actions/admissions-convert.ts` (19 errors)

### Medium Priority (Other Actions)
5. `lib/actions/guardians.ts` (10 errors)
6. `lib/actions/enrollments.ts` (8 errors)
7. `lib/actions/emergency-contacts.ts` (9 errors)
8. `lib/actions/inquiries.ts` (11 errors)
9. `lib/actions/fee-structures.ts` (5 errors)

### Lower Priority (Pages)
10. `app/(dashboard)/dashboard/parent/dashboard/page.tsx` (22 errors)
11. `app/(dashboard)/dashboard/page.tsx` (11 errors)
12. `app/(dashboard)/dashboard/admin/students/[id]/page.tsx` (7 errors)
13. `app/(dashboard)/dashboard/admin/students/transfers/page.tsx` (16 errors)

## Automated Fix Script

You can use find/replace in your editor:

**Find:**
```typescript
const { data: (\w+) } = await supabase
```

**Replace with:**
```typescript
const { data: $1, error: $1Error } = await supabase
```

Then add error checks:
```typescript
if ($1Error || !$1) {
  // handle error
}
```

## Next Steps

1. Apply the pattern to `lib/actions/payments.ts`
2. Apply the pattern to `lib/actions/students-enhanced.ts`
3. Apply the pattern to remaining action files
4. Fix page components
5. Fix API routes

The key is: **Always destructure both `data` and `error`, check errors first, use `as any` for complex nested types when needed.**



