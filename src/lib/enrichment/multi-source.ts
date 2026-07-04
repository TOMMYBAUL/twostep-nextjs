/**
 * Multi-source convergence (Cycle 4).
 *
 * Au lieu de short-circuit au 1er tier qui répond, on lance TOUTES les sources
 * Tier 2 + Tier 6 en parallèle (Promise.allSettled) et on retourne la liste
 * complète des tiers matchés.
 *
 * Bénéfice : le scoring `combineTierScores` applique le boost de convergence
 * naturellement (max + 0.015 par tier supplémentaire), permettant à un EAN
 * obscur (Tier 6 EAN-Search seul = 0.90) qui converge avec OBF/OPF (Tier 2 = 0.97)
 * d'atteindre 0.985 → publish auto.
 *
 * Coût : on appelle 4 sources au lieu d'arrêter à la 1ère. ~4× plus de calls
 * externes, mais grâce au cache local `ean_lookups` ce surcoût est borné aux
 * cas cache miss. Latence parallèle ≈ source la plus lente (~2-3s) au lieu
 * du séquentiel (~5-10s) → en pratique plus rapide qu'avant.
 */

import {
    fetchFromEanSearch,
    fetchFromOpenBeautyFacts,
    fetchFromOpenProductsFacts,
    fetchFromUpcDatabase,
    isFreshNotFound,
    isNotFoundMarker,
    type EanResult,
} from "@/lib/ean/lookup";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tier } from "@/lib/enrichment/score-cascade";

export type MultiSourceResult = {
    tiers_matched: Tier[];
    canonical_name: string | null;
    canonical_brand: string | null;
    canonical_category: string | null;
    canonical_photo_url: string | null;
    /** Liste brute des résultats par source pour traçabilité et merge custom. */
    raw_results: Array<{ tier: Tier; result: EanResult }>;
};

/**
 * Mappe le `source` retourné par les fetchFromX vers le Tier correspondant.
 * Source de vérité : les `source` strings dans `lookup.ts`.
 */
function sourceToTier(source: string): Tier | null {
    switch (source) {
        case "open_beauty_facts":
            return "tier2_obf";
        case "open_products_facts":
            return "tier2_opf";
        case "open_food_facts":
            return "tier2_off";
        case "ean_search":
        case "upc_database":
            return "tier6_eansearch";
        default:
            return null;
    }
}

/**
 * Choisit le canonical_name le plus complet parmi les sources qui ont matché.
 *
 * Stratégie : préférer le nom le plus long (souvent le plus complet) parmi les
 * sources Tier 2 (OBF/OPF) qui ont une donnée structurée. Fallback Tier 6.
 * Filtre les "Unknown" littéraux retournés par lookup.ts.
 */
function pickCanonicalName(
    results: Array<{ tier: Tier; result: EanResult }>,
): string | null {
    const tier2 = results
        .filter((r) => r.tier.startsWith("tier2"))
        .map((r) => r.result.name)
        .filter((n): n is string => typeof n === "string" && n !== "Unknown");
    const tier6 = results
        .filter((r) => r.tier === "tier6_eansearch")
        .map((r) => r.result.name)
        .filter((n): n is string => typeof n === "string" && n !== "Unknown");

    const all = [...tier2, ...tier6];
    if (all.length === 0) return null;
    // Le plus long = le plus complet en pratique (variantes EU vs US, etc.)
    return all.reduce((longest, current) =>
        current.length > longest.length ? current : longest,
    );
}

/** Première brand non-null (priorité Tier 2). */
function pickCanonicalField(
    results: Array<{ tier: Tier; result: EanResult }>,
    field: "brand" | "category" | "photo_url",
): string | null {
    // Tier 2 d'abord (Open Facts = données les mieux structurées)
    for (const r of results.filter((r) => r.tier.startsWith("tier2"))) {
        const v = r.result[field];
        if (v) return v;
    }
    // Fallback Tier 6
    for (const r of results.filter((r) => r.tier === "tier6_eansearch")) {
        const v = r.result[field];
        if (v) return v;
    }
    return null;
}

