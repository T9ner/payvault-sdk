-- Revert environment column addition.
ALTER TABLE provider_credentials
  DROP CONSTRAINT IF EXISTS provider_credentials_merchant_provider_env_key;

ALTER TABLE provider_credentials
  ADD CONSTRAINT provider_credentials_merchant_id_provider_key
    UNIQUE (merchant_id, provider);

ALTER TABLE provider_credentials
  DROP COLUMN IF EXISTS environment;
