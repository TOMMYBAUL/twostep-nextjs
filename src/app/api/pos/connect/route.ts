import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { squareAdapter } from "@/lib/pos/square";
import { lightspeedAdapter } from "@/lib/pos/lightspeed";
import { shopifyAdapter } from "@/lib/pos/shopify";
import { encrypt } from "@/lib/email/encryption";
import type { IPOSAdapter } from "@/lib/pos/types";

const adapters: Record<string, IPOSAdapter> = {
    square: squareAdapter,
    lightspeed: lightspeedAdapter,
    shopify: shopifyAdapter,
};

export async function POST(request: NextRequest) {
    try {
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

        let body: Record<string, unknown>;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const { provider, code } = body as { provider: string; code: string };

        if (!provider || typeof provider !== "string") {
            return NextResponse.json({ error: "provider is required" }, { status: 400 });
        }

        if (!code || typeof code !== "string") {
            return NextResponse.json({ error: "code is required" }, { status: 400 });
        }

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
                    access_token: encrypt(tokens.access_token),
                    refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
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
        } catch {
            return NextResponse.json({ error: "OAuth exchange failed" }, { status: 500 });
        }
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    try {
        const code = request.nextUrl.searchParams.get("code");
        const state = request.nextUrl.searchParams.get("state");
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

        // --- OAuth callback (POS redirects back with code + state) ---
        if (code && state) {
            const colonIdx = state.indexOf(":");
            if (colonIdx === -1) {
                return NextResponse.redirect(`${baseUrl}/dashboard/settings?error=invalid_state`);
            }

            const provider = state.slice(0, colonIdx);
            const merchantId = state.slice(colonIdx + 1);
            const adapter = adapters[provider];

            if (!adapter) {
                return NextResponse.redirect(`${baseUrl}/dashboard/settings?error=unknown_provider`);
            }

            try {
                const tokens = await adapter.exchangeCode(code);

                const supabase = await createClient();

                await supabase
                    .from("merchant_pos_credentials")
                    .upsert({
                        merchant_id: merchantId,
                        access_token: encrypt(tokens.access_token),
                        refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
                        expires_at: tokens.expires_at,
                        extra: {},
                    });

                await supabase
                    .from("merchants")
                    .update({ pos_type: provider })
                    .eq("id", merchantId);

                return NextResponse.redirect(`${baseUrl}/dashboard/settings?pos=connected`);
            } catch {
                return NextResponse.redirect(`${baseUrl}/dashboard/settings?error=oauth_failed`);
            }
        }

        // --- Generate auth URL (frontend requests it) ---
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
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
