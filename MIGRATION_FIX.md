# Quick Fix for Migration Error

## The Error
```
ERROR: 42501: permission denied to set parameter "app.jwt_secret"
```

## Solution

The line trying to set `app.jwt_secret` requires superuser permissions. We don't need it - Supabase handles JWT secrets automatically.

### Option 1: Use the Fixed Migration (Recommended)

I've already removed the problematic line from your `001_initial_schema.sql` file.

1. Go back to Supabase SQL Editor
2. Clear any existing query
3. Copy the **entire contents** of `supabase/migrations/001_initial_schema.sql` again
4. Paste and run it

The error line has been removed, so it should work now!

### Option 2: Manual Fix (If you prefer)

If you already have the SQL in the editor:

1. Find this section near the top (around lines 4-5):
   ```sql
   -- Enable Row Level Security
   ALTER DATABASE postgres SET "app.jwt_secret" TO 'your-jwt-secret';
   ```

2. **Delete those two lines** (or comment them out with `--`)

3. Run the migration again

## What This Line Did

The line was trying to set a JWT secret for the database, but:
- Supabase manages JWT secrets automatically
- Regular users don't have permission to change database-level settings
- It's completely safe to skip this line

## Next Steps

After fixing and running the migration successfully:
1. Continue with migration 002 (RLS policies)
2. Then run the QUICK_SETUP.sql script

Let me know if you still get errors!




