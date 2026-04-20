import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

interface ClotureBody {
    variants_marked_out?: number;
    duration_seconds?: number;
}

export async function POST(request: NextRequest) {
    const limited = await rateLimit(request.headers.get("x-forwarded-for") ?? null, "stock:cloture", 10);
    if (limited) return limited;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: merchant } = await supabase
        .from("merchants")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
    if (!merchant) return NextResponse.json({ error: "No merchant" }, { status: 404 });

    let body: ClotureBody;
    try {
        body = (await request.json()) as ClotureBody;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const markedOut = Math.max(0, Math.floor(body.variants_marked_out ?? 0));
    const durationSeconds = body.duration_seconds != null
        ? Math.max(0, Math.floor(body.duration_seconds))
        : null;
    const today = new Date().toISOString().slice(0, 10);

    const { error } = await supabase
        .from("cloture_sessions")
        .upsert({
            merchant_id: merchant.id,
            session_date: today,
            started_at: new Date().toISOString(),
            finished_at: new Date().toISOString(),
            variants_marked_out: markedOut,
            duration_seconds: durationSeconds,
        }, { onConflict: "merchant_id,session_date" });

    if (error) {
        return NextResponse.json({ error: "Failed to save session" }, { status: 500 });
    }

    // Compute streak: consecutive days ending today where a session exists.
    const { data: recentSessions } = await supabase
        .from("cloture_sessions")
        .select("session_date")
        .eq("merchant_id", merchant.id)
        .lte("session_date", today)
        .order("session_date", { ascending: false })
        .limit(60);

    let streak = 0;
    if (recentSessions && recentSessions.length > 0) {
        const dates = new Set(recentSessions.map((s) => s.session_date as string));
        const cursor = new Date(today + "T00:00:00Z");
        while (true) {
            const key = cursor.toISOString().slice(0, 10);
            if (!dates.has(key)) break;
            streak += 1;
            cursor.setUTCDate(cursor.getUTCDate() - 1);
        }
    }

    return NextResponse.json({ streak });
}
