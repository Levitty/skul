# Quick Fix: TypeScript Errors with Supabase

## 🚀 Quick Start (3 Steps)

### Step 1: Get Your Project Reference ID
1. Go to https://supabase.com/dashboard
2. Select your project
3. Settings → API
4. Copy **"Project Reference ID"** (looks like: `abcdefghijklmnop`)

### Step 2: Generate Types

**Option A: Using the script (Recommended)**
```bash
./scripts/generate-types.sh YOUR_PROJECT_REF
```

**Option B: Using npx directly**
```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_REF > types/database.ts
```

**Option C: Using npm script (after setting env var)**
```bash
export SUPABASE_PROJECT_REF=your-project-ref
npm run types:generate
```

### Step 3: Verify It Works
```bash
# Check for TypeScript errors
npm run types:check

# Or build the project
npm run build
```

---

## ✅ That's It!

Your TypeScript errors should now be resolved. The generated `types/database.ts` file contains all the type definitions for your database tables.

---

## 🔧 Troubleshooting

### "Command not found: supabase"
```bash
# Install Supabase CLI globally
npm install -g supabase

# Or use npx (no install needed)
npx supabase gen types typescript --project-id YOUR_PROJECT_REF > types/database.ts
```

### "Project not found" or "Unauthorized"
- Double-check your Project Reference ID
- Ensure you have access to the project
- Try regenerating from Supabase dashboard

### Types are still showing errors
1. Make sure `types/database.ts` was generated successfully
2. Check that your Supabase clients import the Database type:
   ```typescript
   import type { Database } from "@/types/database"
   ```
3. Restart your TypeScript server in VS Code (Cmd+Shift+P → "TypeScript: Restart TS Server")

---

## 📚 Using the Generated Types

After generating types, you can use them like this:

```typescript
import { createClient } from "@/lib/supabase/server"
import type { Tables } from "@/lib/types/helpers"

// TypeScript now knows the shape of your data!
const supabase = await createClient()
const { data: students } = await supabase
  .from("students")
  .select("*")
  .eq("school_id", context.schoolId)

// students is automatically typed as Tables<'students'>[]
if (students) {
  students.forEach(student => {
    console.log(student.first_name) // ✅ TypeScript knows this exists
  })
}
```

---

## 🔄 When to Regenerate Types

Regenerate types whenever you:
- Add new tables
- Modify table schemas
- Add/remove columns
- Run new migrations

Just run the generate command again - it will overwrite the old types with fresh ones.

---

## 📖 Full Documentation

See `TYPESCRIPT_FIX_GUIDE.md` for detailed explanations and advanced patterns.



