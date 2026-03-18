-- This drops the explicit explicit rules schemas
DROP TABLE IF EXISTS fraud_events CASCADE;
DROP TABLE IF EXISTS fraud_rules CASCADE;

-- Restores the legacy heuristics schema from 000001
CREATE TABLE fraud_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id),
    transaction_id  UUID REFERENCES transactions(id),
    rule_name       VARCHAR(100) NOT NULL,
    risk_score      DECIMAL(5,2) NOT NULL,
    action          VARCHAR(20) NOT NULL DEFAULT 'allow',
    details         JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fraud_events_merchant ON fraud_events(merchant_id);
CREATE INDEX idx_fraud_events_transaction ON fraud_events(transaction_id);

CREATE TABLE fraud_rules (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id),
    rule_name       VARCHAR(100) NOT NULL,
    is_enabled      BOOLEAN NOT NULL DEFAULT true,
    action          VARCHAR(20) NOT NULL DEFAULT 'flag',
    config          JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(merchant_id, rule_name)
);
