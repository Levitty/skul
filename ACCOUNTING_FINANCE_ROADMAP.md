# Accounting & Finance Roadmap

This roadmap is derived from the uploaded requirements and the current repo state. It is structured by your Phase 1/2/3 priorities, with concrete DB/API/UI tasks and suggested file targets.

## Phase 1 (Core)

### 1. Fee structures + invoice generation hardening
- **DB**: Add missing columns for billing cycles and installment logic.
  - `fee_structures.billing_cycle` (monthly/termly/annual)
  - `fee_structures.grade_level` (optional if class_id not enough)
- **API/Actions**:
  - Extend `/lib/actions/fee-structures.ts` to support billing_cycle and grade_level.
  - Add helper to compute invoices by billing cycle.
- **UI**:
  - Update `/components/fees/fee-structure-form.tsx` to include billing cycle selector.
  - Add views to filter fee structures by billing cycle and grade.

### 2. Payment recording + receipts
- **API/Actions**:
  - Add receipt number generator and persist on `payments` (or a `receipts` table).
  - Extend `/lib/actions/payments.ts` to return a receipt ID.
- **UI**:
  - Add a receipt view page under `/app/(dashboard)/dashboard/accountant/fees/receipts/[id]`.
  - Add a “Download receipt (PDF)” button (stub until Phase 2).

### 3. Expense entry + approvals (basic)
- **DB**: Add `expense_approvals` table and `approval_status` to `expenses`.
- **API/Actions**:
  - Add approval actions in `/lib/actions/expenses.ts` (approve/reject).
- **UI**:
  - Add approval panel to `/components/finance/expenses-list.tsx`.

### 4. Student account statements + arrears
- **API/Actions**:
  - Expand `/lib/actions/payments.ts#getArrears` with aging buckets.
- **UI**:
  - Add an “Arrears report” page under `/app/(dashboard)/dashboard/accountant/fees/arrears`.
  - Add “Statement” download button for student profile.

---

## Phase 2 (Enhanced)

### 1. Parent payment portal
- **UI**: Create `/app/(dashboard)/dashboard/parent/payments` with:
  - Outstanding invoices list
  - Payment history + receipt links
  - “Pay now” initiation (M-Pesa/Paystack)
- **API/Actions**: Reuse existing payment initiation endpoints.

### 2. Payment plans + installment schedules
- **DB**: Add `payment_plans` + `payment_plan_installments`.
- **API/Actions**:
  - CRUD in `/lib/actions/payment-plans.ts`.
  - Auto‑generate invoices per installment schedule.
- **UI**:
  - Create plan builder under `/dashboard/accountant/fees/payment-plans`.

### 3. Budget management enhancements
- **API/Actions**: Add budget utilization alerts.
- **UI**: Add threshold indicators in `/components/finance/budgets-client.tsx`.

### 4. Dashboard upgrades
- **UI**: Add richer charts (Recharts) to finance dashboard and new:
  - Accounts receivable dashboard
  - Expense dashboard

---

## Phase 3 (Advanced)

### 1. PDF exports & scheduled reporting
- **API**: Add PDF generation service using `pdfkit` or `puppeteer`.
- **UI**: Add export buttons to reports & statements.
- **Scheduler**: Add cron endpoints for scheduled reports.

### 2. Automated notifications
- **SMS/Email**: Integrate Twilio/SendGrid for reminders and overdue notices.
- **Logic**: Add late fee calculation and apply to invoices automatically.

### 3. OCR receipts
- **UI**: Add drag-and-drop upload and preview.
- **Service**: Integrate `tesseract.js` for field extraction.

### 4. Advanced accounting
- **Features**: tax/VAT logic, multi‑currency, fixed assets, petty cash, period close.
- **DB**: add required tables and ledger adjustments.

---

## Recommended File Targets (by area)

### DB (Supabase migrations)
- `/Users/mutualevity/Desktop/tuta-school/supabase/migrations/021_finance_phase1.sql`
- `/Users/mutualevity/Desktop/tuta-school/supabase/migrations/022_finance_phase2.sql`
- `/Users/mutualevity/Desktop/tuta-school/supabase/migrations/023_finance_phase3.sql`

### Actions (server-side)
- `/Users/mutualevity/Desktop/tuta-school/lib/actions/payment-plans.ts` (new)
- `/Users/mutualevity/Desktop/tuta-school/lib/actions/receipts.ts` (new)
- `/Users/mutualevity/Desktop/tuta-school/lib/actions/arrears.ts` (new)

### UI (dashboard)
- `/Users/mutualevity/Desktop/tuta-school/app/(dashboard)/dashboard/accountant/fees/arrears/page.tsx`
- `/Users/mutualevity/Desktop/tuta-school/app/(dashboard)/dashboard/accountant/fees/receipts/[id]/page.tsx`
- `/Users/mutualevity/Desktop/tuta-school/app/(dashboard)/dashboard/parent/payments/page.tsx`
- `/Users/mutualevity/Desktop/tuta-school/components/finance/*`

