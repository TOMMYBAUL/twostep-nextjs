-- Fix coach_tips: only service_role should insert (not any authenticated user)
DROP POLICY IF EXISTS "Service role can insert tips" ON coach_tips;
CREATE POLICY "Service role can insert tips"
    ON coach_tips FOR INSERT
    WITH CHECK (false);

-- Fix achievements: only service_role should insert
DROP POLICY IF EXISTS "Service can insert achievements" ON achievements;
CREATE POLICY "Service can insert achievements"
    ON achievements FOR INSERT
    WITH CHECK (false);
