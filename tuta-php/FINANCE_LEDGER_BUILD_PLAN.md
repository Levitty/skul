# Finance Ledger — Build Plan

**Goal:** Turn Tuta's finance module from a cash-basis fees + expense tracker into a real
double-entry accounting system that an MSME school can run end-to-end — without the bursar
ever seeing a debit or a credit. Every action they already take (issue invoice, record
payment, log an expense) silently posts a balanced journal to a chart of accounts, and the
Trial Balance, Income & Expenditure, and Balance Sheet fall out automatically.

This is the **ledger spine** — the common foundation under all three ambitions (self-sufficient
handoff, QuickBooks sync, or full replacement). Building it commits us to none of them and
keeps all three cheap to add later.

---

## 1. The core design decision: post via database triggers

The posting engine lives in **Postgres triggers**, not PHP. Why:

- **Bulletproof / un-bypassable.** Payments go through the `record_payment` RPC, invoices
  through `generate_invoices_for_class`, expenses/income through direct PHP inserts. A trigger
  fires no matter which path writes the row, so the ledger *cannot* drift out of sync with the
  source records. PHP-side posting would have to be wired into every path and would silently
  miss any new one.
- **Atomic.** The journal is written in the same transaction as the source row. If the payment
  rolls back, so does its journal. No half-posted state.
- **Backfill is trivial.** The same posting logic, wrapped in a one-time function, replays over
  every existing invoice/payment/expense/income row so the ledger isn't empty on day one.
- **The insert order already cooperates.** `record_payment` inserts the `payments` row *before*
  it updates the invoice, so an `AFTER INSERT` trigger on `payments` still sees the pre-payment
  invoice balance and can split the amount into "applied to invoice" vs "overpayment".

The bursar-facing PHP is read-only over the ledger: a chart-of-accounts admin page, a journal/
ledger viewer, and the three statement reports.

---

## 2. Chart of accounts (default template, seeded per school)

Every school is seeded with this default chart on first use (editable later). Accounts are
resolved by a stable **code** so triggers never depend on names.

| Code | Account | Type | Normal balance |
|------|---------|------|----------------|
| 1000 | Cash on hand | Asset | Debit |
| 1010 | Bank | Asset | Debit |
| 1020 | M-Pesa / Mobile Money | Asset | Debit |
| 1200 | Fees Receivable | Asset | Debit |
| 2000 | Fees in Advance (student credit) | Liability | Credit |
| 2100 | Accounts Payable *(Phase 3)* | Liability | Credit |
| 2200 | Statutory Liabilities — PAYE/NHIF/NSSF/Housing *(Phase 4)* | Liability | Credit |
| 3000 | Accumulated Fund / Retained Surplus | Equity | Credit |
| 4000 | Tuition & Fee Income | Income | Credit |
| 4100 | Other Income | Income | Credit |
| 4200 | Uniform Sales | Income | Credit |
| 4900 | Discounts & Concessions (contra-revenue) *(Phase 5)* | Income | Debit |
| 5000 | Salaries & Wages | Expense | Debit |
| 5100 | Rent | Expense | Debit |
| 5200 | Utilities | Expense | Debit |
| 5300 | Supplies & Materials | Expense | Debit |
| 5400 | Meals & Catering | Expense | Debit |
| 5900 | General / Other Expenses | Expense | Debit |

