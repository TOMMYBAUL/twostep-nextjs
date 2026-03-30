-- Merchant stories: optional photo + text, visible 48h (Instagram-style)
CREATE TABLE merchant_stories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    caption TEXT CHECK (char_length(caption) <= 280),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '48 hours'
);

ALTER TABLE merchant_stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stories_insert_own" ON merchant_stories
    FOR INSERT TO authenticated
    WITH CHECK (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

CREATE POLICY "stories_delete_own" ON merchant_stories
    FOR DELETE TO authenticated
    USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

CREATE POLICY "stories_select_active" ON merchant_stories
    FOR SELECT USING (expires_at > NOW());

CREATE INDEX idx_stories_merchant ON merchant_stories(merchant_id, created_at DESC);
CREATE INDEX idx_stories_active ON merchant_stories(expires_at);

-- Create storage bucket for story images
INSERT INTO storage.buckets (id, name, public) VALUES ('stories', 'stories', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: merchants can upload to their folder
CREATE POLICY "stories_upload" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'stories');

CREATE POLICY "stories_read" ON storage.objects
    FOR SELECT USING (bucket_id = 'stories');

CREATE POLICY "stories_delete_own" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'stories');
