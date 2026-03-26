-- Add avatar URL to consumer profiles
ALTER TABLE consumer_profiles
    ADD COLUMN IF NOT EXISTS avatar_url TEXT;
