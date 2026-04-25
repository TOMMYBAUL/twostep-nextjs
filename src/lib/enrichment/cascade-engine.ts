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
import { fetchEanData, searchEanByName } from "@/lib/ean/lookup";
import { lookupCipBdpm } from "@/lib/enrichment/tier1-sectoriels";
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
}

/** Map d'une source `lookupEan` vers le tier correspondant pour le scoring. */
function sourceToTier(source: string | null | undefined): Tier | null {
    if (!source) return null;
    switch (source) {
        case "open_beauty_facts":
            return "tier2_obf";
        case "open_products_facts":
            // Open Products Facts couvre tech/jouets/vêtements — équivalent Icecat
            return "tier2_icecat";
        case "open_food_facts":
            return "tier2_off";
        case "ean_search":
            return "tier6_eansearch";
        case "upc_database":
            return "tier6_eansearch"; // UPCitemdb = même tier de fallback
        case "cache":
            // Cache hit = on ne sait pas quel tier originel a rempli le cache.
            // Conservatif : on attribue Tier 6 (le plus bas commun).
            return "tier6_eansearch";
        default:
            return null;
    }
}

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

    // ─── Étape 3 : tout identifiant valide (EAN/UPC/EAN-8/ISBN/CIP fallback) → cascade Tier 2/6 ───
    // ISBN et CIP retombent ici si Tier 1 sectoriel n'a pas matché (BDPM down ou CIP retiré, Dilicom différé)
    if (canonical && identifierType !== "invalid") {
        const result = await fetchEanData(canonical);
        if (result) {
            const tier = sourceToTier(result.source);
            if (tier) tiersMatched.push(tier);
            canonicalEan = canonical;
            if (result.name && result.name !== "Unknown") {
                canonicalName = result.name;
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
