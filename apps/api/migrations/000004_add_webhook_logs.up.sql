-- Drop legacy webhooks table if it exists
DROP TABLE IF EXISTS webhooks CASCADE;

-- Add webhook configuration to merchants table
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS webhook_url TEXT DEFAULT '';
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS webhook_secret VARCHAR(64) DEFAULT '';

-- Create webhook logs table
CREATE TABLE webhook_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    url TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    response_code INT NOT NULL DEFAULT 0,
    response_body TEXT DEFAULT '',
    attempts INT NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_logs_merchant ON webhook_logs(merchant_id);
CREATE INDEX idx_webhook_logs_status ON webhook_logs(status);