/**
 * Lance toutes les sources EAN en parallèle et collecte les résultats.
 *
 * @param ean — Identifiant EAN-13/UPC-12/EAN-8 normalisé (caller doit avoir
 *   passé canonicalizeEan AVANT pour rejeter les invalides).
 * @param skipCache — true si le caller a déjà checké le cache local.
 */
export async function collectAllEanSources(
    ean: string,
    skipCache = false,
): Promise<MultiSourceResult> {
    const empty: MultiSourceResult = {
        tiers_matched: [],
        canonical_name: null,
        canonical_brand: null,
        canonical_category: null,
        canonical_photo_url: null,
        raw_results: [],
    };

    if (!/^\d{8,13}$/.test(ean)) return empty;

    const supabase = createAdminClient();

    // 1. Cache local — peut court-circuiter si trouvé (1 call DB ~5ms)
    if (!skipCache) {
        const { data: cached } = await supabase
            .from("ean_lookups")
            .select("name, brand, photo_url, photo_url_r2, category, source, fetched_at")
            .eq("ean", ean)
            .single();

        // Marqueur négatif (C1) : « introuvable partout » n'est PAS un hit — sans ce
        // garde, la ligne not_found fabriquerait un faux tier6 (name vide) qui gonflerait
        // le score d'identification (faux positif). Frais → 0 appel externe (économie) ;
        // périmé → on retombe sur les 4 sources parallèles ci-dessous.
        if (cached && isNotFoundMarker(cached)) {
            if (isFreshNotFound(cached)) return empty;
        } else if (cached) {
            const tier = sourceToTier(cached.source ?? "") ?? "tier6_eansearch";
            // Cache hit : on remonte tier originel + on tente quand même les autres sources
            // pour boost de convergence (mais on accepte que le cache nous suffise si un seul tier).
            const cacheResult: EanResult = {
                name: cached.name ?? "Unknown",
                brand: cached.brand ?? null,
                photo_url: cached.photo_url_r2 ?? cached.photo_url ?? null,
                category: cached.category ?? null,
                source: cached.source ?? "cache",
            };
            return {
                tiers_matched: [tier],
                canonical_name: cacheResult.name === "Unknown" ? null : cacheResult.name,
                canonical_brand: cacheResult.brand,
                canonical_category: cacheResult.category,
                canonical_photo_url: cacheResult.photo_url,
                raw_results: [{ tier, result: cacheResult }],
            };
        }
    }

    // 2. Cache miss → lancer 4 sources en parallèle (Promise.allSettled : aucune ne peut faire planter les autres)
    const settled = await Promise.allSettled([
        fetchFromEanSearch(ean),
        fetchFromUpcDatabase(ean),
        fetchFromOpenBeautyFacts(ean),
        fetchFromOpenProductsFacts(ean),
    ]);

    const raw_results: Array<{ tier: Tier; result: EanResult }> = [];
    for (const s of settled) {
        if (s.status === "fulfilled" && s.value) {
            const tier = sourceToTier(s.value.source);
            if (tier) raw_results.push({ tier, result: s.value });
        }
    }

    if (raw_results.length === 0) return empty;

    // Dédup tier (un EAN ne peut matcher qu'une fois par tier — on garde le 1er)
    const seenTiers = new Set<Tier>();
    const dedupedTiers: Tier[] = [];
    for (const r of raw_results) {
        if (!seenTiers.has(r.tier)) {
            seenTiers.add(r.tier);
            dedupedTiers.push(r.tier);
        }
    }

    return {
        tiers_matched: dedupedTiers,
        canonical_name: pickCanonicalName(raw_results),
        canonical_brand: pickCanonicalField(raw_results, "brand"),
        canonical_category: pickCanonicalField(raw_results, "category"),
        canonical_photo_url: pickCanonicalField(raw_results, "photo_url"),
        raw_results,
    };
}
