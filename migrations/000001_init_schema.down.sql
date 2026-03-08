-- Rollback: Drop everything in reverse dependency order

DROP TRIGGER IF EXISTS trg_fraud_rules_updated ON fraud_rules;
DROP TRIGGER IF EXISTS trg_subscriptions_updated ON subscriptions;
DROP TRIGGER IF EXISTS trg_payment_links_updated ON payment_links;
DROP TRIGGER IF EXISTS trg_refunds_updated ON refunds;
DROP TRIGGER IF EXISTS trg_transactions_updated ON transactions;
DROP TRIGGER IF EXISTS trg_merchant_settings_updated ON merchant_settings;
DROP TRIGGER IF EXISTS trg_merchant_providers_updated ON merchant_providers;
DROP TRIGGER IF EXISTS trg_merchants_updated ON merchants;

DROP FUNCTION IF EXISTS update_updated_at;

DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS fraud_rules;
DROP TABLE IF EXISTS fraud_events;
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS payment_links;
DROP TABLE IF EXISTS webhooks;
DROP TABLE IF EXISTS refunds;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS merchant_settings;
DROP TABLE IF EXISTS merchant_providers;
DROP TABLE IF EXISTS api_keys;
DROP TABLE IF EXISTS merchants;

DROP TYPE IF EXISTS merchant_role;
DROP TYPE IF EXISTS link_type;
DROP TYPE IF EXISTS fraud_action;
DROP TYPE IF EXISTS subscription_status;
DROP TYPE IF EXISTS webhook_status;
DROP TYPE IF EXISTS payment_channel;
DROP TYPE IF EXISTS provider_name;
DROP TYPE IF EXISTS transaction_status;
DROP TYPE IF EXISTS environment_type;

DROP EXTENSION IF EXISTS "pgcrypto";
DROP EXTENSION IF EXISTS "uuid-ossp";
