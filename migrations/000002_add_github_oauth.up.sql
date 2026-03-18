ALTER TABLE merchants ADD COLUMN github_id BIGINT UNIQUE;
ALTER TABLE merchants ADD COLUMN avatar_url TEXT;
ALTER TABLE merchants ALTER COLUMN password_hash DROP NOT NULL;
