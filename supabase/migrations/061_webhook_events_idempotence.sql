-- Webhook idempotence: track processed webhook IDs to prevent double-processing
CREATE TABLE IF NOT EXISTS webhook_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id text NOT NULL,
    provider text NOT NULL,
    created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_webhook_events_unique ON webhook_events (webhook_id, provider);

-- Auto-cleanup: remove entries older than 7 days (webhooks won't retry after that)
CREATE INDEX idx_webhook_events_created ON webhook_events (created_at);

-- No RLS needed — only accessed by admin client in webhook handlers
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- Add webhook_events cleanup to existing cleanup function
CREATE OR REPLACE FUNCTION cleanup_old_feed_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM feed_events WHERE created_at < now() - interval '30 days';
    DELETE FROM intent_signals WHERE expires_at < now();
    DELETE FROM webhook_events WHERE created_at < now() - interval '7 days';
END;
$$;
