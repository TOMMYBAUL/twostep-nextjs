/**
 * Cascade engine — orchestration unifiée des 6 tiers (Phase A4 + Cycle 1).
 *
 * Source de vérité : `docs/cascade/COVERAGE-MATRIX.md` + brain `06-Tech/Socle-identification-cascade.md`.
 *
 * Stratégie :
 *   1. Normalise + valide checksum d'entrée (canonicalizeEan)
 *   2. Si type = ISBN/CIP → route vers Tier 1 sectoriel d'abord
 *   3. Sinon → cascade Tier 2 (Open Beauty/Products Facts via lookupEan) → Tier 6 (EAN-Search via lookupEan)
 *   4. Si pas d'EAN → reverse search par nom (searchEanByName) — retombe en Tier 6
 *   5. Calcule score combiné via score-cascade
 *   6. Retourne CascadeOutcome traçable
 *
 * **Ce moteur ne touche PAS à `products.*` directement** — ce wrapper renvoie un
 * CascadeOutcome que le caller (catalog/import, invoices/validate, wizard, POS sync)
 * applique selon ses propres règles UX (visible / review_status / queue).
 *
 * Le code existant `lookupEan` continue d'écrire `products.canonical_name`,
 * `products.photo_url`, etc. — ce wrapper s'occupe seulement du score.
 */

import { canonicalizeEan, detectIdentifierType } from "@/lib/identifiers/validators";
import { searchEanByName } from "@/lib/ean/lookup";
import { collectAllEanSources } from "@/lib/enrichment/multi-source";
import { lookupCipBdpm } from "@/lib/enrichment/tier1-sectoriels";
import { lookupGoogleShopping } from "@/lib/enrichment/tier3-google-shopping";
import {
    buildCascadeOutcome,
    type CascadeOutcome,
    type Tier,
} from "@/lib/enrichment/score-cascade";

export interface CascadeInput {
    ean?: string | null;
    name?: string | null;
    brand?: string | null;
    sku?: string | null;
    /** Si fourni, runCascade tente Tier 4 CLIP après les autres tiers (Cycle 9). */
    productId?: string | null;
}

// sourceToTier déplacé dans `multi-source.ts` — les fetchFromX retournent déjà
// le tier correctement mappé via collectAllEanSources.

/**
 * Exécute la cascade pour une entrée produit donnée et retourne un CascadeOutcome.
 *
 * Side effects :
 *   - lookupEan() peut écrire dans `ean_lookups` (cache) — on l'évite ici en
 *     utilisant `fetchEanData` qui ne touche pas products mais alimente le cache.
 *   - searchEanByName() touche le cache via search_ean_lookups_by_name.
 *   - **Aucune écriture dans `products.*`** depuis cette fonction.
 */
