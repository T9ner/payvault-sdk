-- Drop the legacy heuristical tables if they exist
DROP TABLE IF EXISTS fraud_events CASCADE;
DROP TABLE IF EXISTS fraud_rules CASCADE;

-- Create the new simplified explicit fraud_rules table
CREATE TABLE fraud_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id),
    rule_type VARCHAR(50) NOT NULL,
    threshold INT NOT NULL DEFAULT 0,
    action VARCHAR(20) NOT NULL DEFAULT 'flag',
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(merchant_id, rule_type)
);

-- Create the corresponding new fraud_events block
CREATE TABLE fraud_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id),
    transaction_id UUID NOT NULL,
    rule_type VARCHAR(50) NOT NULL,
    risk_score INT NOT NULL DEFAULT 0,
    action_taken VARCHAR(20) NOT NULL DEFAULT 'flag',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Essential indices for analytical querying and rule enforcement
CREATE INDEX idx_fraud_rules_merchant ON fraud_rules(merchant_id);
CREATE INDEX idx_fraud_events_merchant ON fraud_events(merchant_id);
CREATE INDEX idx_fraud_events_transaction ON fraud_events(transaction_id);
