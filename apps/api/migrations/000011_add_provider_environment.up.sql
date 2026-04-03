-- Add environment column to provider_credentials.
-- This allows a merchant to store *separate* test and live provider keys.
-- The composite unique key is now (merchant_id, provider, environment).

-- 1. Add the column with a safe default so existing rows become 'live'
ALTER TABLE provider_credentials
  ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'live';

-- 2. Drop the old unique constraint (merchant_id, provider) and replace with
--    the new triple-unique so both test + live creds can coexist.
ALTER TABLE provider_credentials
  DROP CONSTRAINT IF EXISTS provider_credentials_merchant_id_provider_key;

ALTER TABLE provider_credentials
  ADD CONSTRAINT provider_credentials_merchant_provider_env_key
    UNIQUE (merchant_id, provider, environment);
