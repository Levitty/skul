# Tuta Strategic AI Advisor — Code Review & Evolution Roadmap

## Executive Summary

You've built something impressive: a WhatsApp-based AI advisor that connects school management data to natural language questions. The architecture is solid — multi-tenant security, role-based access, Twilio webhooks, structured analytics metrics. But right now, the system is essentially a **data lookup engine with a narrative wrapper**. The AI generates SQL, fetches rows, and then GPT writes a nice paragraph around those rows.

To become a true **strategic advisor**, the system needs to evolve from "what happened?" to "what should we do about it?" — and eventually to "here's what I noticed before you even asked."

This document covers: what's working well, what needs fixing, and a concrete evolution path from data-fetch bot → reasoning engine → proactive strategic partner.

---

## Part 1: What's Working Well

### Strong foundations you should keep:

**1. Security architecture is production-grade.**
Multi-tenant RLS, phone verification before WhatsApp access, admin-only strategic queries, SQL validation with dangerous keyword blocking. This is better than most school systems I've seen.

**2. The metrics library is deterministic.**
`strategic-metrics.ts` pulls real numbers from real tables — financial runway, collection velocity, capacity utilization. These aren't hallucinated. That comment at the top ("All calculations are deterministic and SQL-based to prevent AI hallucination") shows good instinct.

**3. The proactive agents pattern is the right idea.**
Monday Briefing and Admissions Watchdog are the seed of what this system should become. A school principal shouldn't have to *ask* — the system should *tell them*.

**4. WhatsApp as the interface is brilliant for Kenya.**
School owners live on WhatsApp. You're meeting them where they are. The phone verification + magic link flow is well-designed for non-technical users.

**5. The what-if scenario modeler exists.**
Even though it's basic, the fact that you built a `processScenario` function with fee change / enrollment change / expense change types means the mental model is right.

---

## Part 2: What Needs Fixing (Critical Issues)

### Issue 1: The SQL generation path is fragile and dangerous

**Current flow:**
Question → GPT generates SQL → validate keywords → execute against database → GPT narrates results

**Problems:**

- **Keyword-based SQL validation is bypassable.** Checking `upperSql.includes("INSERT")` would block the word "INSERT" even in a comment or string literal, but more importantly, it can be bypassed with creative encoding or sub-selects. This is a security risk.

