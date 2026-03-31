-- Drop stories feature (replaced by social links)
DROP TABLE IF EXISTS merchant_stories CASCADE;

-- Drop storage bucket and policies
DELETE FROM storage.objects WHERE bucket_id = 'stories';
DELETE FROM storage.buckets WHERE id = 'stories';
