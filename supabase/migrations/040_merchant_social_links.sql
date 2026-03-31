-- Add dedicated social link columns
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS instagram_url TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS tiktok_url TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS website_url TEXT;
