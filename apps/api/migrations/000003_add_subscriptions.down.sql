DROP TABLE IF EXISTS subscription_events CASCADE;
DROP TABLE IF EXISTS subscription_items CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS plan_prices CASCADE;
DROP TABLE IF EXISTS plans CASCADE;

-- Recreate original primitive table
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
