-- =============================================
-- 032: SMS/Email Bulk Communication
-- =============================================

-- Message templates
CREATE TABLE IF NOT EXISTS message_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    channel TEXT NOT NULL CHECK (channel IN ('sms', 'email', 'both')),
    subject TEXT,
    body TEXT NOT NULL,
    variables TEXT[],
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_msg_templates_school ON message_templates(school_id);

-- Bulk message campaigns
CREATE TABLE IF NOT EXISTS message_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    template_id UUID REFERENCES message_templates(id),
    name TEXT NOT NULL,
    channel TEXT NOT NULL CHECK (channel IN ('sms', 'email', 'both')),
    subject TEXT,
    body TEXT NOT NULL,
    recipient_type TEXT NOT NULL CHECK (recipient_type IN ('all_parents', 'class', 'individual', 'staff', 'custom')),
    recipient_filter JSONB,
    total_recipients INT DEFAULT 0,
    sent_count INT DEFAULT 0,
    failed_count INT DEFAULT 0,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled')),
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_school ON message_campaigns(school_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON message_campaigns(status);

-- Individual message logs
CREATE TABLE IF NOT EXISTS message_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID REFERENCES message_campaigns(id) ON DELETE CASCADE,
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
    recipient_name TEXT,
    recipient_phone TEXT,
    recipient_email TEXT,
    subject TEXT,
    body TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_msg_logs_campaign ON message_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_msg_logs_school ON message_logs(school_id);

-- RLS
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "msg_templates_school_access" ON message_templates
    FOR ALL USING (school_id IN (SELECT school_id FROM user_schools WHERE user_id = auth.uid()));

CREATE POLICY "msg_campaigns_school_access" ON message_campaigns
    FOR ALL USING (school_id IN (SELECT school_id FROM user_schools WHERE user_id = auth.uid()));

CREATE POLICY "msg_logs_school_access" ON message_logs
    FOR ALL USING (school_id IN (SELECT school_id FROM user_schools WHERE user_id = auth.uid()));
