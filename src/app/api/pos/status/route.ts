import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

export type PosSyncState = "ok" | "problem" | "none";
export type PosProblemReason = "token_expired" | "api_error" | "stale_sync" | null;

interface PosStatusResponse {
    profile: "A" | "B" | "C";
    pos_type: string | null;
    state: PosSyncState;
    last_sync_at: string | null;
    last_sync_status: string | null;
    last_sync_error: string | null;
    products_synced_count: number | null;
    problem_reason: PosProblemReason;
}

const STALE_SYNC_HOURS = 6;

export async function GET(request: NextRequest) {
    const limited = await rateLimit(request.headers.get("x-forwarded-for") ?? null, "pos:status", 120);
    if (limited) return limited;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: merchant } = await supabase
        .from("merchants")
        .select("id, pos_type")
        .eq("user_id", user.id)
        .maybeSingle();

    if (!merchant) return NextResponse.json({ error: "No merchant" }, { status: 404 });

    const { data: connection } = await supabase
        .from("pos_connections")
        .select("provider, last_sync_at, last_sync_status, last_sync_error, expires_at")
        .eq("merchant_id", merchant.id)
        .order("last_sync_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

    const headers = { "Cache-Control": "private, max-age=30" } as const;

    if (!connection) {
        const payload: PosStatusResponse = {
            profile: "B",
            pos_type: null,
            state: "none",
            last_sync_at: null,
            last_sync_status: null,
            last_sync_error: null,
            products_synced_count: null,
            problem_reason: null,
        };
        return NextResponse.json(payload, { headers });
    }

    // Count products tied to this merchant (informational)
    const { count: productsSyncedCount } = await supabase
        .from("products")
        .select("*", { count: "exact", head: true })
        .eq("merchant_id", merchant.id)
        .is("archived_at", null);

    let state: PosSyncState = "ok";
    let problem: PosProblemReason = null;

    if (connection.last_sync_status === "error") {
        state = "problem";
        problem = "api_error";
    } else if (connection.expires_at && new Date(connection.expires_at).getTime() < Date.now()) {
        state = "problem";
        problem = "token_expired";
    } else if (!connection.last_sync_at) {
        state = "problem";
        problem = "stale_sync";
    } else {
        const ageMs = Date.now() - new Date(connection.last_sync_at).getTime();
        if (ageMs > STALE_SYNC_HOURS * 3600 * 1000) {
            state = "problem";
            problem = "stale_sync";
        }
    }

    const payload: PosStatusResponse = {
        profile: "A",
        pos_type: connection.provider ?? merchant.pos_type,
        state,
        last_sync_at: connection.last_sync_at,
        last_sync_status: connection.last_sync_status,
        last_sync_error: connection.last_sync_error,
        products_synced_count: productsSyncedCount ?? null,
        problem_reason: problem,
    };
    return NextResponse.json(payload, { headers });
}
