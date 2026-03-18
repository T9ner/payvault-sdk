ALTER TABLE merchants DROP COLUMN github_id;
ALTER TABLE merchants DROP COLUMN avatar_url;
ALTER TABLE merchants ALTER COLUMN password_hash SET NOT NULL;