- **The schema prompt is stale.** `schema.ts` hardcodes table names and columns. When you add a new table or column (which you've clearly been doing — there's `expenses`, `bank_accounts`, `budgets` that aren't in the schema prompt), the AI generates SQL against a schema it doesn't fully know.

- **GPT-generated SQL fails silently.** If the generated SQL has a syntax error or references a column that doesn't exist, the user gets a generic "error fetching data" message with no ability to recover.

- **No query cost control.** A question like "show me everything" could generate a `SELECT *` across every table with no LIMIT, potentially returning massive datasets.

**Recommendation:** Replace freeform SQL generation with a **function-calling / tool-use pattern**. Instead of "generate SQL," the AI should choose from a menu of pre-built, parameterized queries. This is safer, faster, and more reliable. Details in Part 3.

---

### Issue 2: No conversation memory

**Current state:** Each question is processed independently. The `whatsapp_chatbot_sessions` table exists and messages are logged, but the AI never sees previous messages when generating a response.

**Impact:** The principal can't have a conversation like:
> "What's our collection rate?" → 68%
> "How does that compare to last term?" → ??? (system doesn't know what "that" refers to)

**Recommendation:** Pass the last N messages as conversation context to the AI. Simple but transformative.

---

### Issue 3: The AI has no Kenyan school context

**Current persona prompt:**
> "You are the Tuta Strategic Advisor. You are a virtual Chief Operating Officer (COO) for schools."

This is generic. A Kenyan school COO would know:
- Term structure (3 terms/year, each ~13 weeks)
- CBC (Competency-Based Curriculum) grading systems
- Fee collection patterns (spike at term start, trickle mid-term, parents pay in installments)
- That January is admissions season, not September
- That M-Pesa is the default payment method, not bank transfers
- That transport costs are a major parent complaint
- That teacher-student ratios matter for government compliance

**Recommendation:** Build a rich domain context layer. Details in Part 3.

---

### Issue 4: The analytics metrics are disconnected from the advisor

You have two parallel systems:
1. `lib/analytics/strategic-metrics.ts` — calculated KPIs (runway, velocity, retention, etc.)
2. `lib/agents/strategic-advisor.ts` — freeform SQL + GPT narration

These don't talk to each other. When someone asks "how's the school doing?", the advisor generates a fresh SQL query instead of using the carefully-built KPI functions that already exist.

**Recommendation:** Wire the strategic metrics directly into the advisor as its primary data source. The advisor should *always* start with pre-calculated KPIs, and only fall back to custom queries for unusual questions.

---

### Issue 5: Mock data in production code

- `calculateSubjectVariance` → returns hardcoded mock data
- `calculateGradeProfitability` → returns hardcoded mock data
- `calculateMonthlyExpenses` in `financial-runway.ts` → returns 0
- `staffSnapshot` in Monday Briefing → returns 0 for both fields
- Several analytics functions have `// Placeholder` comments

These will silently give wrong answers to real strategic questions.

**Recommendation:** Either implement them properly or remove them and be transparent: "I don't have enough data to calculate subject variance yet."

---

### Issue 6: No rate limiting or abuse protection on the WhatsApp webhook

Anyone who discovers your Twilio webhook URL can flood it with messages. The signature verification is commented out (returns `true` in production). Each message triggers an OpenAI API call.

**Recommendation:** Implement proper Twilio signature verification and add rate limiting per phone number.

---

### Issue 7: Error messages leak internal details

When SQL fails, the raw error message goes back to the user: `"error": queryResult.error`. In production, this could expose table names, column names, or database connection details.

**Recommendation:** Sanitize error messages before returning them to users.

---

## Part 3: The Evolution Roadmap

### Phase 1: "Solid Foundation" — Fix the critical issues above

**1A. Replace freeform SQL with structured query tools**

Instead of asking GPT to write SQL, define a set of "tools" the AI can call:

```
Available tools:
- get_collection_rate(term_id?, class_id?)
- get_financial_runway()
- get_student_count(status?, class_id?)
- get_attendance_rate(date_range?, class_id?)
- get_fee_arrears(term_id?, class_id?, min_amount?)
- get_enrollment_trend(periods?)
- compare_terms(metric, term1, term2)
- get_top_defaulters(limit?)
- get_class_performance(class_id?, subject_id?)
```

Each tool maps to a pre-built, parameterized, tested query. The AI decides *which* tool to call and with *what parameters* — it never writes SQL.

**1B. Add conversation memory to WhatsApp**

Pull the last 5-10 messages from `whatsapp_chatbot_messages` and include them in the AI prompt. This enables follow-up questions and context-aware responses.

**1C. Build the Kenyan school domain context**

Create a rich system prompt that includes:
- Kenyan academic calendar awareness
- CBC curriculum context
- Fee payment patterns and cultural context
- Regulatory requirements (teacher-student ratios, etc.)
- Common strategic challenges for Kenyan private schools

**1D. Wire KPI metrics into the advisor**

When the advisor receives a question, it should:
1. First, run `getAllStrategicMetrics()` to get the current KPI snapshot
2. Include that snapshot in the AI prompt as "current school health"
3. Let the AI reason *over* the pre-calculated numbers

---

### Phase 2: "Strategic Reasoning" — From lookup to analysis

**2A. Multi-step reasoning chains**

Current: Question → Data → Answer

Evolved: Question → Classify intent → Gather relevant data from multiple sources → Cross-reference → Identify patterns → Generate insight → Formulate recommendation

Example:
> "Should I increase fees next term?"

Current system: Generates SQL to get fee amounts, GPT writes a paragraph.

Evolved system:
1. Pull current fee structure
2. Pull collection rate (are parents already struggling to pay?)
3. Pull expense trajectory (are costs actually rising?)
4. Pull competitor fee data (if available)
5. Pull enrollment trend (will we lose students?)
6. Cross-reference: "Collection rate is 68% and declining → parents are already stretched → fee increase risks enrollment drop → recommend targeted increase only for transport fees where costs have risen 15%"

**2B. Anomaly-driven insights**

Instead of waiting for questions, the Invisible Auditor should run nightly and feed findings to the Monday Briefing:
- "Fuel consumption is 30% above expected for current routes"
- "3 teachers haven't entered grades in 2+ weeks"
- "Attendance dropped 15% on Fridays this month"

**2C. Comparative intelligence**

Enable term-over-term and year-over-year comparisons as first-class features:
- "Revenue is up 12% vs. same term last year, but collection velocity is 8% slower"
- "You enrolled 20 more students than last year, but your capacity utilization went from 78% to 92% — you're running out of room"

---

### Phase 3: "Proactive Partner" — The advisor that doesn't wait to be asked

**3A. Threshold-based alerts (expand beyond Admissions Watchdog)**

- Collection rate drops below 60% → alert
- Financial runway drops below 3 months → urgent alert
- A class has < 70% attendance for 3+ days → alert
- Teacher burnout score crosses 70 → private alert to principal
- Expense category spikes 25%+ above budget → alert

**3B. Predictive models**

- **Fee collection forecast:** Based on historical patterns, predict end-of-term collection rate by week 4
- **Enrollment projection:** Based on inquiry-to-enrollment conversion, predict next term's enrollment
- **Cash flow forecast:** Based on expected fee payments vs. scheduled expenses, predict cash position week by week

**3C. Strategic calendar awareness**

The advisor should know what time of year it is and proactively surface relevant advice:
- January: "Admissions season starts — here's your pipeline health"
- Week before term starts: "Here are students who haven't paid and may not return"
- Mid-term: "Collection velocity is tracking below last year — here are your 20 highest-value defaulters"
- End of term: "Term report card — here's how this term compared to last"

**3D. Decision support with trade-off analysis**

When asked "should I hire another teacher?", the advisor should:
1. Calculate current teacher-student ratios
2. Compare to regulatory requirements
3. Model the financial impact (salary + benefits vs. additional capacity revenue)
4. Present the trade-off: "Hiring costs KES 80,000/month. At your current fee rate, you'd need 8 additional students to break even. Your waitlist has 12 applicants for that grade."

---

## Part 4: Technical Architecture for the Evolution

### Current Architecture
```
WhatsApp → Twilio Webhook → Intent Classification (regex)
                                    ↓
                            GPT generates SQL
                                    ↓
                            Execute raw SQL
                                    ↓
                            GPT narrates results
                                    ↓
                            WhatsApp response
```

### Evolved Architecture
```
WhatsApp → Twilio Webhook → Authentication + Rate Limiting
                                    ↓
                            Load conversation history
                                    ↓
                            Load current KPI snapshot
                                    ↓
                            AI Agent with Tool Access
                            ├── get_financial_health()
                            ├── get_student_metrics()
                            ├── get_academic_performance()
                            ├── get_operational_alerts()
                            ├── compare_periods()
                            ├── model_scenario()
                            └── get_recommendations()
                                    ↓
                            Multi-step reasoning
                            (may call multiple tools)
                                    ↓
                            Response with:
                            - Direct answer
                            - Supporting data
                            - Strategic context
                            - Actionable recommendation
                                    ↓
                            WhatsApp response
```

### Key Technical Decisions

**AI Provider:** You're currently using OpenAI (GPT-4o). Consider whether to stay with OpenAI or switch to Claude API. Claude's tool-use / function-calling is well-suited for the structured query pattern described above. Either works — the architecture is provider-agnostic.

**Conversation state:** Use the existing `whatsapp_chatbot_sessions` and `whatsapp_chatbot_messages` tables. Add a `context` JSONB column to sessions to store the last KPI snapshot (avoids re-fetching on every message).

**Tool definitions:** Create a `lib/agents/tools/` directory with one file per tool category (financial-tools.ts, academic-tools.ts, operational-tools.ts). Each exports a tool definition + handler function.

**Prompt engineering:** Move from a single flat persona prompt to a layered prompt:
1. Base persona (COO personality, response format)
2. Domain context (Kenyan school operations, academic calendar)
3. Current school state (live KPIs, active alerts)
4. Conversation history (last N messages)
5. Available tools (function definitions)

---

## Part 5: Priority Order (What to Build First)

| Priority | Change | Impact | Effort |
|----------|--------|--------|--------|
| 1 | Wire KPI metrics into advisor | High — immediate improvement in answer quality | Low |
| 2 | Add conversation memory | High — enables natural follow-up questions | Low |
| 3 | Replace SQL generation with structured tools | High — safety + reliability + accuracy | Medium |
| 4 | Build Kenyan school domain context | Medium — makes advice actually relevant | Low |
| 5 | Implement proper Twilio signature verification | High — security fix | Low |
| 6 | Remove mock data / make gaps transparent | Medium — honesty with users | Low |
| 7 | Add threshold-based proactive alerts | High — transforms from reactive to proactive | Medium |
| 8 | Multi-step reasoning chains | Very High — this is the "strategic" part | High |
| 9 | Predictive models | Very High — forward-looking advice | High |
| 10 | Strategic calendar awareness | Medium — contextual relevance | Medium |

---

---

## Part 6: Finance System Audit — Invoicing, Payments & Collections

The strategic advisor is only as good as the data it reads. If the finance layer has integrity issues, the AI will give confident advice based on wrong numbers. This audit found 15 issues, 4 of them critical.

### CRITICAL: Double Payment Race Condition

**File:** `lib/actions/payments.ts`

When recording a payment, the code first reads existing payments to check the total, then inserts the new payment. Between those two steps, another request (a parent paying via M-Pesa while the accountant records cash) could also pass the check. Both payments go through, and the invoice gets overpaid.

This is a classic check-then-act race condition. The fix is pessimistic locking — use a database-level `SELECT ... FOR UPDATE` or a Supabase RPC that checks and inserts atomically within a single transaction.

**Risk:** Real money loss. A parent pays KES 20,000 via M-Pesa at the exact moment the accountant records KES 20,000 cash. Both pass the "is total under invoice amount?" check. Invoice of KES 20,000 now has KES 40,000 in payments.

---

### CRITICAL: Invoice + Items Not Atomic

**File:** `lib/actions/invoices.ts`

Creating an invoice is a two-step process: insert the invoice row, then insert the line items. These are separate database calls with no transaction wrapper. If items insertion fails, the code tries to delete the invoice as a manual rollback — but that delete can also fail, leaving an orphaned invoice with no items.

Worse, a database trigger creates GL (General Ledger) entries on invoice insert. So the GL entries are created *before* items exist. If items fail, you have GL entries pointing to an invoice with no line items.

**Risk:** Accounting records don't match invoices. Financial statements become unreliable.

---

### CRITICAL: Webhook Has No Idempotency Protection

**Files:** `app/api/webhooks/paystack/route.ts`, `app/api/webhooks/mpesa/route.ts`

Payment gateways retry webhooks when they don't get a response (network timeout, server restart, etc.). Your handlers don't check whether they've already processed a given webhook. If Paystack retries, the reconciliation record gets inserted twice. The payment status gets updated again (harmless but wasteful).

**Risk:** Duplicate reconciliation records corrupt bank reconciliation reports. The strategic advisor would see inflated collection numbers.

---

### CRITICAL: M-Pesa Webhook Doesn't Verify Amount

**File:** `app/api/webhooks/mpesa/route.ts`

When the M-Pesa callback arrives, the code finds the pending payment by `CheckoutRequestID` and marks it as completed. But it never checks whether the amount M-Pesa actually collected matches the amount that was initiated. If there's a discrepancy (which can happen with STK Push edge cases), the payment is recorded at the wrong amount.

**Risk:** Payment records don't match actual money received. Collection rate calculations are wrong. Arrears reports are wrong.

---

### HIGH: Invoice-Payment Status Desynchronization

**File:** `lib/actions/payments.ts`

After recording a payment successfully, the code updates the invoice status (unpaid → partial → paid). But if that update fails, the code just logs the error and moves on. The payment exists, but the invoice still shows "unpaid."

**Risk:** Arrears reports show families as owing money when they've already paid. The advisor would tell the principal "23 families are behind on fees" when some of them aren't.

---

### HIGH: GL Trigger Fires Too Early

**File:** `supabase/migrations/010_finance_accounting.sql`

The GL entry trigger fires `AFTER INSERT ON invoices`. But invoice items are inserted *after* the invoice. So GL entries exist before the system knows what the invoice is actually for. If items insertion fails, GL entries are orphaned.

**Risk:** General Ledger doesn't match reality. Financial runway calculations based on GL data would be wrong.

---

### HIGH: Bulk Invoice Generation Has No Recovery

**File:** `lib/actions/invoices.ts`

Bulk generation loops through all enrolled students and generates invoices one by one. If it fails on student #47 out of 200, students 1-46 have invoices and 47-200 don't. There's no way to resume from where it stopped. Running it again would hit "invoice already exists" errors for students 1-46.

**Risk:** Partial invoicing with no easy way to fix. The accountant has to manually figure out which students were missed.

---

### MEDIUM: Payment Status Logic Overwrites "Partial" with "Overdue"

**File:** `lib/actions/payments.ts`

If a parent makes a partial payment on an overdue invoice, the status is set to "overdue" instead of "partial." The logic checks: if not fully paid AND past due date → overdue. This loses the information that the parent is actively paying.

**Risk:** Reports can't distinguish between "hasn't paid at all" and "paying in installments." The advisor can't give nuanced collection advice.

---

### MEDIUM: Bank Account Silently Dropped

**File:** `lib/actions/payments.ts`

When recording a payment with a bank account ID, if the bank account isn't found or belongs to a different school, the code silently sets it to null. No error message. The accountant thinks the payment is mapped to a bank account, but it isn't.

**Risk:** Bank reconciliation fails. Payments can't be matched to bank statements.

---

### MEDIUM: Manual Payments Never Get Reconciliation Records

**File:** `lib/actions/payments.ts`

Only webhook-processed payments (M-Pesa, Paystack) get automatic reconciliation records. Cash payments, bank transfers, and manually recorded payments have no reconciliation entry at all.

**Risk:** Bank reconciliation is incomplete. The advisor's financial health calculations miss a significant portion of payments.

---

### MEDIUM: Invoice Reference Collision at Scale

**File:** `lib/actions/invoices.ts`

Invoice references use `Date.now().toString().slice(-6)` for uniqueness. At bulk generation speed (potentially 100+ per second), this creates collisions. Two invoices generated in the same millisecond get the same reference.

**Risk:** Unique constraint violations during bulk generation. Some students don't get invoiced.

---

### LOW: M-Pesa Phone Validation is Minimal

**File:** `lib/integrations/mpesa.ts`

Phone normalization replaces leading "0" with "254" but doesn't validate the remaining digits. A number like "02ABC" would become "2542ABC" and fail at the M-Pesa API with a confusing error.

**Risk:** Poor user experience when phone numbers are entered incorrectly.

---

### What's Working Well in Finance

Despite the issues above, several things are well-designed:

- **Tenant isolation is enforced.** Every finance query checks `school_id` through `requireTenantContext`. One school can't see another's invoices.
- **Negative amount prevention.** Payment amounts are validated to be positive before recording.
- **WhatsApp receipts are non-blocking.** If the receipt notification fails, the payment still records successfully. Good design choice.
- **Chart of Accounts structure is sound.** The GL account hierarchy, journal entries, and balance tracking follow proper accounting patterns.
- **Overpayment check exists.** Even though it has a race condition, the intent to prevent overpayment is there and works for single-user scenarios.

---

### Finance Fix Priority

| Priority | Fix | Why It Matters for the Advisor |
|----------|-----|-------------------------------|
| 1 | Atomic payment recording (lock + transaction) | Without this, collection rate data is unreliable |
| 2 | Atomic invoice + items creation | Without this, GL data is unreliable |
| 3 | Webhook idempotency | Without this, reconciliation data has duplicates |
| 4 | M-Pesa amount verification | Without this, payment amounts could be wrong |
| 5 | Fix invoice status sync | Without this, arrears reports show false positives |
| 6 | Fix GL trigger timing | Without this, financial statements are wrong |
| 7 | Bulk generation with recovery | Operational reliability |
| 8 | Payment status logic (partial vs overdue) | Better collection intelligence |
| 9 | Reconciliation for all payment methods | Complete financial picture |
| 10 | Invoice reference uniqueness | Prevents bulk generation failures |

---

## Summary

Your system has a strong technical foundation. The database design, multi-tenancy, auth, WhatsApp integration, and metrics library are all solid.

There are two parallel tracks of work:

**Track A — Finance Integrity:** Fix the critical data integrity issues (race conditions, missing transactions, webhook idempotency) so the numbers in the database are trustworthy. The strategic advisor can only be as smart as the data it reads.

**Track B — Strategic Intelligence:** Evolve the advisor from data-fetch bot to reasoning engine (wire in KPIs, add conversation memory, build structured tools, add Kenyan context).

These tracks can run in parallel, but Track A is the foundation. There's no point building a brilliant advisor that gives confident recommendations based on wrong numbers.

The evolution path is: **Reliable Data → Structured Access → Contextual Reasoning → Proactive Partnership.**

The goal is a system where the principal opens WhatsApp on Monday morning and finds a message that says: "Good morning. Three things need your attention this week..." — and every number in that message is one they can trust.
