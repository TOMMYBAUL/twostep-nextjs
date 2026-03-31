import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id: merchantId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify merchant ownership
    const { data: merchant } = await supabase
        .from("merchants")
        .select("id")
        .eq("id", merchantId)
        .eq("user_id", user.id)
        .single();

    if (!merchant) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch active (non-expired) intent signals
    const { data: intents } = await supabase
        .from("intent_signals")
        .select("id, selected_size, created_at, expires_at, products(name, canonical_name, photo_url, photo_processed_url), consumer_profiles:user_id(display_name)")
        .eq("merchant_id", merchantId)
        .eq("status", "active")
        .gte("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(20);

    return NextResponse.json({ intents: intents ?? [] });
}
