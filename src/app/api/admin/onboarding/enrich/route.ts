/**
 * POST /api/admin/onboarding/enrich
 *
 * Phase 1 Task 1.4 — promote 1 staging row vers products avec enrichissement
 * manuel admin (UI form). Cf. plan V2 Task 1.4 + brain règle d'or.
 *
 * Comportement :
 *  - Auth admin via requireAdmin (Supabase metadata)
 *  - Récupère staging row (status doit être 'pending')
 *  - Validation server-side stricte (price_cents int>0, ean checksum si fourni, channel enum)
 *  - INSERT products (visible=false, review_status='pending_review', identification_score=null
 *    car remplissage manuel — la cascade publish fera passer en 'validated' au step 4)
 *  - UPDATE staging row → status='enriched' + enriched_product_id
 *
 * Race conditions : si 2 admins click "Enrichir" simultanément → 2 products créés.
 *   Risque accepté V1 (Thomas seul admin). Compensating transaction non implémentée
 *   pour rester KISS. À durcir si on passe à plusieurs admins.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { canonicalizeEan } from "@/lib/identifiers/validators";
import { createAdminClient } from "@/lib/supabase/admin";

const CHANNELS = ["online", "in_store", "multi"] as const;
type Channel = (typeof CHANNELS)[number];

interface EnrichBody {
    stagingId?: unknown;
    name?: unknown;
    ean?: unknown;
    brand?: unknown;
    price?: unknown;
    photo_url?: unknown;
    channel?: unknown;
    category?: unknown;
    size?: unknown;
    description?: unknown;
    sku?: unknown;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    let body: EnrichBody;
    try {
        body = (await req.json()) as EnrichBody;
    } catch {
        return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    // --- Validation server-side stricte ---
    const stagingId = typeof body.stagingId === "number" ? body.stagingId : null;
    if (stagingId === null || !Number.isInteger(stagingId) || stagingId <= 0) {
        return NextResponse.json({ error: "invalid_staging_id" }, { status: 400 });
    }

    const name =
        typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 500) {
        return NextResponse.json({ error: "invalid_name" }, { status: 400 });
    }

    // products.price est NUMERIC en euros (ex 119.00). Décimales OK.
    const price = typeof body.price === "number" ? body.price : null;
    if (price === null || !Number.isFinite(price) || price <= 0 || price > 1_000_000) {
        return NextResponse.json({ error: "invalid_price" }, { status: 400 });
    }

    const channel: Channel =
        typeof body.channel === "string" && (CHANNELS as readonly string[]).includes(body.channel)
            ? (body.channel as Channel)
            : "in_store";

    const brand =
        typeof body.brand === "string" && body.brand.trim().length > 0
            ? body.brand.trim().slice(0, 200)
            : null;

    const photoUrl =
        typeof body.photo_url === "string" && body.photo_url.trim().length > 0
            ? body.photo_url.trim().slice(0, 1000)
            : null;
    if (photoUrl && !/^https?:\/\//i.test(photoUrl)) {
        return NextResponse.json({ error: "invalid_photo_url" }, { status: 400 });
    }

    const category =
        typeof body.category === "string" && body.category.trim().length > 0
            ? body.category.trim().slice(0, 200)
            : null;
    const size =
        typeof body.size === "string" && body.size.trim().length > 0
            ? body.size.trim().slice(0, 100)
            : null;
    const description =
        typeof body.description === "string" && body.description.trim().length > 0
            ? body.description.trim().slice(0, 2000)
            : null;
    const sku =
        typeof body.sku === "string" && body.sku.trim().length > 0
            ? body.sku.trim().slice(0, 100)
            : null;

    // EAN validation : si fourni, doit canonicalize en EAN-13 valide.
    let ean: string | null = null;
    if (typeof body.ean === "string" && body.ean.trim().length > 0) {
        const canonical = canonicalizeEan(body.ean);
        if (!canonical) {
            return NextResponse.json({ error: "invalid_ean" }, { status: 400 });
        }
        ean = canonical;
    }

    // --- Lookup staging row ---
    const admin = createAdminClient();
    const { data: stagingRow, error: stagingErr } = await admin
        .from("import_staging")
        .select("id, merchant_id, status, enriched_product_id")
        .eq("id", stagingId)
        .maybeSingle();

    if (stagingErr) {
        return NextResponse.json({ error: stagingErr.message }, { status: 500 });
    }
    if (!stagingRow) {
        return NextResponse.json({ error: "staging_row_not_found" }, { status: 404 });
    }
    if (stagingRow.status !== "pending") {
        return NextResponse.json(
            {
                error: "staging_row_not_pending",
                current_status: stagingRow.status,
                enriched_product_id: stagingRow.enriched_product_id,
            },
            { status: 409 },
        );
    }

    // --- Insert product ---
    const { data: product, error: insertErr } = await admin
        .from("products")
        .insert({
            merchant_id: stagingRow.merchant_id,
            name,
            ean,
            brand,
            price,
            photo_url: photoUrl,
            channel,
            category,
            size,
            description,
            sku,
            visible: false,
            review_status: "pending_review",
        })
        .select(
            "id, name, ean, brand, price, channel, category, size, review_status, visible",
        )
        .single();

    if (insertErr || !product) {
        return NextResponse.json(
            { error: insertErr?.message ?? "insert_failed" },
            { status: 500 },
        );
    }

    // --- Update staging row (atomique : WHERE status='pending' pour race protection) ---
    const { data: updatedStaging, error: updateErr } = await admin
        .from("import_staging")
        .update({
            status: "enriched",
            enriched_product_id: product.id,
            updated_at: new Date().toISOString(),
        })
        .eq("id", stagingId)
        .eq("status", "pending")
        .select("id, status")
        .maybeSingle();

    if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
    if (!updatedStaging) {
        // Race condition : un autre admin a déjà enriched ce row.
        // On a inséré le product en double — on tente de le supprimer (compensating tx).
        await admin.from("products").delete().eq("id", product.id);
        return NextResponse.json(
            { error: "race_condition_staging_already_enriched" },
            { status: 409 },
        );
    }

    return NextResponse.json({ product });
}
