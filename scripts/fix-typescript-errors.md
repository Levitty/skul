# TypeScript Error Fix Strategy

## Common Patterns to Fix

### Pattern 1: Query Results are `never`
**Problem:** `const { data } = await supabase.from("table").select().single()`
**Solution:** Add type assertion or null check

**Before:**
```typescript
const { data: student } = await supabase
  .from("students")
  .select("*")
  .eq("id", id)
  .single()

if (!student) return // TypeScript thinks student is never
console.log(student.first_name) // Error: Property doesn't exist
```

**After:**
```typescript
const { data: student, error } = await supabase
  .from("students")
  .select("*")
  .eq("id", id)
  .single()

if (error || !student) return
// Now TypeScript knows student exists
console.log(student.first_name) // ✅ Works
```

### Pattern 2: Array Filter/Map on `never`
**Problem:** `data?.filter(x => x.status === "active")`
**Solution:** Use nullish coalescing

**Before:**
```typescript
const { data } = await supabase.from("table").select()
const active = data?.filter(x => x.status === "active") // Error
```

**After:**
```typescript
const { data, error } = await supabase.from("table").select()
if (error) return
const dataList = data || []
const active = dataList.filter(x => x.status === "active") // ✅ Works
```

### Pattern 3: Nested Property Access
**Problem:** `data.students.first_name`
**Solution:** Type assertion or optional chaining with type guard

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
const invoice = data as any // Or use proper type
console.log(invoice.students?.first_name) // ✅ Works
```

## Files to Fix (Priority Order)

1. **High Priority (Core Functionality):**
   - `lib/actions/invoices.ts` (41 errors)
   - `lib/actions/payments.ts` (15 errors)
   - `lib/actions/students-enhanced.ts` (16 errors)
   - `lib/actions/admissions-convert.ts` (19 errors)

2. **Medium Priority (Pages):**
   - `app/(dashboard)/dashboard/admin/students/page.tsx` (14 errors) - FIXED
   - `app/(dashboard)/dashboard/parent/dashboard/page.tsx` (22 errors)
   - `app/(dashboard)/dashboard/page.tsx` (11 errors)

3. **Low Priority (Other):**
   - Various other action files
   - API routes
   - Components

## Quick Fix Template

For each file with errors:

1. Add error handling:
```typescript
const { data, error } = await supabase.from("table").select()
if (error) {
  console.error("Error:", error)
  return // or throw
}
```

2. Use nullish coalescing for arrays:
```typescript
const dataList = data || []
```

3. Add type assertions for complex queries:
```typescript
const result = data as Tables<'table_name'>
```

4. Use optional chaining for nested properties:
```typescript
const value = (data as any)?.nested?.property
```



