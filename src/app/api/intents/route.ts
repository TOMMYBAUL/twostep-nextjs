import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { sendIntentEmail } from "@/lib/email/resend";
import { sendPushToUser } from "@/lib/push-send";

export async function GET(request: NextRequest) {
    const limited = await rateLimit(request.headers.get("x-forwarded-for") ?? null, "intents", 30);
    if (limited) return limited;

    const productId = request.nextUrl.searchParams.get("product_id");
    if (!productId) {
        return NextResponse.json({ count: 0 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Count active intents for this product (exclude current user)
    const admin = createAdminClient();
    let query = admin
        .from("intent_signals")
        .select("id", { count: "exact", head: true })
        .eq("product_id", productId)
        .eq("status", "active")
        .gte("expires_at", new Date().toISOString());

    if (user) {
        query = query.neq("user_id", user.id);
    }

    const { count } = await query;

    return NextResponse.json({ count: count ?? 0 });
}

export async function POST(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { product_id, merchant_id, selected_size } = body as { product_id?: string; merchant_id?: string; selected_size?: string };

    if (!product_id || !merchant_id) {
        return NextResponse.json({ error: "Missing product_id or merchant_id" }, { status: 400 });
    }

    // Rate limit: max 5 signals per user per hour
    const admin = createAdminClient();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
        .from("intent_signals")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", oneHourAgo);

    if ((count ?? 0) >= 5) {
        return NextResponse.json({ error: "Rate limit: max 5 signals per hour" }, { status: 429 });
    }

    // Insert the signal
    const { data: signal, error } = await admin
        .from("intent_signals")
        .insert({
            user_id: user.id,
            product_id,
            merchant_id,
            selected_size: selected_size ?? null,
        })
        .select("id, expires_at")
        .single();

    if (error) {
        return NextResponse.json({ error: "Failed to create signal" }, { status: 500 });
    }

    // Fetch product name, merchant info, and user display name — in parallel
    const [productRes, merchantRes] = await Promise.all([
        admin.from("products").select("name").eq("id", product_id).single(),
        admin.from("merchants").select("id, name, user_id").eq("id", merchant_id).single(),
    ]);

    const productName = productRes.data?.name ?? "un produit";
    const merchantName = merchantRes.data?.name ?? "votre boutique";
    const merchantUserId = merchantRes.data?.user_id;

    // Get user display name from consumer profile or email
    const { data: profile } = await admin
        .from("consumer_profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .single();
    const userName = profile?.display_name || user.email?.split("@")[0] || "Un client";

    // Get merchant email from auth.users
    const merchantEmail = merchantUserId
        ? (await admin.auth.admin.getUserById(merchantUserId)).data?.user?.email
        : null;

    // Send notifications (fire-and-forget, don't block the response)
    const sizeText = selected_size ? ` en taille ${selected_size}` : "";

    // 1. Email
    if (merchantEmail) {
        sendIntentEmail(merchantEmail, merchantName, userName, productName, selected_size ?? null).catch(() => {});
    }

    // 2. Push notification to merchant
    if (merchantUserId) {
        sendPushToUser(merchantUserId, {
            title: `${userName} arrive !`,
            body: `${productName}${sizeText} — il/elle sera là d'ici ~1h`,
            url: "/dashboard",
        }).catch(() => {});
    }

    return NextResponse.json({ intent_id: signal.id, expires_at: signal.expires_at }, { status: 201 });
}
