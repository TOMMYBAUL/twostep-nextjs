import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveProductId } from "@/lib/slug";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;

        if (!id || typeof id !== "string") {
            return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
        }

        const productId = await resolveProductId(id);
        if (!productId) {
            return NextResponse.json({ error: "Product not found" }, { status: 404 });
        }

        const supabase = await createClient();

        const { data, error } = await supabase
            .from("products")
            .select("*, stock(quantity), promotions(*), merchants(name, address, city, photo_url, phone, opening_hours, location)")
            .eq("id", productId)
            .eq("visible", true)
            .single();

        if (error || !data) {
            // If not found, check if it's a hidden variant → redirect to principal product
            const admin = createAdminClient();
            const { data: variant } = await admin
                .from("products")
                .select("variant_of, slug")
                .eq("id", productId)
                .not("variant_of", "is", null)
                .single();

            if (variant?.variant_of) {
                const { data: principal } = await admin
                    .from("products")
                    .select("slug")
                    .eq("id", variant.variant_of)
                    .single();
                if (principal?.slug) {
                    return NextResponse.json(
                        { redirect: `/product/${principal.slug}` },
                        { status: 301 },
                    );
                }
            }

            return NextResponse.json({ error: "Product not found" }, { status: 404 });
        }

        const merchant = (data as any).merchants;
        if (merchant?.location) {
            try {
                const loc = merchant.location;
                if (typeof loc === "string" && loc.includes("POINT")) {
                    const match = loc.match(/POINT\(([^ ]+) ([^)]+)\)/);
                    if (match) {
                        merchant.lng = parseFloat(match[1]);
                        merchant.lat = parseFloat(match[2]);
                    }
                } else if (typeof loc === "object" && loc.coordinates) {
                    merchant.lng = loc.coordinates[0];
                    merchant.lat = loc.coordinates[1];
                }
            } catch { /* non-critical */ }
            delete merchant.location;
        }

        // Normalize available_sizes: DB stores ["S","M"] but frontend expects [{size,quantity}]
        const s = (data as any).stock;
        const totalStock = !s ? 0 : Array.isArray(s) ? (s[0]?.quantity ?? 0) : (s.quantity ?? 0);
        const rawSizes = (data as any).available_sizes;
        if (Array.isArray(rawSizes) && rawSizes.length > 0) {
            (data as any).available_sizes = rawSizes.map((entry: unknown) => {
                if (typeof entry === "string") {
                    // Distribute total stock evenly across sizes as estimate
                    return { size: entry, quantity: Math.max(1, Math.floor(totalStock / rawSizes.length)) };
                }
                return entry; // already {size, quantity}
            });
        }

        return NextResponse.json({ product: data }, {
            headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
        });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;

        if (!id || typeof id !== "string") {
            return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
        }

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

        const { name, ean, description, category, price, photo_url, available_sizes, visible } = body;

        const updates: Record<string, unknown> = {};
        if (name !== undefined) {
            if (typeof name !== "string" || !name.trim()) {
                return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
            }
            updates.name = name;
        }
        if (ean !== undefined) {
            if (ean !== null && (typeof ean !== "string" || !/^(\d{8}|\d{13})$/.test(ean))) {
                return NextResponse.json({ error: "ean must be 8 or 13 digits" }, { status: 400 });
            }
            updates.ean = ean;
        }
        if (description !== undefined) updates.description = description;
        if (category !== undefined) updates.category = typeof category === "string" ? category.toLowerCase() : category;
        if (price !== undefined) {
            if (typeof price !== "number" || price < 0) {
                return NextResponse.json({ error: "price must be a non-negative number" }, { status: 400 });
            }
            updates.price = price;
        }
        if (photo_url !== undefined) {
            if (photo_url !== null) {
                if (typeof photo_url !== "string") {
                    return NextResponse.json({ error: "photo_url must be a string" }, { status: 400 });
                }
                try {
                    const parsed = new URL(photo_url);
                    if (parsed.protocol !== "https:") {
                        return NextResponse.json({ error: "photo_url must use https://" }, { status: 400 });
                    }
                } catch {
                    return NextResponse.json({ error: "photo_url must be a valid URL" }, { status: 400 });
                }
            }
            updates.photo_url = photo_url;
        }
        if (available_sizes !== undefined) updates.available_sizes = available_sizes;
        if (visible !== undefined) updates.visible = visible;

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
        }

        // Verify ownership: product must belong to a merchant owned by this user
        const { data: product } = await supabase
            .from("products")
            .select("merchant_id, price, merchants!inner(user_id)")
            .eq("id", id)
            .single();

        if (!product || (product as any).merchants?.user_id !== user.id) {
            return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });
        }

        const { data, error } = await supabase.from("products").update(updates).eq("id", id).select().single();

        if (error) {
            return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
        }

        // Emit price_drop event if price decreased
        if (product && body.price && product.price && body.price < product.price) {
            const adminSupabase = createAdminClient();
            await adminSupabase.from("feed_events").insert({
                merchant_id: product.merchant_id,
                product_id: id,
                event_type: "price_drop",
            });
        }

        return NextResponse.json({ product: data });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;

        if (!id || typeof id !== "string") {
            return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
        }

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Verify ownership: product must belong to a merchant owned by this user
        const { data: product } = await supabase
            .from("products")
            .select("id, pos_item_id, merchants!inner(user_id)")
            .eq("id", id)
            .single();

        if (!product || (product as any).merchants?.user_id !== user.id) {
            return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });
        }

        // POS-sourced products: soft delete only (POS is source of truth)
        // To permanently remove, merchant must delete from their POS
        if ((product as any).pos_item_id) {
            const { error } = await supabase
                .from("products")
                .update({ visible: false })
                .eq("id", id);

            if (error) {
                return NextResponse.json({ error: "Failed to hide product" }, { status: 500 });
            }

            return NextResponse.json({
                success: true,
                soft_deleted: true,
                message: "Produit masqué. Pour le supprimer définitivement, retirez-le de votre caisse.",
            });
        }

        // Manual products: hard delete
        const { error } = await supabase.from("products").delete().eq("id", id);

        if (error) {
            return NextResponse.json({ error: "Failed to delete product" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
