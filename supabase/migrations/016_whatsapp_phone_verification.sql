-- WhatsApp Phone Verification Migration
-- Adds phone verification fields to user_profiles table

-- Add phone verification fields to user_profiles
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS phone_verification_code TEXT,
ADD COLUMN IF NOT EXISTS phone_verification_expires_at TIMESTAMPTZ;

-- Create index for phone lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_phone ON user_profiles(phone) WHERE phone IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN user_profiles.phone_verified IS 'Whether the phone number has been verified via WhatsApp';
COMMENT ON COLUMN user_profiles.phone_verification_code IS 'Temporary verification code sent via WhatsApp';
COMMENT ON COLUMN user_profiles.phone_verification_expires_at IS 'Expiration time for the verification code';


