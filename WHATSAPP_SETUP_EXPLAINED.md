# WhatsApp Chatbot System - Complete Explanation

## 🏗️ Architecture Overview

The WhatsApp chatbot system consists of several components working together:

```
┌─────────────────┐
│  Your Phone     │
│  (WhatsApp)     │
└────────┬────────┘
         │
         │ Sends message
         ▼
┌─────────────────────────┐
│  Twilio WhatsApp API    │
│  (Receives messages)    │
└────────┬────────────────┘
         │
         │ Webhook POST
         ▼
┌─────────────────────────┐
│  /api/integrations/     │
│  whatsapp/webhook       │
│  (Next.js API Route)    │
└────────┬────────────────┘
         │
         │ Processes message
         ▼
┌─────────────────────────┐
│  WhatsApp Chatbot       │
│  Service                │
│  (lib/services/         │
│   whatsapp-chatbot.ts)  │
└────────┬────────────────┘
         │
         ├─► Authenticates user by phone number
         ├─► Classifies intent (greeting/help/strategic query)
         ├─► Queries Strategic Advisor (if strategic query)
         └─► Formats response
         │
         ▼
┌─────────────────────────┐
│  Twilio WhatsApp API    │
│  (Sends response)       │
└────────┬────────────────┘
         │
         ▼
┌─────────────────┐
│  Your Phone     │
│  (Receives      │
│   response)     │
└─────────────────┘
```

## 📊 Database Tables

### 1. `whatsapp_notification_queue`
Stores queued notifications (payment reminders, receipts, announcements)
- `id`, `school_id`, `recipient_phone`, `message_type`, `status`, etc.

### 2. `whatsapp_chatbot_sessions`
Tracks active chatbot conversations
- `id`, `school_id`, `user_id`, `phone_number`, `session_state`, `last_interaction_at`

### 3. `whatsapp_chatbot_messages`
Stores all chatbot messages (incoming and outgoing)
- `id`, `session_id`, `message_type`, `message_text`, `intent`, `response_data`

### 4. `user_profiles` (Extended)
**THIS IS WHERE YOUR ERROR IS COMING FROM!**

The migration `016_whatsapp_phone_verification.sql` adds these columns:
- `phone_verified` (BOOLEAN) - Whether phone is verified
- `phone_verification_code` (TEXT) - Temporary 6-digit code
- `phone_verification_expires_at` (TIMESTAMPTZ) - When code expires

## 🔄 Complete Flow

### Step 1: Phone Setup (What You're Doing Now)

1. **User visits** `/dashboard/admin/whatsapp`
2. **Enters phone number** in the setup form
3. **Clicks "Send Verification Code"**
   - Component calls `/api/whatsapp/verify-phone` (POST)
   - API calls `sendPhoneVerificationCode()` server action
   - Server action:
     - Generates 6-digit code
     - Stores code in `user_profiles.phone_verification_code`
     - Sends code via Twilio WhatsApp API
4. **User receives code** on WhatsApp
5. **User enters code** in form
6. **Clicks "Verify"**
   - Component calls `/api/whatsapp/verify-phone` (POST with code)
   - API calls `verifyPhoneCode()` server action
   - Server action:
     - Checks code matches
     - Checks code hasn't expired
     - Sets `user_profiles.phone_verified = true`
     - Clears verification code

### Step 2: Using the Chatbot

1. **User sends WhatsApp message** to your Twilio number
2. **Twilio receives message** and sends webhook to your app
3. **Webhook handler** (`/api/integrations/whatsapp/webhook`) receives it
4. **Extracts phone number** from webhook data
5. **Calls chatbot service** (`handleIncomingMessage()`)
6. **Chatbot authenticates**:
   - Looks up phone number in `user_profiles`
   - Checks if phone is verified OR user has admin role
   - Creates/updates chatbot session
7. **Classifies intent**:
   - "hi" → greeting
   - "help" → help
   - "what's our collection velocity?" → strategic query
8. **Processes query**:
   - If strategic: calls Strategic Advisor agent
   - Strategic Advisor queries database
   - Formats response for WhatsApp
9. **Sends response** back via Twilio
10. **User receives response** on WhatsApp

## ❌ Your Current Error

**Error:** `Could not find the 'phone_verification_code' column of 'user_profiles' in the schema cache`

