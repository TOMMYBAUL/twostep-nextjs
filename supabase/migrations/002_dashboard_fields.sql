-- Add dashboard-required fields to merchants
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('pending', 'active', 'suspended'));
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS siret TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS opening_hours JSONB;
