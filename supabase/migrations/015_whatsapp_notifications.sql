-- WhatsApp Notifications & Chatbot System Migration
-- Creates tables for notification queue, chatbot sessions, and message history

-- ============================================================================
-- 1. WHATSAPP NOTIFICATION QUEUE
-- ============================================================================
CREATE TABLE IF NOT EXISTS whatsapp_notification_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    recipient_phone TEXT NOT NULL,
    recipient_type TEXT DEFAULT 'parent' CHECK (recipient_type IN ('parent', 'student', 'teacher', 'admin')),
    recipient_id UUID, -- Links to student_id, guardian_id, etc.
    template_id UUID REFERENCES message_templates(id),
    message_type TEXT NOT NULL CHECK (message_type IN ('payment_reminder', 'receipt', 'announcement', 'custom')),
    variables JSONB DEFAULT '{}', -- Template variables
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
    scheduled_at TIMESTAMPTZ DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    error_message TEXT,
    external_message_id TEXT, -- Twilio message SID
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_school ON whatsapp_notification_queue(school_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_status ON whatsapp_notification_queue(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_scheduled ON whatsapp_notification_queue(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_recipient ON whatsapp_notification_queue(recipient_phone);

-- ============================================================================
-- 2. WHATSAPP CHATBOT SESSIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS whatsapp_chatbot_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    phone_number TEXT NOT NULL,
    session_state TEXT DEFAULT 'active' CHECK (session_state IN ('active', 'inactive', 'blocked')),
    last_interaction_at TIMESTAMPTZ DEFAULT NOW(),
    context JSONB DEFAULT '{}', -- Store conversation context
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(school_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_school ON whatsapp_chatbot_sessions(school_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_phone ON whatsapp_chatbot_sessions(phone_number);
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_state ON whatsapp_chatbot_sessions(session_state);

-- ============================================================================
-- 3. WHATSAPP CHATBOT MESSAGES
-- ============================================================================
CREATE TABLE IF NOT EXISTS whatsapp_chatbot_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES whatsapp_chatbot_sessions(id) ON DELETE CASCADE,
    message_type TEXT NOT NULL CHECK (message_type IN ('incoming', 'outgoing')),
    message_text TEXT NOT NULL,
    intent TEXT, -- Detected intent (strategic_query, greeting, etc.)
    response_data JSONB, -- Full response from strategic advisor
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chatbot_messages_session ON whatsapp_chatbot_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_messages_created ON whatsapp_chatbot_messages(created_at);

-- ============================================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE whatsapp_notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_chatbot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_chatbot_messages ENABLE ROW LEVEL SECURITY;

-- Notification Queue Policies
CREATE POLICY "Users can view notifications in their school"
    ON whatsapp_notification_queue FOR SELECT
    USING (school_id = get_user_school_id());

CREATE POLICY "Admins can manage notifications"
    ON whatsapp_notification_queue FOR ALL
    USING (school_id = get_user_school_id());

-- Chatbot Sessions Policies
CREATE POLICY "Users can view chatbot sessions in their school"
    ON whatsapp_chatbot_sessions FOR SELECT
    USING (school_id = get_user_school_id());

CREATE POLICY "Admins can manage chatbot sessions"
    ON whatsapp_chatbot_sessions FOR ALL
    USING (school_id = get_user_school_id());

-- Chatbot Messages Policies
CREATE POLICY "Users can view messages in their school"
    ON whatsapp_chatbot_messages FOR SELECT
    USING (
        session_id IN (
            SELECT id FROM whatsapp_chatbot_sessions 
            WHERE school_id = get_user_school_id()
        )
    );

CREATE POLICY "System can create chatbot messages"
    ON whatsapp_chatbot_messages FOR INSERT
    WITH CHECK (
        session_id IN (
            SELECT id FROM whatsapp_chatbot_sessions 
            WHERE school_id = get_user_school_id()
        )
    );


