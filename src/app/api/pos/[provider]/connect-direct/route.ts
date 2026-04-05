import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { POS_PROVIDERS, type POSProvider } from "@/lib/pos/index";
import { encrypt } from "@/lib/email/encryption";
import { syncMerchantPOS } from "@/lib/pos/sync-engine";
import { captureError } from "@/lib/error";
import { testClictillConnection } from "@/lib/pos/clictill";
import { testFastmagConnection } from "@/lib/pos/fastmag";

// Direct token connection for POS that don't use OAuth (Clictill, Fastmag)
// Merchant submits their API credentials via dashboard form

const DIRECT_AUTH_PROVIDERS = ["clictill", "fastmag"] as const;

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ provider: string }> },
) {
    const { provider } = await params;

    if (!POS_PROVIDERS.includes(provider as POSProvider)) {
        return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
    }

    if (!DIRECT_AUTH_PROVIDERS.includes(provider as typeof DIRECT_AUTH_PROVIDERS[number])) {
        return NextResponse.json(
            { error: `${provider} uses OAuth, not direct credentials` },
            { status: 400 },
        );
    }

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

    try {
        const body = await request.json();

        // Validate credentials structure based on provider
        const credentials = validateCredentials(provider, body);

        // Test connection BEFORE saving — fail fast with clear error
        if (provider === "clictill") {
            const test = await testClictillConnection(credentials as Parameters<typeof testClictillConnection>[0]);
            if (!test.ok) {
                return NextResponse.json({ error: test.error }, { status: 422 });
            }
        } else if (provider === "fastmag") {
            const test = await testFastmagConnection(credentials as Parameters<typeof testFastmagConnection>[0]);
            if (!test.ok) {
                return NextResponse.json({ error: test.error }, { status: 422 });
            }
        }

        // Store as encrypted JSON string in access_token field
        const accessTokenJson = JSON.stringify(credentials);

        const { error: connError } = await supabase
            .from("pos_connections")
            .upsert({
                merchant_id: merchant.id,
                provider,
                access_token: encrypt(accessTokenJson),
                refresh_token: null, // Direct auth doesn't use refresh tokens
                expires_at: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString(), // No expiry
                shop_domain: null,
            }, { onConflict: "merchant_id,provider" });

        if (connError) {
            captureError(connError, { route: `pos/${provider}/connect-direct`, merchantId: merchant.id });
            return NextResponse.json({ error: "Failed to save credentials" }, { status: 500 });
        }

        // Update merchant pos_type
        await supabase
            .from("merchants")
            .update({ pos_type: provider })
            .eq("id", merchant.id);

        // Trigger first sync (non-blocking)
        try {
            await syncMerchantPOS(merchant.id, provider);
        } catch (syncErr) {
            captureError(syncErr, { route: `pos/${provider}/connect-direct`, merchantId: merchant.id, phase: "first_sync" });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Invalid credentials";
        return NextResponse.json({ error: message }, { status: 400 });
    }
}

function validateCredentials(provider: string, body: Record<string, unknown>): Record<string, unknown> {
    if (provider === "clictill") {
        const { baseUrl, tokenArticle, tokenStock, tokenMarkdown, tokenClassSub, shopCode } = body;
        if (!baseUrl || !tokenArticle || !tokenStock) {
            throw new Error("Clictill requires: baseUrl, tokenArticle, tokenStock");
        }
        return {
            baseUrl: String(baseUrl),
            tokenArticle: String(tokenArticle),
            tokenStock: String(tokenStock),
            tokenMarkdown: tokenMarkdown ? String(tokenMarkdown) : undefined,
            tokenClassSub: tokenClassSub ? String(tokenClassSub) : undefined,
            shopCode: shopCode ? String(shopCode) : undefined,
        };
    }

    if (provider === "fastmag") {
        const { baseUrl, enseigne, magasin, compte, motpasse, useBoa } = body;
        if (!baseUrl || !enseigne || !magasin || !compte || !motpasse) {
            throw new Error("Fastmag requires: baseUrl, enseigne, magasin, compte, motpasse");
        }
        return {
            baseUrl: String(baseUrl),
            enseigne: String(enseigne),
            magasin: String(magasin),
            compte: String(compte),
            motpasse: String(motpasse),
            useBoa: Boolean(useBoa),
        };
    }

    throw new Error(`No direct auth for provider: ${provider}`);
}