**Cause:** The migration `016_whatsapp_phone_verification.sql` hasn't been run yet.

**What's happening:**
- When you click "Send Verification Code", the code tries to store the verification code in `user_profiles.phone_verification_code`
- But that column doesn't exist because the migration hasn't been applied
- Supabase throws an error

## ✅ How to Fix It

### Option 1: Using Supabase Dashboard (Recommended)

1. **Go to your Supabase project dashboard**
   - https://supabase.com/dashboard/project/YOUR_PROJECT_ID

2. **Click "SQL Editor"** in the left sidebar

3. **Click "New Query"**

4. **Copy the entire contents** of:
   ```
   supabase/migrations/016_whatsapp_phone_verification.sql
   ```

5. **Paste into SQL Editor**

6. **Click "Run"** (or press Cmd/Ctrl + Enter)

7. **Verify it worked:**
   - Go to "Table Editor"
   - Click on `user_profiles` table
   - You should see new columns: `phone_verified`, `phone_verification_code`, `phone_verification_expires_at`

### Option 2: Using Supabase CLI (If you have it)

```bash
cd /Users/mutualevity/Desktop/tuta-school
supabase db push
```

This will apply all pending migrations.

## 🔍 Verification

After running the migration, verify it worked:

1. **In Supabase Dashboard:**
   - Go to Table Editor
   - Select `user_profiles` table
   - Check columns list - you should see:
     - `phone_verified` (boolean)
     - `phone_verification_code` (text)
     - `phone_verification_expires_at` (timestamp)

2. **In your app:**
   - Refresh the WhatsApp dashboard page
   - Try clicking "Send Verification Code" again
   - It should work now!

## 📝 Files Involved

### Database Migrations
- `015_whatsapp_notifications.sql` - Creates notification and chatbot tables
- `016_whatsapp_phone_verification.sql` - Adds phone verification columns (YOU NEED THIS!)

### Server Actions
- `lib/actions/whatsapp-setup.ts` - Phone setup and verification
- `lib/services/phone-verification.ts` - Verification code generation and sending
- `lib/services/whatsapp-chatbot.ts` - Chatbot message handling
- `lib/services/whatsapp-notifications.ts` - Notification sending

### API Routes
- `app/api/integrations/whatsapp/webhook/route.ts` - Twilio webhook handler
- `app/api/whatsapp/verify-phone/route.ts` - Phone verification API
- `app/api/whatsapp/setup/route.ts` - Phone setup API

### UI Components
- `components/whatsapp/phone-setup.tsx` - Phone setup form
- `components/whatsapp/phone-setup-card.tsx` - Setup status card
- `components/whatsapp/whatsapp-dashboard-client.tsx` - Main dashboard

## 🎯 Next Steps After Fixing

1. ✅ Run the migration (fixes your error)
2. ✅ Set up your phone number
3. ✅ Verify your phone number
4. ✅ Configure Twilio webhook URL:
   - In Twilio Console → WhatsApp → Sandbox
   - Set webhook URL to: `https://your-domain.com/api/integrations/whatsapp/webhook`
   - Or for local testing: Use ngrok or similar tunnel service
5. ✅ Test the chatbot by sending a WhatsApp message

## 🔐 Environment Variables Needed

Make sure these are set in `.env.local`:

```env
# Twilio WhatsApp
TWILIO_ACCOUNT_SID=https://console.twilio.com
TWILIO_AUTH_TOKEN=https://console.twilio.com
TWILIO_WHATSAPP_NUMBER=whatsapp:+17792436420

# Optional: Webhook secret for security
WHATSAPP_WEBHOOK_SECRET=your_secret_here

# Optional: Feature flags
WHATSAPP_PAYMENT_REMINDERS_ENABLED=true
WHATSAPP_PAYMENT_RECEIPTS_ENABLED=true
WHATSAPP_ANNOUNCEMENTS_ENABLED=true
```

## 🐛 Troubleshooting

### Error: Column doesn't exist
- **Fix:** Run migration `016_whatsapp_phone_verification.sql`

### Error: WhatsApp not configured
- **Fix:** Set Twilio environment variables in `.env.local`

### Error: Webhook not receiving messages
- **Fix:** Configure webhook URL in Twilio Console

### Error: Can't authenticate
- **Fix:** Make sure your phone number is verified in `user_profiles`


