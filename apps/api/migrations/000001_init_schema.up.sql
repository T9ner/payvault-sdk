-- PayVault Infrastructure Schema v0.1.0
-- Full platform: merchants, transactions, webhooks, payment links, subscriptions, fraud, audit

-- ════════════════════════════════════════════════════════════════
-- Extensions
-- ════════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ════════════════════════════════════════════════════════════════
-- ENUMS
-- ════════════════════════════════════════════════════════════════
CREATE TYPE environment_type AS ENUM ('test', 'live');
CREATE TYPE transaction_status AS ENUM ('pending', 'success', 'failed', 'abandoned');
CREATE TYPE provider_name AS ENUM ('paystack', 'flutterwave');
CREATE TYPE payment_channel AS ENUM ('card', 'bank_transfer', 'ussd', 'mobile_money', 'qr', 'apple_pay', 'google_pay');
CREATE TYPE webhook_status AS ENUM ('pending', 'delivered', 'failed');
CREATE TYPE subscription_status AS ENUM ('active', 'cancelled', 'expired', 'pending');
CREATE TYPE fraud_action AS ENUM ('allow', 'flag', 'block');
CREATE TYPE link_type AS ENUM ('fixed', 'flexible');
CREATE TYPE merchant_role AS ENUM ('owner', 'admin', 'viewer');

-- ════════════════════════════════════════════════════════════════
-- MERCHANTS
-- ════════════════════════════════════════════════════════════════
CREATE TABLE merchants (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    business_name   VARCHAR(255) NOT NULL,
    business_url    VARCHAR(500),
    role            merchant_role NOT NULL DEFAULT 'owner',
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_merchants_email ON merchants(email);

-- ════════════════════════════════════════════════════════════════
-- API KEYS
-- Merchants get test + live key pairs (pk_test_xxx / sk_test_xxx)
-- ════════════════════════════════════════════════════════════════
CREATE TABLE api_keys (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    prefix          VARCHAR(20) NOT NULL,       -- "pk_live", "sk_test", etc.
    key_hash        TEXT NOT NULL,               -- bcrypt hash of the full key
    last_four       VARCHAR(4) NOT NULL,         -- last 4 chars for display
    environment     environment_type NOT NULL,
    is_secret       BOOLEAN NOT NULL DEFAULT false, -- true = secret key, false = public key
    is_active       BOOLEAN NOT NULL DEFAULT true,
    last_used_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_merchant ON api_keys(merchant_id);
CREATE INDEX idx_api_keys_prefix ON api_keys(prefix);

-- ════════════════════════════════════════════════════════════════
-- MERCHANT PROVIDER CREDENTIALS (encrypted)
-- Stores merchant's Paystack/Flutterwave secret keys
-- ════════════════════════════════════════════════════════════════
CREATE TABLE merchant_providers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    provider        provider_name NOT NULL,
    environment     environment_type NOT NULL,
    secret_key_enc  TEXT NOT NULL,               -- AES-256 encrypted provider secret key
    public_key      VARCHAR(255),                -- Provider public key (not secret)
    webhook_secret_enc TEXT,                     -- Encrypted webhook verification secret
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(merchant_id, provider, environment)
);

CREATE INDEX idx_merchant_providers_lookup ON merchant_providers(merchant_id, provider, environment);

-- ════════════════════════════════════════════════════════════════
-- MERCHANT SETTINGS
-- ════════════════════════════════════════════════════════════════
CREATE TABLE merchant_settings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id     UUID NOT NULL UNIQUE REFERENCES merchants(id) ON DELETE CASCADE,
    webhook_url     VARCHAR(500),                -- Where to forward webhook events
    webhook_secret  TEXT,                        -- Secret for signing forwarded webhooks
    default_provider provider_name DEFAULT 'paystack',
    default_currency VARCHAR(3) DEFAULT 'NGN',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════
-- TRANSACTIONS
-- Every payment that flows through PayVault
-- ════════════════════════════════════════════════════════════════
CREATE TABLE transactions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id),
    reference       VARCHAR(100) NOT NULL UNIQUE, -- PayVault reference (pvt_xxx)
    provider        provider_name NOT NULL,
    provider_ref    VARCHAR(255),                 -- Provider's own reference
    environment     environment_type NOT NULL,
    status          transaction_status NOT NULL DEFAULT 'pending',
    amount          BIGINT NOT NULL,              -- Amount in minor units (kobo, pesewas)
    currency        VARCHAR(3) NOT NULL,
    channel         payment_channel,
    email           VARCHAR(255) NOT NULL,
    ip_address      VARCHAR(45),
    metadata        JSONB DEFAULT '{}',
    provider_response JSONB DEFAULT '{}',         -- Raw provider response
    authorization_url VARCHAR(500),
    paid_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_merchant ON transactions(merchant_id);
CREATE INDEX idx_transactions_reference ON transactions(reference);
CREATE INDEX idx_transactions_provider_ref ON transactions(provider_ref);
CREATE INDEX idx_transactions_status ON transactions(merchant_id, status);
CREATE INDEX idx_transactions_created ON transactions(merchant_id, created_at DESC);
CREATE INDEX idx_transactions_email ON transactions(email);

-- ════════════════════════════════════════════════════════════════
-- REFUNDS
-- ════════════════════════════════════════════════════════════════
CREATE TABLE refunds (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id),
    transaction_id  UUID NOT NULL REFERENCES transactions(id),
    provider        provider_name NOT NULL,
    provider_ref    VARCHAR(255),
    amount          BIGINT NOT NULL,              -- Refund amount in minor units
    currency        VARCHAR(3) NOT NULL,
    reason          TEXT,
    status          transaction_status NOT NULL DEFAULT 'pending',
    provider_response JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refunds_transaction ON refunds(transaction_id);
