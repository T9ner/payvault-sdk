DROP TABLE IF EXISTS webhook_logs CASCADE;

ALTER TABLE merchants DROP COLUMN IF EXISTS webhook_url;
ALTER TABLE merchants DROP COLUMN IF EXISTS webhook_secret;
