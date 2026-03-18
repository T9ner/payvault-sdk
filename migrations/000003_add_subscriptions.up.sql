-- ============ CLEAN UP OLD TABLE ============
-- The init schema had a basic 'subscriptions' table. We drop it if it hasn't been used.
DROP TABLE IF EXISTS subscriptions CASCADE;

-- ============ PLANS ============
CREATE TABLE plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id),
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_plans_merchant ON plans(merchant_id);
CREATE INDEX idx_plans_active ON plans(merchant_id, active);

-- ============ PLAN PRICES ============
-- A plan can have multiple prices (monthly NGN, yearly NGN, monthly USD, etc.)
CREATE TABLE plan_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    nickname VARCHAR(255) DEFAULT '',
    amount BIGINT NOT NULL,               -- minor units (kobo/pesewas/cents)
    currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
    interval VARCHAR(20) NOT NULL DEFAULT 'monthly',  -- daily, weekly, monthly, yearly
    interval_count INTEGER NOT NULL DEFAULT 1,         -- every N intervals
    trial_period_days INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_plan_prices_plan ON plan_prices(plan_id);
CREATE INDEX idx_plan_prices_active ON plan_prices(plan_id, active);

-- ============ SUBSCRIPTIONS ============
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES plans(id),
    price_id UUID NOT NULL REFERENCES plan_prices(id),
    customer_email VARCHAR(255) NOT NULL,
    customer_name VARCHAR(255) DEFAULT '',
    
    -- Status lifecycle
    status VARCHAR(30) NOT NULL DEFAULT 'incomplete',
    -- Valid: trialing, active, past_due, unpaid, cancellation_scheduled, canceled, incomplete, incomplete_expired
    
    -- Billing cycle
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end TIMESTAMPTZ NOT NULL,
    billing_cycle_anchor INTEGER NOT NULL,  -- day of month (1-31) that billing recurs on
    
    -- Trial
    trial_end TIMESTAMPTZ,                  -- null = no trial
    
    -- Cancellation
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
    cancel_scheduled_at TIMESTAMPTZ,        -- when merchant/customer requested cancellation
    canceled_at TIMESTAMPTZ,                -- when subscription actually terminated
    cancellation_reason TEXT,
    
    -- Adjustment scheduling
    scheduled_adjustment JSONB,             -- pending plan change at period end
    scheduled_adjustment_at TIMESTAMPTZ,    -- when adjustment was scheduled
    
    -- Payment provider tracking
    provider VARCHAR(20) NOT NULL,          -- 'paystack' or 'flutterwave'
    provider_subscription_id VARCHAR(255),  -- subscription ID on the provider
    provider_customer_code VARCHAR(255),    -- customer code/ID on the provider
    provider_authorization_code VARCHAR(255), -- saved card auth for recurring charges
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_plan ON subscriptions(plan_id);
CREATE INDEX idx_subscriptions_price ON subscriptions(price_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_customer ON subscriptions(customer_email);
CREATE INDEX idx_subscriptions_provider ON subscriptions(provider, provider_subscription_id);
CREATE INDEX idx_subscriptions_period_end ON subscriptions(current_period_end) 
    WHERE status IN ('active', 'trialing', 'cancellation_scheduled');

-- ============ SUBSCRIPTION ITEMS ============
-- Enables multi-line subscriptions (base plan + add-ons)
CREATE TABLE subscription_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    price_id UUID NOT NULL REFERENCES plan_prices(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_amount BIGINT NOT NULL,           -- snapshot of price at time of addition
    currency VARCHAR(3) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscription_items_sub ON subscription_items(subscription_id);

-- ============ SUBSCRIPTION EVENTS LOG ============
-- Audit trail for all subscription lifecycle events
CREATE TABLE subscription_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, 
    -- Types: created, activated, trial_started, trial_ended, payment_succeeded, 
    --        payment_failed, past_due, canceled, cancellation_scheduled, 
    --        cancellation_reversed, adjusted, period_advanced, expired
    previous_status VARCHAR(30),
    new_status VARCHAR(30),
    details JSONB DEFAULT '{}',            -- event-specific data (e.g., adjustment details, failure reason)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sub_events_sub ON subscription_events(subscription_id);
CREATE INDEX idx_sub_events_type ON subscription_events(event_type);
