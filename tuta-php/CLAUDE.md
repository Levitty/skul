# Tuta School — working rules for this codebase

PHP 8 + Supabase (PostgREST) school management system, deployed to Hostinger at
`mgt.whitestarschools.com`. Multi-tenant: every row carries `school_id`; the
service-role key is used server-side, so **every query must filter by school**.

## Never
- Commit `config.php` (git-ignored; holds the Supabase service key, Resend and Anthropic keys). The local copy is the server's source of truth — never overwrite it with another.
- Put emojis anywhere in the UI, flash messages or printed guides. Use text, colour or SVG.
- Leave a stray `.php` in the web root — anything there is web-reachable. Probes and one-offs go in `tools/` (blocked by `.htaccess` and guarded with `PHP_SAPI !== 'cli'`).
- Combine migrations. One numbered file per change in `~/Desktop/Tuta Workspace/MIGRATION_NNN_ONLY.sql`, idempotent, `DROP FUNCTION` before any signature change, handed to the user via clipboard (`pbcopy`).
- Run destructive production deletes.

## How things are built
- Routing: `index.php` → `?route=` (clean URLs via `.htaccess`); public routes are listed in `$publicRoutes`. Add a `case` per page.
- Data: `includes/supabase.php` client (`from/select/eq/in/ilike/gte/lte/order/limit/single/execute`, `rpc`, `insert`, `upsert`, `Supabase::fetchAllPaged`, `fetchByChunkedIn`). Anything that changes money or learners goes through a governed `SECURITY DEFINER` RPC returning `{success, error}` and writing `audit_logs`.
- Helpers: `schoolId()`, `schoolSetting()`, `userCan()`, `isAdmin()`, `cached*()` (5-minute session caches — `redirect()` clears them after any POST), `money()`, `flash()/flashLink()/redirect()`, `csrfField()/verifyCsrf()`, `input()`.
- CSS: `assets/tuta.css` is a frozen Tailwind build. A class it lacks renders as nothing. Run `php tools/css-check.php` and add what's missing to `assets/tuta-extra.css`.
- Shared pickers for spend forms: `includes/finance-pickers.php`. Don't re-implement the category tree.
- Two-level expense categories (heading → line, via `parent_category_id`); cost centres are a separate, optional tag ("for which"). Category = kind of spend; cost centre = the thing it was for.
- Streams = `sections` table; one page manages them (`students/streams`). Registers, mark entry and report cards run per stream.

## Before every upload
1. `php tools/smoke.php` (renders ~30 pages against live data; must PASS)
2. `php tools/css-check.php`
3. Commit. Then upload the whole `tuta-php` folder (config.php stays local-only by `.gitignore`, and the server keeps its own).

## Testing without a server
`php tools/smoke.php "Langata" finance/expenses "month=all"` renders one page as a school admin and writes the HTML to `tools/.smoke-out/`.
