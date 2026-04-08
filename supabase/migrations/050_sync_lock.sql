ALTER TABLE pos_connections ADD COLUMN IF NOT EXISTS syncing_since timestamptz DEFAULT NULL;
