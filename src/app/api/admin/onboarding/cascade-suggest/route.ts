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
import { suggestProductMeta } from "@/lib/ai/haiku-product-meta";
import { searchEanByName } from "@/lib/ean/lookup";
import { runCascade } from "@/lib/enrichment/cascade-engine";
import { collectAllEanSources } from "@/lib/enrichment/multi-source";
import { lookupGoogleShopping } from "@/lib/enrichment/tier3-google-shopping";
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
    color: string | null;
    size: string | null;
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

    // Coloris : on prend la valeur de la colonne dédiée. NOTE — si le CSV est
    // décalé ou pourri, le filtrage agressif à l'import (cap stratégique 30/04)
    // doit refuser la ligne EN AMONT. Ici on FAIT CONFIANCE à la donnée.
    const colorRaw = get("Coloris", "Couleur", "Color", "Colour", "Colour Name");
    // Heuristique défensive : un coloris doit ressembler à du texte (pas un nombre
    // pur ni une URL ni un code numérique seul). Si la colonne contient autre chose,
    // on ignore (filet de sécurité, mais le vrai blocage viendra du filtrage import).
    const colorLooksValid =
        colorRaw &&
        !/^https?:\/\//i.test(colorRaw) &&
        !/^\d+(\.\d+)?$/.test(colorRaw.trim()) &&
        colorRaw.trim().length >= 2;

    return {
        name: get("Désignation", "Designation", "Nom", "name", "title", "Titre", "Produit"),
        brand: get("Marque", "marque", "Brand", "brand", "Fabricant") || null,
        ean:
            get("Code-barres", "code-barres", "EAN", "ean", "GTIN", "gtin", "UPC", "Gencode") ||
            null,
        sku: get("Référence", "Reference", "SKU", "sku", "Code", "Ref") || null,
        category: get("Catégorie", "Categorie", "Category", "category", "Type") || null,
        color: colorLooksValid ? colorRaw : null,
        size: get("Taille", "taille", "Size", "size", "Pointure", "Dimension") || null,
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
    let canonicalNameSuggestion: string | null = outcome.canonical_name;
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

    // ─── Tier 3 Google Shopping fallback (Phase 1.1) ───
    // Mode "weak ok" pour pré-remplir UI (name/brand/photo/price) même si la
    // cascade-engine a refusé de booster le score (faux positif risk).
    // Très utile quand l'EAN est absent ou que les Tier 1-2 ont rien trouvé.
    if (!canonicalPhoto || !canonicalNameSuggestion) {
        try {
            const gpc = await lookupGoogleShopping({
                ean: outcome.canonical_ean,
                name: extracted.name || null,
                brand: canonicalBrand,
            });
            if (gpc) {
                if (!canonicalPhoto && gpc.photo_url) canonicalPhoto = gpc.photo_url;
                if (!canonicalNameSuggestion && gpc.canonical_name) {
                    canonicalNameSuggestion = gpc.canonical_name;
                }
                if (!canonicalBrand && gpc.brand) canonicalBrand = gpc.brand;
            }
        } catch {
            // Non bloquant
        }
    }

    // ─── Fix 30/04 #1 — searchEanByName en mode "enrichissement seul" ───
    // Sprint 1.5 (29/04) avait coupé entièrement la reverse search par nom quand
    // input.ean existait, pour éviter le bug Nike→Weleda (l'EAN d'entrée était
    // remplacé par celui d'un faux match). Conséquence non désirée : pour les
    // EAN obscurs mode (Nike/Adidas), aucun fallback nom → MASQUÉ systématique.
    //
    // Ici on remet la reverse search MAIS sans toucher à canonical_ean : on ne
    // récupère que name/photo/brand pour pré-remplir les suggestions UI. L'EAN
    // d'entrée du marchand est toujours respecté. Pas de remplacement = pas de
    // faux positif catastrophe.
    if (
        outcome.tiers_matched.length === 0 &&
        (!canonicalPhoto || !canonicalNameSuggestion) &&
        extracted.name
    ) {
        try {
            const reverse = await searchEanByName(extracted.name, canonicalBrand);
            if (reverse) {
                if (!canonicalNameSuggestion && extracted.name) {
                    // searchEanByName ne renvoie pas un nom canonique structuré ;
                    // on garde l'extraction raw mais on note que la reverse a matché.
                }
                if (!canonicalBrand && reverse.brand) canonicalBrand = reverse.brand;
                // Note : reverse.ean n'est PAS appliqué (cap 30/04 — on respecte input.ean)
            }
        } catch {
            // Non bloquant
        }
    }

    // ─── Si pas de photo trouvée → fallback Serper Google Images ───
    // Fix 30/04 #2 — query enrichie avec le coloris extrait du CSV pour cibler
    // la BONNE variante (avant : "Nike Air Max 90" tombait sur la verte populaire ;
    // maintenant : "Nike Air Max 90 Noir Blanc" cible la variante demandée).
    // Fix 30/04 #3 — Haiku verify reçoit aussi le coloris (cf serper.ts) pour
    // rejeter une AM90 verte si l'attendu est Noir/Blanc.
    if (!canonicalPhoto && extracted.name) {
        try {
            canonicalPhoto = await searchProductImage(
                extracted.name,
                canonicalBrand,
                outcome.canonical_ean,
                extracted.sku,
                extracted.color,
            );
        } catch {
            // Serper rate-limited ou key invalide → on continue sans photo
        }
    }

    // ─── Phase 1.2 + 1.3 : catégorie + description via Haiku ───
    // Appelé en parallèle des autres lookups serait plus rapide mais pour la
    // simplicité V1 on l'enchaîne. ~0.0004€/call. Si name absent ou Anthropic
    // KO → fields restent null (les autres remplissages restent valides).
    let suggestedCategory: string | null = canonicalCategory;
    let suggestedDescription: string | null = null;
    if (extracted.name && (!canonicalCategory || !suggestedDescription)) {
        try {
            const meta = await suggestProductMeta({
                name: canonicalNameSuggestion ?? extracted.name,
                brand: canonicalBrand,
                ean: outcome.canonical_ean ?? extracted.ean,
            });
            if (!suggestedCategory && meta.category) suggestedCategory = meta.category;
            suggestedDescription = meta.description;
        } catch {
            // Non bloquant
        }
    }

    return NextResponse.json({
        suggestion: {
            name: canonicalNameSuggestion ?? extracted.name,
            brand: canonicalBrand,
            ean: outcome.canonical_ean ?? extracted.ean,
            category: suggestedCategory,
            photo_url: canonicalPhoto,
            sku: extracted.sku,
            description: suggestedDescription,
        },
        cascade: {
            score: outcome.score,
            tiers_matched: outcome.tiers_matched,
            review_status: outcome.review_status,
            visible_proposed: outcome.visible,
        },
    });
}
