import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { squareAdapter } from "@/lib/pos/square";
import { lightspeedAdapter } from "@/lib/pos/lightspeed";
import { shopifyAdapter } from "@/lib/pos/shopify";
import type { IPOSAdapter } from "@/lib/pos/types";

const adapters: Record<string, IPOSAdapter> = {
    square: squareAdapter,
    lightspeed: lightspeedAdapter,
    shopify: shopifyAdapter,
};

export async function POST(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: merchant } = await supabase
        .from("merchants")
        .select("id")
        .eq("user_id", user.id)
        .single();

    if (!merchant) {
        return NextResponse.json({ error: "No merchant profile" }, { status: 403 });
    }

    const body = await request.json();
    const { provider, code } = body as { provider: string; code: string };

    const adapter = adapters[provider];
    if (!adapter) {
        return NextResponse.json({ error: `Unknown POS provider: ${provider}` }, { status: 400 });
    }

    try {
        const tokens = await adapter.exchangeCode(code);

        const { error: credError } = await supabase
            .from("merchant_pos_credentials")
            .upsert({
                merchant_id: merchant.id,
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                expires_at: tokens.expires_at,
                extra: {},
            });

        if (credError) {
            return NextResponse.json({ error: "Failed to store credentials" }, { status: 500 });
        }

        const { error: merchError } = await supabase
            .from("merchants")
            .update({ pos_type: provider })
            .eq("id", merchant.id);

        if (merchError) {
            return NextResponse.json({ error: "Failed to update merchant" }, { status: 500 });
        }

        return NextResponse.json({ ok: true });
    } catch (err) {
        return NextResponse.json({ error: `OAuth exchange failed: ${err}` }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: merchant } = await supabase
        .from("merchants")
        .select("id")
        .eq("user_id", user.id)
        .single();
    if (!merchant) return NextResponse.json({ error: "No merchant" }, { status: 404 });

    const provider = request.nextUrl.searchParams.get("provider") ?? "square";
    const adapter = adapters[provider];
    if (!adapter) return NextResponse.json({ error: "Unknown provider" }, { status: 400 });

    const authUrl = adapter.getAuthUrl(merchant.id);
    return NextResponse.json({ auth_url: authUrl });
}