**Account resolution for mapped categories:**
- **Payment method → cash account:** `cash → 1000`, `mpesa`/`mobile_money → 1020`,
  `bank_transfer`/`cheque`/`card → 1010`, `credit_balance → 2000` (no cash movement — draws
  down the student's prepayment liability).
- **Expense category → expense account:** each `expense_categories` row carries an
  `account_code` (defaults to `5900`); the school can point a category at any expense account.
- **Income category → income account:** each `income_categories` row carries an `account_code`
  (defaults to `4100`).

---

## 3. Schema (new tables — migration 090)

```
chart_of_accounts
  id, school_id, code (text), name, type (asset|liability|equity|income|expense),
  normal_side (debit|credit), is_active, is_system (seeded default, can't delete),
  created_at, updated_at
  UNIQUE (school_id, code)

journal_entries          -- the "header": one balanced business event
  id, school_id, entry_date (date), memo, source_type (invoice|payment|expense|income|manual|payroll),
  source_id (uuid of the originating row, nullable), reversed_by (uuid, nullable),
  created_by, created_at
  INDEX (school_id, entry_date), INDEX (school_id, source_type, source_id)

journal_lines            -- the debits & credits; must sum to zero per entry
  id, entry_id, school_id, account_id, debit (numeric 12,2), credit (numeric 12,2),
  memo
  INDEX (entry_id), INDEX (school_id, account_id)

accounting_periods       -- period lock/close (used from Phase 5; created now)
  id, school_id, name, start_date, end_date, status (open|closed), closed_at, closed_by
  UNIQUE (school_id, start_date, end_date)
```

RLS: `ENABLE ROW LEVEL SECURITY` + a `srv_<table>` service-role policy on each, matching the
existing convention (migrations 061/086). All writes are service-role, so `USING (true)`.

A helper `post_journal(school_id, date, memo, source_type, source_id, lines[])` centralises
entry+lines insertion and **asserts debits = credits** before committing (raises on imbalance —
a guardrail that makes a mis-coded rule fail loudly instead of silently unbalancing the books).

---

## 4. Posting rules (the debit/credit table)

Each row is one automatic journal. "Amt" = the driving number on the source row.

| Event | Trigger | Debit | Credit |
|-------|---------|-------|--------|
| **Invoice issued** (status becomes non-draft) | AFTER INSERT/UPDATE on `invoices` | 1200 Fees Receivable — `amount` | 4000 Fee Income — `amount` |
| **Credit applied at issue** (`credit_applied > 0`) | same trigger | 2000 Fees in Advance — `credit_applied` | 1200 Fees Receivable — `credit_applied` |
| **Payment received** (applied portion) | AFTER INSERT on `payments` | cash acct by method — `applied` | 1200 Fees Receivable — `applied` |
| **Overpayment** (`amount − applied > 0`) | same trigger | cash acct by method — `overpay` | 2000 Fees in Advance — `overpay` |
| **Payment from credit** (`method = credit_balance`) | same trigger | 2000 Fees in Advance — `amount` | 1200 Fees Receivable — `amount` |
| **Expense logged** | AFTER INSERT on `expenses` | expense acct by category — `amount` | cash acct by `payment_method` |
| **Other income logged** | AFTER INSERT on `income` | cash acct (default 1010) — `amount` | income acct by category — `amount` |
| **Uniform sale** | AFTER INSERT on `uniform_sales` | cash acct by method — `total_amount` | 4200 Uniform Sales — `total_amount` |
| **Uniform sale voided** | AFTER DELETE on `uniform_sales` | reversing entry of the sale | (mirror) |
| **Invoice cancelled** (was non-draft) | AFTER UPDATE on `invoices` | reversing entry of the original issue | (mirror) |
| **Payroll month** *(Phase 4)* | manual/imported | 5000 Salaries — gross | 1010 Bank (net) + 2200 Statutory (deductions) |

**Revenue-recognition rule:** revenue posts the moment an invoice leaves `draft` (whether created
directly as `unpaid`, or a draft later issued). Draft invoices post nothing. This is the accrual
trigger; cash basis reports can be derived from the payment entries alone if ever needed.

**Discounts (MVP):** `invoices.amount` is already **net** of discount (discounts ride as negative
`invoice_items`), so Fee Income is booked net. Splitting gross revenue + a `4900` contra line is a
Phase-5 refinement — the concessions report already tracks the gross/discount detail today.

**Edge cases the MVP handles simply (refined in Phase 5):**
- *Cancelling an invoice that had payments* — reverses the original issue (receivable/income);
  the cash from real payments stays booked (cash received is cash received). Rare; flagged for the
  refund/credit-note work in Phase 5.
- *Carry-forward* — the new invoice's `amount` includes the carried balance, so it posts as normal
  revenue; the prior invoice is marked `carried_forward` (not cancelled), so no double reversal.

---

## 5. Backfill (one-time, in migration 090)

A `backfill_ledger(p_school_id)` function that, for a school with no journals yet, replays:
1. every non-draft, non-cancelled invoice → issue entry (+ credit-applied entry),
2. every payment → payment entry,
3. every expense → expense entry,
4. every income → income entry,

in date order, using the exact same posting helper the triggers use. Idempotent: it skips any
`source_id` that already has a journal entry, so re-running is safe. Run per school from the SQL
editor (or a tiny admin button) once the triggers are live.

---

## 6. Reports (PHP, read-only over the ledger)

1. **Trial Balance** (`finance/trial-balance`) — every account with its debit/credit balance as of
   a date; totals must equal. The one-glance proof the books balance.
2. **Income & Expenditure** (`finance/income-statement`) — income accounts − expense accounts over
   a date range = surplus/deficit. This is the school's P&L.
3. **Balance Sheet** (`finance/balance-sheet`) — assets = liabilities + accumulated fund + surplus.
   *(Ships with the spine; this is what makes it "full accounting" vs "just a P&L".)*
4. **General Ledger / Journal viewer** (`finance/ledger`) — filterable list of journal entries,
   drill into the debit/credit lines and back to the source invoice/payment. The audit trail.
5. **Export pack** — CSV of the trial balance + journal in a QuickBooks/Zoho-friendly shape. This
   is the "clean handoff" deliverable and the seed of a future API sync.

Chart-of-accounts admin (`finance/chart-of-accounts`) — list/add/rename accounts, point a category
at an account. Read-mostly; system accounts can't be deleted.

New routes in `index.php`, new nav entries under Finance (bursar/admin only), following the
existing `case 'finance/...':` pattern.

---

## 7. Phase sequence

- **Phase 1 — Ledger spine (this build):** migration 090 (tables + seed + triggers + backfill +
  `post_journal`), chart-of-accounts admin, ledger viewer, Trial Balance, Income & Expenditure,
  Balance Sheet, CSV export. **Delivers the "self-sufficient handoff" ambition immediately.**
- **Phase 2 — Bank & cash:** named bank/cash accounts, petty cash, bank reconciliation (import a
  statement, match to payments/expenses, flag unmatched).
- **Phase 3 — Payables:** suppliers/vendors, bills (accrue), supplier payments → `2100 Payable`.
- **Phase 4 — Payroll into the ledger:** monthly payroll-summary journal from the HR system
  (salaries + statutory liabilities). *HR stays the payroll engine; Tuta just books the total.*
- **Phase 5 — Fees completion & controls:** auto-apply penalties, refunds/credit notes, sibling fee
  transfers, gross-revenue + `4900` discount contra, period lock/close via `accounting_periods`,
  fuller audit.
- **Phase 6 — Compliance & management:** cash-flow statement, KRA-ready pack, budget-vs-actual across
  the full P&L, owner dashboard, optional QuickBooks/Zoho API sync.

## 8. How this keeps all three ambitions open

The spine produces clean, structured, balanced journals per school. From there:
- **Self-sufficient handoff** — already delivered by the statements + CSV export in Phase 1.
- **QuickBooks/Zoho sync** — is "push those same journals over the API instead of exporting them."
  The hard part (correct double-entry data) is done; the connector is additive.
- **Full replacement** — is Phases 2–6 continuing to extend the same ledger.

No decision is forced now, and none is made expensive later.
