import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { favoriteBody, parseBody } from "@/lib/validation";
import { consumerM5Enabled, resolveConsumerConfidence } from "@/lib/stock/consumer-confidence";

export async function GET(request: NextRequest) {
    try {
        const limited = await rateLimit(request.headers.get("x-forwarded-for") ?? null, "favorites", 30);
        if (limited) return limited;

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ favorites: [] });
        }

        const { data, error } = await supabase
            .from("user_favorites")
            .select("*, products(*, stock(quantity), merchants(name, address, city))")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });

        if (error) {
            return NextResponse.json({ error: "Failed to fetch favorites" }, { status: 500 });
        }

        let favorites = data ?? [];

        // P0-4 : verdict M5 par produit favori — le badge ne dit plus « Stock
        // vérifié » sur le seul compteur. Champ additif dans `products`, flag-gaté.
        if (consumerM5Enabled() && favorites.length > 0) {
            const confMap = await resolveConsumerConfidence(
                favorites
                    .filter((f: any) => f.products?.id)
                    .map((f: any) => ({
                        productId: f.products.id as string,
                        merchantId: (f.products.merchant_id as string | null) ?? null,
                        posItemId: (f.products.pos_item_id as string | null) ?? null,
                    })),
                { supabase },
            );
            favorites = favorites.map((f: any) =>
                f.products?.id
                    ? { ...f, products: { ...f.products, confidence: confMap.get(f.products.id) ?? null } }
                    : f,
            );
        }

        return NextResponse.json({ favorites });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const limited = await rateLimit(request.headers.get("x-forwarded-for") ?? null, "favorites-post", 20);
        if (limited) return limited;

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const parsed = await parseBody(request, favoriteBody);
        if ("error" in parsed) return parsed.error;
        const { product_id } = parsed.data;

        const { data, error } = await supabase
            .from("user_favorites")
            .insert({ user_id: user.id, product_id })
            .select()
            .single();

        if (error) {
            if (error.code === "23505") {
                return NextResponse.json({ error: "Already favorited" }, { status: 409 });
            }
            return NextResponse.json({ error: "Failed to add favorite" }, { status: 500 });
        }

        return NextResponse.json({ favorite: data }, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
