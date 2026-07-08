import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { productBody, parseBody } from "@/lib/validation";
import { resolveMerchantId } from "@/lib/slug";
import { rateLimit } from "@/lib/rate-limit";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { captureError } from "@/lib/error";
import { consumerM5Enabled, resolveConsumerConfidence } from "@/lib/stock/consumer-confidence";

// Lecture PAGINÉE (keyset) du catalogue : à l'échelle pilote (milliers de SKU) le GET
// enchaîne ⌈catalogue/1000⌉ allers-retours séquentiels — même budget que les lecteurs
// paginés voisins (crons google-feed/pos-resync/quality-check) pour ne pas être tué avant
// la borne `DEFAULT_MAX_PAGES` de fetchAllRows.
export const maxDuration = 300;

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

        const incomplete = searchParams.get("incomplete") === "true";

        if (incomplete) {
            // Incomplete products require authentication + merchant ownership
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            }
            const { data: ownedMerchant } = await supabase
                .from("merchants")
                .select("id")
                .eq("id", merchantId)
                .eq("user_id", user.id)
                .single();
            if (!ownedMerchant) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
        }

        // PAGINÉ (KEYSET, cf. fetchAllRows) : un SELECT non borné est tronqué SILENCIEUSEMENT
        // à 1000 lignes par PostgREST → sur l'écran « Mon stock » (E3), un catalogue > 1000
        // (pilote multimarque type Deerskin = des milliers de SKU) paraîtrait amputé et les
        // compteurs total/ruptures/dispo seraient FAUX → le marchand ré-importe en panique
        // (perte de confiance, faux « catalogue tronqué »). Curseur = `id` (PK, `*` l'inclut).
        // Population/filtres INCHANGÉS ; on rétablit l'ordre d'affichage par nom ensuite.
        const { data, error } = await fetchAllRows<{ id: string; name: string | null; [k: string]: unknown }>(
            () => {
                let query = supabase
                    .from("products")
                    .select("*, stock(quantity)")
                    .eq("merchant_id", merchantId);

                if (incomplete) {
                    // Products not yet visible — need completion. Exclude variants (grouped under parent).
                    query = query.eq("visible", false).is("variant_of", null);
                } else {
                    // Public listing: only visible products, exclude variants
                    query = query.eq("visible", true).is("variant_of", null);
                }

                return query.order("id", { ascending: true });
            },
        );

        if (error) {
            // fetchAllRows fournit un diagnostic riche (erreur PostgREST de page, `data=null`
            // sans erreur, curseur absent) ; on le remonte (comme les crons paginés voisins)
            // sinon la troncature/anomalie devient un 500 muet sans piste pour l'ops.
            captureError(error, { route: "products", merchantId, step: "list-products" });
            return NextResponse.json({ error: "Operation failed" }, { status: 500 });
        }

        // La pagination keyset impose l'ordre par `id` ; on restaure le contrat d'affichage
        // (tri par nom, comme l'ancien `.order("name")`) côté serveur — sans re-troncature.
        let products = [...(data ?? [])].sort((a, b) =>
            String(a.name ?? "").localeCompare(String(b.name ?? ""), "fr"),
        );

        // P0-4 : verdict M5 par produit sur la vitrine boutique PUBLIQUE (le listing
        // `incomplete` est un écran dashboard marchand, pas une surface conso).
        // Champ additif, flag-gaté.
        if (consumerM5Enabled() && !incomplete && products.length > 0) {
            const confMap = await resolveConsumerConfidence(
                products.map((p) => ({
                    productId: p.id,
                    merchantId,
                    posItemId: (p as { pos_item_id?: string | null }).pos_item_id ?? null,
                })),
                { supabase },
            );
            products = products.map((p) => ({ ...p, confidence: confMap.get(p.id) ?? null }));
        }

        return NextResponse.json({ products }, {
            headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
        });
    } catch (err) {
        // fetchAllRows LÈVE au dépassement de `maxPages` (curseur non strictement croissant =
        // colonne corrompue, ou volume > 200k) — sans capture, ce diagnostic (curseur+colonne)
        // serait perdu derrière un 500 opaque.
        captureError(err, { route: "products", step: "list-products-unhandled" });
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const limited = await rateLimit(request.headers.get("x-forwarded-for") ?? null, "products:post", 10);
    if (limited) return limited;

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
            .insert({ merchant_id: merchant.id, name, ean, description, category: category?.toLowerCase() ?? null, price, photo_url })
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
