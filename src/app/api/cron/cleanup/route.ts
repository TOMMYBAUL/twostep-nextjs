import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Vercel Cron sends GET requests
export async function GET(request: Request) {
    return handleCleanup(request);
}

export async function POST(request: Request) {
    return handleCleanup(request);
}

async function handleCleanup(request: Request) {
    const authHeader = request.headers.get("authorization");
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase.rpc("cleanup_old_feed_events");

    if (error) {
        return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, cleaned_at: new Date().toISOString() });
}
