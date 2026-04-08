CREATE OR REPLACE FUNCTION claim_image_jobs(p_limit int DEFAULT 5)
RETURNS SETOF image_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    UPDATE image_jobs
    SET status = 'processing', updated_at = now()
    WHERE id IN (
        SELECT id FROM image_jobs
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT p_limit
        FOR UPDATE SKIP LOCKED
    )
    RETURNING *;
END;
$$;
