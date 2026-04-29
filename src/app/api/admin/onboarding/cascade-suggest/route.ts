/**
 * POST /api/admin/onboarding/cascade-suggest
 *
 * Phase 1 Task 1.4 V2 — appelle la cascade Tier 1-4 + Serper sur 1 staging row
 * et retourne des suggestions pour pré-remplir le form ManualEnrich.
 *
 * Wizard V1 (28/04) était 100% manuel — n'utilisait pas runCascade ni
 * categorizeProducts ni searchProductImage qui existaient pourtant. Cette
 * route exploite enfin tout le code cascade pour proposer name/brand/ean/photo
 * pré-validés à l'admin, qui valide en 1 clic au lieu de remplir from scratch.
 *
 * Bénéfice business : 200 produits Kap pilote = 30 min admin au lieu de 6-10h.
 *
 * Auth : requireAdmin (Supabase metadata).
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { runCascade } from "@/lib/enrichment/cascade-engine";
import { collectAllEanSources } from "@/lib/enrichment/multi-source";
import { searchProductImage } from "@/lib/images/serper";
import { createAdminClient } from "@/lib/supabase/admin";

interface SuggestBody {
    stagingId?: unknown;
}

/**
 * Heuristique extraction de raw_row CSV — alignée sur prefillFromRawRow
 * de manual-enrich.tsx. Reconnaît headers FR + EN courants.
 */
function extractFromRawRow(raw: Record<string, unknown>): {
    name: string;
    brand: string | null;
    ean: string | null;
    sku: string | null;
    category: string | null;
} {
    const get = (...keys: string[]): string => {
        for (const k of keys) {
            const direct = raw[k];
            if (typeof direct === "string" && direct.trim()) return direct.trim();
            if (typeof direct === "number") return String(direct);
            const found = Object.entries(raw).find(
                ([rawKey]) => rawKey.toLowerCase() === k.toLowerCase(),
            );
            if (found) {
                const v = found[1];
                if (typeof v === "string" && v.trim()) return v.trim();
                if (typeof v === "number") return String(v);
            }
        }
        return "";
    };

    return {
        name: get("Désignation", "Designation", "Nom", "name", "title", "Titre", "Produit"),
        brand: get("Marque", "marque", "Brand", "brand", "Fabricant") || null,
        ean:
            get("Code-barres", "code-barres", "EAN", "ean", "GTIN", "gtin", "UPC", "Gencode") ||
            null,
        sku: get("Référence", "Reference", "SKU", "sku", "Code", "Ref") || null,
        category: get("Catégorie", "Categorie", "Category", "category", "Type") || null,
    };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    let body: SuggestBody;
    try {
        body = (await req.json()) as SuggestBody;
    } catch {
        return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const stagingId = typeof body.stagingId === "number" ? body.stagingId : null;
    if (stagingId === null || !Number.isInteger(stagingId) || stagingId <= 0) {
        return NextResponse.json({ error: "invalid_staging_id" }, { status: 400 });
    }

    // ─── Fetch staging row ───
    const admin = createAdminClient();
    const { data: stagingRow, error: stagingErr } = await admin
        .from("import_staging")
        .select("id, merchant_id, raw_row, status")
        .eq("id", stagingId)
        .maybeSingle();

    if (stagingErr) {
        return NextResponse.json({ error: stagingErr.message }, { status: 500 });
    }
    if (!stagingRow) {
        return NextResponse.json({ error: "staging_not_found" }, { status: 404 });
    }
    if (stagingRow.status !== "pending") {
        return NextResponse.json(
            { error: "staging_not_pending", current_status: stagingRow.status },
            { status: 409 },
        );
    }

    const extracted = extractFromRawRow(stagingRow.raw_row as Record<string, unknown>);

    // ─── Run cascade Tier 1-4 (CIP + multi-source EAN + reverse search par nom) ───
    const outcome = await runCascade({
        ean: extracted.ean,
        name: extracted.name || null,
        brand: extracted.brand,
        sku: extracted.sku,
    });

    // ─── Si EAN canonique trouvé → recup brand/category/photo via les sources ───
    let canonicalBrand: string | null = extracted.brand;
    let canonicalCategory: string | null = extracted.category;
    let canonicalPhoto: string | null = null;
    if (outcome.canonical_ean) {
        try {
            const multi = await collectAllEanSources(outcome.canonical_ean);
            canonicalBrand = multi.canonical_brand ?? canonicalBrand;
            canonicalCategory = multi.canonical_category ?? canonicalCategory;
            canonicalPhoto = multi.canonical_photo_url;
        } catch {
            // Non bloquant — on garde les valeurs déjà extraites
        }
    }

    // ─── Si pas de photo trouvée → fallback Serper Google Images ───
    if (!canonicalPhoto && extracted.name) {
        try {
            canonicalPhoto = await searchProductImage(
                extracted.name,
                canonicalBrand,
                outcome.canonical_ean,
                extracted.sku,
            );
        } catch {
            // Serper rate-limited ou key invalide → on continue sans photo
        }
    }

    return NextResponse.json({
        suggestion: {
            name: outcome.canonical_name ?? extracted.name,
            brand: canonicalBrand,
            ean: outcome.canonical_ean ?? extracted.ean,
            category: canonicalCategory,
            photo_url: canonicalPhoto,
            sku: extracted.sku,
        },
        cascade: {
            score: outcome.score,
            tiers_matched: outcome.tiers_matched,
            review_status: outcome.review_status,
            visible_proposed: outcome.visible,
        },
    });
}
