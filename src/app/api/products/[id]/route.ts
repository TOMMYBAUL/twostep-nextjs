import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveProductId } from "@/lib/slug";
import { productConfidence, stockRowToConfidenceInput } from "@/lib/stock/product-confidence";
import { reportsWindowStartIso } from "@/lib/stock/reports";
import { honestSalePrice } from "@/lib/products/sale-price";
import { groupVariantsByEAN } from "@/lib/pos/sync-engine";
import { captureError } from "@/lib/error";

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

        const supabase = createAdminClient();

        const { data, error } = await supabase
            .from("products")
            .select("*, stock(quantity, updated_at, source, source_ts), promotions(*), merchants(name, address, city, photo_url, phone, opening_hours, location)")
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

        // Garde d'honnêteté read-side : ne conserver que les promos qui sont un VRAI rabais
        // (sale_price < prix courant). Une promo encore active mais dont le prix produit a baissé
        // en dessous du sale_price (re-ingest/sync) afficherait sinon un « -X% » aberrant (négatif)
        // et un prix promo SUPÉRIEUR au prix courant côté product-detail. Cf. lib/products/sale-price.ts.
        const rawPromos = (data as any).promotions;
        if (Array.isArray(rawPromos) && rawPromos.length > 0) {
            const price = (data as any).price;
            if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
                // Prix invalide : impossible de juger l'honnêteté d'un rabais → on masque les promos
                // (choix prudent). Mais on rend la corruption VISIBLE (sinon indistinct de « aucune
                // promo ») — un produit visible avec un prix null/0 portant une promo est anormal.
                captureError(new Error("product price null/0 with active promotions — promos suppressed"), {
                    route: "products/[id]",
                    productId,
                    price: String(price),
                });
                (data as any).promotions = [];
            } else {
                (data as any).promotions = rawPromos.filter(
                    (pr: any) => honestSalePrice(price, pr?.sale_price) != null,
                );
            }
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

        // État de confiance affiché au consommateur (jamais de compteur brut) :
        // fraîcheur + force de source, dégradé par les signalements récents.
        const [{ data: ingest }, { count: reportCount }] = await Promise.all([
            supabase
                .from("ingest_credentials")
                .select("merchant_id")
                .eq("merchant_id", (data as any).merchant_id)
                .maybeSingle(),
            supabase
                .from("stock_reports")
                .select("id", { count: "exact", head: true })
                .eq("product_id", productId)
                .eq("reason", "not_in_store")
                .gte("created_at", reportsWindowStartIso()),
        ]);

        (data as any).confidence = productConfidence({
            ...stockRowToConfidenceInput(s),
            posItemId: (data as any).pos_item_id ?? null,
            merchantHasIngest: !!ingest,
            recentNotInStoreReports: reportCount ?? 0,
        });

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
        if (visible !== undefined) {
            updates.visible = visible;
            // Masquer un produit via cette API = acte DÉLIBÉRÉ → poser le même marqueur que
            // `reject`/`DELETE` (`review_status='rejected'`) pour que l'invariant du watchdog
            // de complétude reste vrai PARTOUT où `visible=false` est écrit (sinon un
            // `visible=false` nu depuis un futur outil admin/support relancerait le faux
            // positif « produit vendable invisible »). On ne touche PAS `review_status` sur
            // une publication (`visible=true`) : le detector n'observe que les invisibles.
            if (visible === false) updates.review_status = "rejected";
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
        }

        // Verify ownership: product must belong to a merchant owned by this user.
        // `ean` + `variant_of` sont lus pour détecter un changement d'identité (correction
        // manuelle d'EAN) qui rend le regroupement variantes périmé (cf. post-update ci-dessous).
        const { data: product } = await supabase
            .from("products")
            .select("merchant_id, price, ean, variant_of, merchants!inner(user_id)")
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

        // Une correction MANUELLE d'EAN change l'IDENTITÉ du produit → son regroupement par
        // EAN devient périmé. `groupVariantsByEAN` ne relit QUE les produits `variant_of IS
        // NULL` (il ne DÉ-groupe jamais) : sans réamorçage, un produit devenu variante
        // resterait masqué à jamais (produit silencieusement PERDU = north-star §1 « ne rien
        // oublier »), et un principal dont on change l'EAN garderait ses enfants orphelins +
        // un stock cumulé faux (faux « en stock » = faux positif n°1). On relâche donc le
        // produit édité ET ses éventuelles variantes-enfants (`variant_of` → null), puis on
        // re-dérive le regroupement. Post-pass DÉRIVÉ, non fatal : l'édition est déjà committée
        // et le prochain ingest/sync re-groupe → capture-and-continue (comme snapshot.ts).
        // RÉSIDU CONNU (revue SF-hunter, MED) : si le regroup LÈVE APRÈS la relâche, un produit
        // qui était une variante masquée peut rester `variant_of=null, visible=false` (invisible)
        // jusqu'au prochain regroup ; pour un marchand SANS caisse ni facture, aucun re-trigger
        // périodique n'existe → couvert par un watchdog de dérive (quality-check) = prochain [R].
        // Le cas COMMUN (édition d'un principal visible) reste visible → auto-guérison.
        if (updates.ean !== undefined && (updates.ean ?? null) !== ((product as any).ean ?? null)) {
            const adminSupabase = createAdminClient();
            const merchantId = (product as any).merchant_id as string;
            try {
                const { error: relSelfErr } = await adminSupabase
                    .from("products")
                    .update({ variant_of: null })
                    .eq("id", id)
                    .eq("merchant_id", merchantId);
                if (relSelfErr) throw new Error(`release self grouping failed: ${relSelfErr.message}`);

                const { error: relChildErr } = await adminSupabase
                    .from("products")
                    .update({ variant_of: null })
                    .eq("variant_of", id)
                    .eq("merchant_id", merchantId);
                if (relChildErr) throw new Error(`release child grouping failed: ${relChildErr.message}`);

                await groupVariantsByEAN(adminSupabase, merchantId);
            } catch (err) {
                captureError(err, {
                    route: "products/[id]",
                    phase: "regroup-after-ean-change",
                    productId: id,
                    merchantId,
                });
            }
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
            // `review_status: "rejected"` = MARQUEUR de masquage DÉLIBÉRÉ (même convention que la
            // route `reject`). SANS lui, un soft-delete ne pose que `visible=false` et laisse
            // `review_status='validated'`, `variant_of=null`, un nom et du stock → signature
            // EXACTE d'un « produit vendable rendu invisible » → le watchdog de complétude
            // (cron quality-check `isInvisibleOrphan`) crierait au loup chaque jour sur une
            // action VOULUE par le marchand (faux positif = érosion de l'alarme). Bonus : rend
            // le masquage STICKY — sinon le prochain `groupVariantsByEAN` (stock>0, validé) le
            // repasserait `visible=true`, ré-affichant un produit que le marchand a masqué.
            const { error } = await supabase
                .from("products")
                .update({ visible: false, review_status: "rejected" })
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