CREATE INDEX idx_refunds_merchant ON refunds(merchant_id);

-- ════════════════════════════════════════════════════════════════
-- WEBHOOKS
-- Incoming events from providers + forwarding status
-- ════════════════════════════════════════════════════════════════
CREATE TABLE webhooks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id     UUID REFERENCES merchants(id),
    provider        provider_name NOT NULL,
    environment     environment_type NOT NULL,
    event_type      VARCHAR(100) NOT NULL,        -- e.g., "charge.success"
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,  -- For deduplication
    raw_payload     JSONB NOT NULL,               -- Exact payload from provider
    normalized_event JSONB,                       -- PayVault-normalized event
    forward_status  webhook_status NOT NULL DEFAULT 'pending',
    forward_attempts INT NOT NULL DEFAULT 0,
    last_forward_at TIMESTAMPTZ,
    last_error      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhooks_merchant ON webhooks(merchant_id);
CREATE INDEX idx_webhooks_event ON webhooks(event_type);
CREATE INDEX idx_webhooks_forward_status ON webhooks(forward_status) WHERE forward_status != 'delivered';
CREATE INDEX idx_webhooks_idempotency ON webhooks(idempotency_key);

-- ════════════════════════════════════════════════════════════════
-- PAYMENT LINKS
-- ════════════════════════════════════════════════════════════════
CREATE TABLE payment_links (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id),
    slug            VARCHAR(50) NOT NULL UNIQUE,  -- Short URL slug
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    link_type       link_type NOT NULL DEFAULT 'fixed',
    amount          BIGINT,                       -- NULL if flexible
    currency        VARCHAR(3) NOT NULL DEFAULT 'NGN',
    redirect_url    VARCHAR(500),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    expires_at      TIMESTAMPTZ,
    total_paid      BIGINT NOT NULL DEFAULT 0,    -- Running total of successful payments
    total_count     INT NOT NULL DEFAULT 0,       -- Number of successful payments
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payment_links_merchant ON payment_links(merchant_id);
CREATE INDEX idx_payment_links_slug ON payment_links(slug);

-- ════════════════════════════════════════════════════════════════
-- SUBSCRIPTIONS
-- ════════════════════════════════════════════════════════════════
CREATE TABLE subscriptions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id),
    provider        provider_name NOT NULL,
    provider_code   VARCHAR(255),                 -- Provider subscription code
    plan_code       VARCHAR(255) NOT NULL,
    email           VARCHAR(255) NOT NULL,
    status          subscription_status NOT NULL DEFAULT 'pending',
    amount          BIGINT,
    currency        VARCHAR(3),
    next_payment_at TIMESTAMPTZ,
    cancelled_at    TIMESTAMPTZ,
    provider_response JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_merchant ON subscriptions(merchant_id);
CREATE INDEX idx_subscriptions_email ON subscriptions(email);
CREATE INDEX idx_subscriptions_status ON subscriptions(merchant_id, status);

-- ════════════════════════════════════════════════════════════════
-- FRAUD EVENTS
-- ════════════════════════════════════════════════════════════════
CREATE TABLE fraud_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id),
    transaction_id  UUID REFERENCES transactions(id),
    rule_name       VARCHAR(100) NOT NULL,        -- e.g., "ip_velocity", "amount_threshold"
    risk_score      DECIMAL(5,2) NOT NULL,        -- 0.00 to 100.00
    action          fraud_action NOT NULL DEFAULT 'allow',
    details         JSONB DEFAULT '{}',           -- Rule-specific details
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fraud_events_merchant ON fraud_events(merchant_id);
CREATE INDEX idx_fraud_events_transaction ON fraud_events(transaction_id);

-- ════════════════════════════════════════════════════════════════
-- FRAUD RULES (per-merchant configurable)
-- ════════════════════════════════════════════════════════════════
CREATE TABLE fraud_rules (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id),
    rule_name       VARCHAR(100) NOT NULL,
    is_enabled      BOOLEAN NOT NULL DEFAULT true,
    action          fraud_action NOT NULL DEFAULT 'flag',
    config          JSONB NOT NULL DEFAULT '{}',  -- Rule-specific thresholds
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(merchant_id, rule_name)
);

-- ════════════════════════════════════════════════════════════════
-- AUDIT LOG
-- Immutable record of all state changes
-- ════════════════════════════════════════════════════════════════
CREATE TABLE audit_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id     UUID REFERENCES merchants(id),
    actor           VARCHAR(255) NOT NULL,        -- "merchant:uuid", "system", "webhook:provider"
    action          VARCHAR(100) NOT NULL,        -- "transaction.created", "refund.processed", etc.
    resource_type   VARCHAR(50) NOT NULL,         -- "transaction", "merchant", "api_key", etc.
    resource_id     UUID,
    changes         JSONB DEFAULT '{}',           -- Before/after state diff
    ip_address      VARCHAR(45),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_merchant ON audit_log(merchant_id);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);

-- ════════════════════════════════════════════════════════════════
-- Updated_at trigger function
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER trg_merchants_updated BEFORE UPDATE ON merchants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_merchant_providers_updated BEFORE UPDATE ON merchant_providers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_merchant_settings_updated BEFORE UPDATE ON merchant_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_transactions_updated BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_refunds_updated BEFORE UPDATE ON refunds FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_payment_links_updated BEFORE UPDATE ON payment_links FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_subscriptions_updated BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_fraud_rules_updated BEFORE UPDATE ON fraud_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
