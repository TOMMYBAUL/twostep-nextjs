-- Auto-delete feed_events older than 30 days
CREATE OR REPLACE FUNCTION cleanup_old_feed_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM feed_events WHERE created_at < now() - interval '30 days';
    DELETE FROM intent_signals WHERE expires_at < now();
END;
$$;

-- Index for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_feed_events_created_at ON feed_events (created_at);
CREATE INDEX IF NOT EXISTS idx_intent_signals_expires_at ON intent_signals (expires_at);
