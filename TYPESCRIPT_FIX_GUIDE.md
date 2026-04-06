# Step-by-Step Guide: Fixing TypeScript Errors with Supabase

## Overview
The TypeScript errors occur because Supabase queries return `never` types when TypeScript doesn't know the database schema. We'll generate proper types from your Supabase database.

---

## Step 1: Install Supabase CLI (if not already installed)

```bash
# Check if Supabase CLI is installed
supabase --version

# If not installed, install it:
npm install -g supabase

# Or use npx (no global install needed)
npx supabase --version
```

---

## Step 2: Link to Your Supabase Project

You have two options:

### Option A: Using Supabase Project Reference (Recommended for hosted projects)

1. Get your project reference ID from your Supabase dashboard:
   - Go to https://supabase.com/dashboard
   - Select your project
   - Go to Settings → API
   - Copy the "Project Reference ID" (not the API key)

2. Generate types using the project reference:

```bash
# Replace YOUR_PROJECT_REF with your actual project reference ID
npx supabase gen types typescript --project-id YOUR_PROJECT_REF > types/database.ts
```

### Option B: Using Local Development (if using Supabase locally)

If you're running Supabase locally:

```bash
# Start local Supabase (if not already running)
npx supabase start

# Generate types from local database
npx supabase gen types typescript --local > types/database.ts
```

---

## Step 3: Update Your Supabase Client Files

We need to ensure your Supabase clients use the Database type.

### 3.1: Update `lib/supabase/server.ts`

```typescript
import { createServerClient } from "@supabase/ssr"
import { Database } from "@/types/database"

export async function createClient() {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // ... rest of config
  )
}
```

### 3.2: Update `lib/supabase/client.ts`

```typescript
import { createBrowserClient } from "@supabase/ssr"
import { Database } from "@/types/database"

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

---

## Step 4: Verify Types Are Generated Correctly

After generating types, check that `types/database.ts` includes all your tables:

```bash
# Check if the file was created/updated
cat types/database.ts | head -100

# You should see tables like:
# - students
# - guardians
# - applications
# - invoices
# - payments
# - custom_roles
# - permissions
# etc.
```

---

## Step 5: Fix Type Assertions in Your Code

Some queries might need explicit type assertions. Here's how to fix common patterns:

### Pattern 1: Query Results

**Before:**
```typescript
const { data: students } = await supabase
  .from("students")
  .select("*")
// TypeScript doesn't know the shape of students
```

**After:**
```typescript
const { data: students, error } = await supabase
  .from("students")
  .select("*")
  .eq("school_id", context.schoolId)

// TypeScript now knows: students is Database['public']['Tables']['students']['Row'][]
if (error) {
  // handle error
}
```

### Pattern 2: Joined Queries

**Before:**
```typescript
const { data } = await supabase
  .from("students")
  .select("*, enrollments(*, classes(*))")
// TypeScript doesn't know nested structure
```

**After:**
```typescript
type StudentWithEnrollments = Database['public']['Tables']['students']['Row'] & {
  enrollments: Array<Database['public']['Tables']['enrollments']['Row'] & {
    classes: Database['public']['Tables']['classes']['Row']
  }>
}

const { data } = await supabase
  .from("students")
  .select("*, enrollments(*, classes(*))")
  .eq("school_id", context.schoolId)
  .returns<StudentWithEnrollments[]>()
```

### Pattern 3: Single Row Queries

**Before:**
```typescript
const { data: student } = await supabase
  .from("students")
  .select("*")
  .eq("id", id)
  .single()
// TypeScript might infer as never
```

**After:**
```typescript
const { data: student, error } = await supabase
  .from("students")
  .select("*")
  .eq("id", id)
  .single()

if (error || !student) {
  // handle error
  return
}

// Now TypeScript knows student is Database['public']['Tables']['students']['Row']
```

---

## Step 6: Add Type Helper Functions (Optional but Recommended)

Create a helper file for common type patterns:

```typescript
// lib/types/helpers.ts
import { Database } from "@/types/database"

export type Tables<T extends keyof Database['public']['Tables']> = 
  Database['public']['Tables'][T]['Row']

export type Inserts<T extends keyof Database['public']['Tables']> = 
  Database['public']['Tables'][T]['Insert']

export type Updates<T extends keyof Database['public']['Tables']> = 
  Database['public']['Tables'][T]['Update']

// Usage:
// type Student = Tables<'students'>
// type NewStudent = Inserts<'students'>
```

---

## Step 7: Run TypeScript Check

After making changes, verify types:

```bash
# Check for TypeScript errors
npx tsc --noEmit --skipLibCheck

# Or use Next.js build (which includes type checking)
npm run build
```

---

## Step 8: Common Issues and Solutions

### Issue 1: "Property 'X' does not exist on type 'never'"

**Solution:** The query result type isn't being inferred. Add explicit typing:

```typescript
const { data, error } = await supabase
  .from("students")
  .select("*")
  .eq("school_id", context.schoolId)

if (error || !data) {
  // handle
  return
}

// Now TypeScript knows data is an array
data.forEach(student => {
  console.log(student.first_name) // ✅ Works
})
```

### Issue 2: "Type 'X' is not assignable to type 'Y'"

**Solution:** Use type assertions for complex nested queries:

```typescript
const { data } = await supabase
  .from("students")
  .select(`
    *,
    enrollments(
      *,
      classes(*)
    )
  `)
  .eq("school_id", context.schoolId)

// Type assertion for complex nested structure
type StudentData = typeof data
```

### Issue 3: Next.js 15 params/searchParams are Promises

**Solution:** Already fixed in the code, but ensure all page components await params:

```typescript
// ✅ Correct (Next.js 15)
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ status?: string }>
}) {
  const { id } = await params
  const resolvedSearchParams = await searchParams
  // ...
}
```

---

## Step 9: Automate Type Generation (Optional)

Add a script to `package.json` to regenerate types easily:

```json
{
  "scripts": {
    "types:generate": "supabase gen types typescript --project-id YOUR_PROJECT_REF > types/database.ts",
    "types:generate:local": "supabase gen types typescript --local > types/database.ts"
  }
}
```

Then run:
```bash
npm run types:generate
```

---

## Step 10: Verify Everything Works

1. **Generate types:**
   ```bash
   npx supabase gen types typescript --project-id YOUR_PROJECT_REF > types/database.ts
   ```

2. **Update client files** (if needed - check Step 3)

3. **Run type check:**
   ```bash
   npx tsc --noEmit --skipLibCheck
   ```

4. **Build the project:**
   ```bash
   npm run build
   ```

---

## Quick Reference Commands

```bash
# 1. Generate types (replace YOUR_PROJECT_REF)
npx supabase gen types typescript --project-id YOUR_PROJECT_REF > types/database.ts

# 2. Check TypeScript errors
npx tsc --noEmit --skipLibCheck

# 3. Build project
npm run build

# 4. Run dev server
npm run dev
```

---

## Need Help?

If you encounter issues:

1. **Check Supabase CLI version:** `npx supabase --version`
2. **Verify project reference ID** in Supabase dashboard
3. **Check environment variables** are set correctly
4. **Ensure all migrations are applied** to your database
5. **Regenerate types** after any schema changes

---

## Next Steps After Fixing Types

1. ✅ All TypeScript errors resolved
2. ✅ Types are up-to-date with database schema
3. ✅ IntelliSense works in your IDE
4. ✅ Type safety for all database queries



