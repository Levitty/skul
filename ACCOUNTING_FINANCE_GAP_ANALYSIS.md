# Accounting & Finance Gap Analysis

This document compares the **uploaded Accounting & Finance requirements** against the **current repo implementation**. The goal is to show what is already in place, what is partially implemented, and what is missing.

## Summary

- **Core finance schema exists** (chart of accounts, general ledger, expenses, budgets, AP, bank accounts, other income).
- **Core fees/invoicing flows exist** (fee structures, invoice generation, payments).
- **Financial statements and dashboard exist**, but most **exports, automation, approvals, and parent payment portal features are missing**.

## Evidence Sources (selected)

- Finance schema: `/Users/mutualevity/Desktop/tuta-school/supabase/migrations/010_finance_accounting.sql`
- Fees/invoices UI: `/Users/mutualevity/Desktop/tuta-school/app/(dashboard)/dashboard/accountant/fees`
- Finance UI: `/Users/mutualevity/Desktop/tuta-school/app/(dashboard)/dashboard/accountant/finance`
- Actions: `/Users/mutualevity/Desktop/tuta-school/lib/actions`

---

## 1) Invoicing & Fee Collection

| Requirement | Status | Evidence | Notes |
| --- | --- | --- | --- |
| Fee structures table | Implemented | `010_finance_accounting.sql`, `lib/actions/fee-structures.ts` | `fee_structures` CRUD supported. |
| Fee structure CRUD UI | Implemented | `components/fees/fee-structure-form.tsx`, accountant fees pages | Full create/edit flows exist. |
| Grade/term-based fees | Implemented | `lib/actions/fee-structures.ts` | Uses `class_id` and `term_id`. |
| Multiple billing cycles (monthly/termly/annual) | Missing | — | No billing_cycle column or logic. |
| Bulk fee assignment | Partial | `lib/actions/invoices.ts` bulk generate | Bulk invoice generation per class exists, but not persistent fee assignment groups. |
| Automated invoice generation | Implemented | `lib/actions/invoices.ts` | Uses enrollments and fee structures. |
| Manual invoice creation w/ custom items | Partial | `generate-invoice-form.tsx` | Generates by rules; custom line item editor not present. |
| Invoice templates & branding | Missing | — | No template system. |
| Sequential invoice numbering | Partial | `lib/actions/invoices.ts` | Uses `INV-...Date.now()` style; not strict sequential. |
| Invoice PDF export | Missing | — | No PDF generation. |
| Payment recording UI | Implemented | `components/fees/record-payment-form.tsx` | Supports methods and partials. |
| Partial payments & balance calc | Implemented | `lib/actions/payments.ts` | Updates status, handles partials. |
| Allocate to oldest invoice first | Missing | — | Payment is per-invoice. |
| Receipt generation | Partial | `lib/actions/payments.ts` | WhatsApp receipt link exists; no PDF receipt UI. |
| Refund processing | Missing | — | No refund model or UI. |
| Family accounts | Missing | — | No parent account aggregation. |
| Combined family billing | Missing | — | No parent invoice grouping. |
| Sibling discount automation | Missing | — | No discount engine. |
| Parent payment portal | Partial | Parent portal exists | Not a full payment portal with invoices/receipts. |
| Late fee calculation | Missing | — | No late fee rules. |
| Payment reminders (SMS/email) | Partial | WhatsApp messaging exists | No automated reminders. |

---

## 2) Expense Management

| Requirement | Status | Evidence | Notes |
| --- | --- | --- | --- |
| Expense categories table | Implemented | `010_finance_accounting.sql`, `lib/actions/expense-categories.ts` | Category CRUD exists. |
| Expense entry & listing | Implemented | `components/finance/expense-form.tsx`, `lib/actions/expenses.ts` | Basic entry + listing. |
| Receipt upload | Partial | `expenses.receipt_url` | No upload UI or storage integration. |
| OCR integration | Missing | — | No OCR logic. |
| Vendor table & management | Missing | — | `vendors` table not present. |
| Recurring expenses | Missing | — | No schedule/recurrence model. |
| Approval workflow | Missing | — | No `expense_approvals` table or UI. |
| Budget tracking | Implemented | `lib/actions/budgets.ts`, `components/finance/budgets-client.tsx` | Basic budgets & variance. |
| Budget alerts (75/90/100%) | Missing | — | No alerting mechanism. |
| Purchase orders | Missing | — | No `purchase_orders` table/UI. |

---

## 3) Financial Reporting

| Requirement | Status | Evidence | Notes |
| --- | --- | --- | --- |
| Profit & Loss | Implemented | `components/finance/financial-reports-client.tsx` | P&L calculated from GL. |
| Cash flow | Implemented | `financial-reports-client.tsx` | Cash flow uses GL + payments/expenses. |
| Trial balance | Implemented | `lib/actions/general-ledger.ts` | Trial balance exists. |
| Balance sheet | Partial | `financial-reports-client.tsx` | Derived from trial balance. |
| Fee collection summary | Partial | `payments.ts`, dashboard | No dedicated report. |
| Outstanding fee aging | Partial | `getArrears()` | No aging buckets UI. |
| Payment trends/forecast | Missing | — | No forecasting. |
| Discounts/scholarships analysis | Missing | — | No discount model. |
| Expense summary by dept | Missing | — | No department dimension. |
| Vendor spending analysis | Missing | — | No vendor model. |
| Student account statement | Partial | `getStudentStatement()` | No PDF/export. |
| Export to PDF/Excel/CSV | Missing | — | No export utilities. |
| Scheduled reports | Missing | — | No scheduling. |

---

## 4) Dashboards

| Requirement | Status | Evidence | Notes |
| --- | --- | --- | --- |
| Finance dashboard | Implemented | `components/finance/finance-dashboard-client.tsx` | KPIs and alerts present. |
| Accounts receivable dashboard | Missing | — | Not separate from finance dashboard. |
| Expense dashboard | Partial | Finance dashboard | No dedicated expense dashboard. |
| Interactive charts | Partial | Some charts exist | No rich drill-down analytics. |
| Comparison views | Missing | — | No YoY/MoM comparisons. |

---

## 5) Technical & Integrations

| Requirement | Status | Evidence | Notes |
| --- | --- | --- | --- |
| REST APIs (invoices/payments/expenses/etc.) | Partial | Server actions + API routes | No Express REST layer; uses Next.js routes/actions. |
| Role-based access control | Implemented | RLS + UI roles | RBAC present in DB + UI. |
| Audit logs | Missing | — | No financial audit log tables. |
| Payment gateways | Implemented | `app/api/webhooks/*`, mpesa initiate | M-Pesa/Paystack hooks exist. |
| SMS/email notifications | Partial | WhatsApp integration | No SMS/email service. |
| PDF generation | Missing | — | No pdfkit/puppeteer. |
| OCR service | Missing | — | No tesseract integration. |
| Background jobs | Partial | Cron endpoints exist | No finance automation jobs. |
| Bank reconciliation | Implemented | `components/finance/bank-reconciliation-client.tsx` | Bank accounts & reconciliation present. |
| Chart of accounts | Implemented | `components/finance/chart-of-accounts-client.tsx` | Full CRUD. |
| Tax & multi-currency | Missing | — | No tax/currency fields. |
| Petty cash / fixed assets | Missing | — | No models or UI. |

