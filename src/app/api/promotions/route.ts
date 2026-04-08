import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { promotionBody, parseBody } from "@/lib/validation";
import { notifyMerchantFollowers } from "@/lib/push-send";
import { rateLimit } from "@/lib/rate-limit";

export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Resolve the merchant belonging to this authenticated user
        const { data: merchant } = await supabase
            .from("merchants")
            .select("id")
            .eq("user_id", user.id)
            .single();

        if (!merchant) {
            return NextResponse.json({ error: "Merchant not found" }, { status: 403 });
        }

        const { data: products } = await supabase.from("products").select("id").eq("merchant_id", merchant.id);
        const productIds = (products ?? []).map((p) => p.id);

        if (productIds.length === 0) {
            return NextResponse.json({ promotions: [] });
        }

        const { data, error } = await supabase
            .from("promotions")
            .select("*, products(name, canonical_name, price, photo_url, merchant_id)")
            .in("product_id", productIds)
            .or("ends_at.is.null,ends_at.gt.now()")
            .order("created_at", { ascending: false });

        if (error) {
            return NextResponse.json({ error: "Operation failed" }, { status: 500 });
        }

        return NextResponse.json({ promotions: data ?? [] });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const limited = await rateLimit(request.headers.get("x-forwarded-for") ?? null, "promotions:post", 10);
    if (limited) return limited;

    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const parsed = await parseBody(request, promotionBody);
        if ("error" in parsed) return parsed.error;
        const { product_id, sale_price, starts_at, ends_at } = parsed.data;

        // Verify ownership: product must belong to user's merchant
        const { data: product } = await supabase
            .from("products")
            .select("merchant_id, price, merchants!inner(user_id)")
            .eq("id", product_id)
            .single();

        if (!product || (product as any).merchants?.user_id !== user.id) {
            return NextResponse.json({ error: "Product not found or unauthorized" }, { status: 404 });
        }

        if (product.price && sale_price >= product.price) {
            return NextResponse.json({ error: "Le prix promo doit être inférieur au prix du produit" }, { status: 400 });
        }

        const { data, error } = await supabase
            .from("promotions")
            .insert({
                product_id,
                sale_price,
                starts_at: starts_at ?? new Date().toISOString(),
                ends_at: ends_at ?? null,
            })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: "Failed to create promotion" }, { status: 500 });
        }

        // Emit feed_event for new promo (product already verified above)
        {
            const adminSupabase = createAdminClient();
            await adminSupabase.from("feed_events").insert({
                merchant_id: product.merchant_id,
                product_id,
                event_type: "new_promo",
            });
        }

        // Push notification to merchant followers
        const adminSupabase2 = createAdminClient();
        const { data: productInfo } = await adminSupabase2
            .from("products")
            .select("name")
            .eq("id", product_id)
            .single();
        notifyMerchantFollowers(product.merchant_id, {
            title: "Nouvelle promo !",
            body: `${productInfo?.name ?? "Un produit"} à ${sale_price}€`,
            url: `/product/${product_id}`,
        }).catch(() => {});

        return NextResponse.json({ promotion: data }, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
