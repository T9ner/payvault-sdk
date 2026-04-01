DROP INDEX IF EXISTS idx_subscriptions_merchant;
ALTER TABLE subscriptions DROP COLUMN IF EXISTS merchant_id;
