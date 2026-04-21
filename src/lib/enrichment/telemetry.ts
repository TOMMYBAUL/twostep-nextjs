import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Cache telemetry — instrument the proprietary `ean_lookups` cache.
 *
 * `logCacheHit(ean)` increments `hit_count` and updates `last_hit_at`
 * atomically via the `increment_ean_hit_count` RPC (migration 082).
 *
 * `logCacheMiss(ean, source)` is pure observability (console.log) — no DB write.
 *
 * Failures are swallowed: telemetry must never break the main flow.
 */

export async function logCacheHit(ean: string): Promise<void> {
    if (!ean) return;

    try {
        const supabase = createAdminClient();
        await supabase.rpc("increment_ean_hit_count", { p_ean: ean });
    } catch {
        // Telemetry must never throw
    }
}

export function logCacheMiss(ean: string, source: string): void {
    if (!ean) return;
    console.log(`[cache:miss] ean=${ean} source=${source}`);
}
