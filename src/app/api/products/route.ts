import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { productBody, parseBody } from "@/lib/validation";
import { resolveMerchantId } from "@/lib/slug";

export async function GET(request: Request) {
    try {
        const supabase = await createClient();
        const { searchParams } = new URL(request.url);
        const merchantIdParam = searchParams.get("merchant_id");

        if (!merchantIdParam || typeof merchantIdParam !== "string") {
            return NextResponse.json({ error: "merchant_id required" }, { status: 400 });
        }

        const merchantId = await resolveMerchantId(merchantIdParam);
        if (!merchantId) {
            return NextResponse.json({ products: [] });
        }

        const { data, error } = await supabase
            .from("products")
            .select("*, stock(quantity)")
            .eq("merchant_id", merchantId)
            .order("name");

        if (error) {
            return NextResponse.json({ error: "Operation failed" }, { status: 500 });
        }

        return NextResponse.json({ products: data ?? [] }, {
            headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
        });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Derive merchant_id from authenticated user (prevents spoofing)
        const { data: merchant } = await supabase.from("merchants").select("id").eq("user_id", user.id).single();

        if (!merchant) {
            return NextResponse.json({ error: "No merchant profile found. Create one first." }, { status: 403 });
        }

        const parsed = await parseBody(request, productBody);
        if ("error" in parsed) return parsed.error;
        const { name, ean, description, category, price, photo_url, initial_quantity } = parsed.data;

        // Insert product
        const { data: product, error: productError } = await supabase
            .from("products")
            .insert({ merchant_id: merchant.id, name, ean, description, category, price, photo_url })
            .select()
            .single();

        if (productError) {
            return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
        }

        // Insert initial stock
        const { error: stockError } = await supabase
            .from("stock")
            .insert({ product_id: product.id, quantity: initial_quantity ?? 0 });

        if (stockError) {
            return NextResponse.json({ error: "Failed to initialize stock" }, { status: 500 });
        }

        // Emit feed_event for new product
        const adminSupabase = createAdminClient();
        await adminSupabase.from("feed_events").insert({
            merchant_id: merchant.id,
            product_id: product.id,
            event_type: "new_product",
        });

        return NextResponse.json({ product }, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