export async function runCascade(input: CascadeInput): Promise<CascadeOutcome> {
    const tiersMatched: Tier[] = [];
    let canonicalEan: string | null = null;
    let canonicalName: string | null = null;

    // ─── Étape 1 : normalise + valide checksum ───
    let canonical: string | null = null;
    let identifierType = "invalid" as ReturnType<typeof detectIdentifierType>;
    if (input.ean) {
        canonical = canonicalizeEan(input.ean);
        identifierType = detectIdentifierType(input.ean);
    }

    // ─── Étape 2 : Tier 1 sectoriel (CIP médicament) ───
    if (canonical && identifierType === "cip13") {
        const cipMatch = await lookupCipBdpm(canonical);
        if (cipMatch) {
            tiersMatched.push("tier1_cip");
            canonicalEan = canonical;
            canonicalName = cipMatch.canonical_name;
            return buildCascadeOutcome(tiersMatched, canonicalEan, canonicalName);
        }
        // Si CIP pas trouvé dans BDPM : on continue cascade Tier 2/6 quand même
    }

    // ISBN routing (différé Dilicom) — on tagge tier1_gtin_validated en attendant
    if (canonical && identifierType === "isbn13") {
        // ISBN-13 a un checksum GTIN valide + préfixe 978/979 — on peut booster
        // légèrement le tag mais sans Dilicom on dépend du Tier 6.
        // Pour V1 on laisse passer en cascade Tier 2/6.
    }

    // ─── Étape 3 : tout identifiant valide → cascade multi-source convergence (Cycle 4) ───
    // Lance EAN-Search + UPCitemdb + Open Beauty Facts + Open Products Facts en parallèle
    // et collecte tous les tiers qui matchent. Le boost de convergence permet à un EAN
    // obscur (Tier 6 seul = 0.90) qui converge avec OBF/OPF (Tier 2 = 0.97) d'atteindre
    // 0.985 → publish auto.
    if (canonical && identifierType !== "invalid") {
        const multiSource = await collectAllEanSources(canonical);
        if (multiSource.tiers_matched.length > 0) {
            for (const t of multiSource.tiers_matched) tiersMatched.push(t);
            canonicalEan = canonical;
            if (multiSource.canonical_name) {
                canonicalName = multiSource.canonical_name;
            }
        }
    }

    // ─── Étape 4 : pas d'EAN OU EAN non résolu → reverse search par nom ───
    if (!canonicalEan && input.name) {
        const reverseMatch = await searchEanByName(input.name, input.brand ?? null);
        if (reverseMatch) {
            // searchEanByName cascade : cache → ean_search → upcdb → OBF → OPF.
            // On ne sait pas quel sous-tier a matché — conservatif : tier6.
            tiersMatched.push("tier6_eansearch");
            canonicalEan = reverseMatch.ean;
            // canonical_name n'est pas garanti par searchEanByName — laissé null.
        }
    }

    // ─── Étape 4.5 (Phase 1.1) : Tier 3 Google Product Catalog via Serper ───
    // On l'appelle si on n'a PAS déjà un tier strong (1 ou 2) qui matche.
    // Pas redondant avec les autres tiers car Google Shopping indexe des
    // produits que OFF/OBF/EAN-Search n'ont pas (mode mainstream notamment).
    // Seul un match "strong" (query par EAN exact) peut booster tier3 dans la
    // cascade — un match "weak" (query par brand+name) est trop incertain
    // pour score 0.95 (risque faux positif). Le caller cascade-suggest peut
    // appeler lookupGoogleShopping séparément en weak-mode pour pré-remplir UI.
    const hasStrongTier = tiersMatched.some(
        (t) =>
            t === "tier1_cip" ||
            t === "tier1_isbn" ||
            t === "tier1_gtin_validated" ||
            t === "tier2_off" ||
            t === "tier2_obf" ||
            t === "tier2_icecat",
    );
    if (!hasStrongTier && (canonicalEan || (input.name && input.brand))) {
        try {
            const gpcMatch = await lookupGoogleShopping({
                ean: canonicalEan,
                name: input.name ?? null,
                brand: input.brand ?? null,
            });
            if (gpcMatch && gpcMatch.confidence === "strong") {
                tiersMatched.push("tier3_google_pc");
                if (!canonicalName && gpcMatch.canonical_name) {
                    canonicalName = gpcMatch.canonical_name;
                }
            }
        } catch (err) {
            if (process.env.NODE_ENV === "development") {
                console.warn("[cascade-engine] Tier 3 GPC failed:", err);
            }
        }
    }

    // ─── Étape 5 (Cycle 9) : Tier 4 CLIP si productId fourni et déjà embeddé ───
    // Lazy import pour éviter de charger Replicate/Vectorize si productId absent.
    if (input.productId) {
        try {
            const { tryClipMatchForProduct } = await import("@/lib/enrichment/clip-pipeline");
            const clipMatch = await tryClipMatchForProduct(input.productId);
            if (clipMatch.matched) {
                tiersMatched.push("tier4_clip");
                // Si on n'a pas de canonical_ean depuis les autres tiers et que le
                // candidat CLIP en a un en metadata, on pourrait l'utiliser. V2.
            }
        } catch (err) {
            // Tier 4 est best-effort — un fail ne bloque pas le score des autres tiers
            if (process.env.NODE_ENV === "development") {
                console.warn(`[cascade-engine] Tier 4 CLIP failed for ${input.productId}:`, err);
            }
        }
    }

    return buildCascadeOutcome(tiersMatched, canonicalEan, canonicalName);
}

/**
 * Variante "pure validation" — pas d'appel réseau, juste valide l'EAN.
 * Utile pour le pre-flight check (ex : au moment où le marchand tape un EAN
 * dans le wizard, on peut afficher "EAN invalide" instantanément sans cascade).
 */
export function preflightEan(ean: string | null | undefined): {
    valid: boolean;
    canonical: string | null;
    type: ReturnType<typeof detectIdentifierType>;
} {
    if (!ean) return { valid: false, canonical: null, type: "invalid" };
    const canonical = canonicalizeEan(ean);
    const type = detectIdentifierType(ean);
    return { valid: canonical !== null, canonical, type };
}
