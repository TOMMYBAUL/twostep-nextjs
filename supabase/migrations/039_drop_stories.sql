-- Drop stories feature (replaced by social links)
DROP TABLE IF EXISTS merchant_stories CASCADE;

-- NOTE: Storage bucket 'stories' must be deleted manually via Supabase dashboard
-- (Storage > stories > Delete all files > Delete bucket)
-- Supabase blocks direct DELETE on storage tables for safety.
