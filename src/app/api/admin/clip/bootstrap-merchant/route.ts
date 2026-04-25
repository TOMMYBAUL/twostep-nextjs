/**
 * Bootstrap CLIP embeddings pour tout un catalogue marchand (Cycle 10).
 *
 * Usage : POST /api/admin/clip/bootstrap-merchant
 *   { "merchantId": "<uuid>", "limit"?: 50, "retryFailed"?: true }
 *
 * Comportement :
 *  - Filtre products du marchand avec photo_url non-null
 *  - Skip ceux déjà `embedded` (sauf si re-embed forcé via futur paramètre `reembed`)
 *  - Inclut les `failed` si retryFailed=true (default true)
 *  - Boucle séquentielle (Replicate ~2-3s par produit), avec `limit` pour batcher
 *  - Retourne compteurs détaillés
 *
 * Pour 200 produits Kap → 7-10 min total. À scaler via Inngest V1.5.
 *
 * ⚠️ Vercel function timeout : 60s sur Hobby, 300s sur Pro. Donc `limit` doit
 *    rester ≤ ~20 par appel sur Hobby pour éviter timeout. Le caller relance
 *    le endpoint plusieurs fois (avec offset implicite via filter pending).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin/guard";
import { embedAndStoreProduct } from "@/lib/enrichment/clip-pipeline";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

interface BootstrapBody {
    merchantId?: string;
    limit?: number;
    retryFailed?: boolean;
}

interface ProductCounters {
    total_to_process: number;
    embedded: number;
    skipped: number;
    failed: number;
    elapsed_ms: number;
    remaining_estimate: number; // produits encore en pending pour ce marchand
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user || !isAdmin(user.email)) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    let body: BootstrapBody;
    try {
        body = (await req.json()) as BootstrapBody;
    } catch {
        return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const merchantId = body.merchantId;
    if (typeof merchantId !== "string" || !UUID_REGEX.test(merchantId)) {
        return NextResponse.json({ error: "invalid_merchant_id" }, { status: 400 });
    }

    const limit = Math.min(
        Math.max(typeof body.limit === "number" ? body.limit : DEFAULT_LIMIT, 1),
        MAX_LIMIT,
    );
    const retryFailed = body.retryFailed !== false;

    // Liste les products à traiter (admin client = bypass RLS)
    const admin = createAdminClient();
    const acceptableStatuses = retryFailed
        ? ["pending", "failed"]
        : ["pending"];

    const { data: products, error } = await admin
        .from("products")
        .select("id, photo_url, photo_processed_url")
        .eq("merchant_id", merchantId)
        .in("clip_embedding_status", acceptableStatuses)
        .or("photo_url.not.is.null,photo_processed_url.not.is.null")
        .order("created_at", { ascending: true })
        .limit(limit);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!products || products.length === 0) {
        return NextResponse.json({
            total_to_process: 0,
            embedded: 0,
            skipped: 0,
            failed: 0,
            elapsed_ms: 0,
            remaining_estimate: 0,
            note: "Aucun produit à embed. Soit déjà tous embedded, soit aucun avec photo URL.",
        });
    }

    const t0 = performance.now();
    const counters: ProductCounters = {
        total_to_process: products.length,
        embedded: 0,
        skipped: 0,
        failed: 0,
        elapsed_ms: 0,
        remaining_estimate: 0,
    };

    // Boucle séquentielle — Replicate rate-limit + on respect timing pour observability
    for (const product of products) {
        const outcome = await embedAndStoreProduct(product.id);
        if (outcome.status === "embedded") counters.embedded++;
        else if (outcome.status === "skipped") counters.skipped++;
        else counters.failed++;
    }

    counters.elapsed_ms = Math.round(performance.now() - t0);

    // Estimation produits restants (pending OR failed) pour donner au caller une idée
    const { count } = await admin
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("merchant_id", merchantId)
        .in("clip_embedding_status", acceptableStatuses);
    counters.remaining_estimate = count ?? 0;

    return NextResponse.json(counters);
}
