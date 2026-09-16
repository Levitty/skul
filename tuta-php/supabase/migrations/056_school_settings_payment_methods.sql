-- Migration 056: School settings + payment methods
-- Configurable school preferences and payment method management.
-- Run in Supabase Dashboard → SQL Editor
-- After running: Settings → API → Reload Schema Cache

-- ── School Settings (key-value, infinitely extensible) ──────────

CREATE TABLE IF NOT EXISTS school_settings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    key         TEXT NOT NULL,
    value       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(school_id, key)
);

CREATE INDEX IF NOT EXISTS idx_school_settings_school
    ON school_settings (school_id);

-- ── Payment Methods (per-school configurable list) ──────────────

CREATE TABLE IF NOT EXISTS payment_methods (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    code        TEXT NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_methods_unique
    ON payment_methods (school_id, code);

CREATE INDEX IF NOT EXISTS idx_payment_methods_school
    ON payment_methods (school_id, sort_order);

-- ── Seed default settings for existing schools ──────────────────
-- (Run this only once. For new schools, the app seeds on first access.)

INSERT INTO school_settings (school_id, key, value)
SELECT s.id, k.key, k.value
FROM schools s
CROSS JOIN (VALUES
    ('currency_symbol', 'KES'),
    ('currency_code', 'KES'),
    ('invoice_prefix', 'INV'),
    ('default_due_days', '30'),
    ('auto_invoice_on_enroll', 'true'),
    ('mpesa_environment', 'sandbox'),
    ('mpesa_shortcode', ''),
    ('mpesa_passkey', ''),
    ('mpesa_consumer_key', ''),
    ('mpesa_consumer_secret', ''),
    ('mpesa_callback_url', '')
) AS k(key, value)
ON CONFLICT (school_id, key) DO NOTHING;

-- ── Seed default payment methods for existing schools ───────────

INSERT INTO payment_methods (school_id, name, code, is_active, sort_order)
SELECT s.id, m.name, m.code, true, m.sort_order
FROM schools s
CROSS JOIN (VALUES
    ('Cash',          'cash',          1),
    ('M-Pesa',        'mpesa',         2),
    ('Bank Transfer', 'bank_transfer', 3),
    ('Cheque',        'cheque',        4)
) AS m(name, code, sort_order)
ON CONFLICT (school_id, code) DO NOTHING;

-- ── M-Pesa STK Push Requests (tracks pending/completed pushes) ──

CREATE TABLE IF NOT EXISTS mpesa_stk_requests (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id             UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    invoice_id            UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    phone                 TEXT NOT NULL,
    amount                NUMERIC(12,2) NOT NULL,
    checkout_request_id   TEXT,
    merchant_request_id   TEXT,
    mpesa_receipt         TEXT,
    status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    result_desc           TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mpesa_stk_checkout
    ON mpesa_stk_requests (checkout_request_id);

CREATE INDEX IF NOT EXISTS idx_mpesa_stk_invoice
    ON mpesa_stk_requests (invoice_id, status);

-- ── M-Pesa C2B Payments (parent pays directly to Till/Paybill) ──

CREATE TABLE IF NOT EXISTS mpesa_c2b_payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       UUID REFERENCES schools(id) ON DELETE CASCADE,
    trans_id        TEXT NOT NULL UNIQUE,
    phone           TEXT,
    amount          NUMERIC(12,2) NOT NULL,
    bill_ref        TEXT,
    payer_name      TEXT,
    invoice_id      UUID REFERENCES invoices(id) ON DELETE SET NULL,
    match_method    TEXT,
    match_notes     TEXT,
    status          TEXT NOT NULL DEFAULT 'unmatched'
                    CHECK (status IN ('matched', 'unmatched', 'manual')),
    raw_payload     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mpesa_c2b_school
    ON mpesa_c2b_payments (school_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mpesa_c2b_status
    ON mpesa_c2b_payments (status) WHERE status = 'unmatched';
