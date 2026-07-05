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
 * cas cache miss ET au PREMIER passage d'un EAN au cache faible (tier6) : dès
 * qu'une convergence tier2 est trouvée, elle est RÉ-ÉCRITE dans le cache (upgrade
 * monotone) → les appels suivants pour ce même EAN court-circuitent fort (0 fetch).
 * Latence parallèle ≈ source la plus lente (~2-3s) au lieu du séquentiel (~5-10s).
 */

import {
    cacheResult,
    fetchFromEanSearch,
    fetchFromOpenBeautyFacts,
    fetchFromOpenProductsFacts,
    fetchFromUpcDatabase,
    isFreshNotFound,
    isNotFoundMarker,
    type EanResult,
} from "@/lib/ean/lookup";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureError } from "@/lib/error";
import { combineTierScores, SCORE_THRESHOLDS, type Tier } from "@/lib/enrichment/score-cascade";

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

    // Tier du cache CONSERVÉ pour la fusion quand il ne suffit pas à trancher seul
    // (cf. P0-10 ci-dessous). Reste `null` si cache miss / court-circuit fort / skipCache.
    let cachedRaw: { tier: Tier; result: EanResult } | null = null;

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
            const cacheResult: EanResult = {
                name: cached.name ?? "Unknown",
                brand: cached.brand ?? null,
                photo_url: cached.photo_url_r2 ?? cached.photo_url ?? null,
                category: cached.category ?? null,
                source: cached.source ?? "cache",
            };
            // P0-10 : `ean_lookups` ne stocke qu'UNE source (celle que la cascade
            // séquentielle `lookupEan` a trouvée en 1er — EAN-Search en tête → tier6 = 0.90).
            // Court-circuiter dessus tuait la convergence multi-source : un EAN aussi présent
            // dans OBF/OPF (tier2 = 0.97) restait figé à 0.90 → `pending` au lieu de 0.985 →
            // `validated` (sous-publication du stock réel du marchand).
            //   - Cache FORT (tier suffit SEUL à auto-publier, ex. tier2 ≥ 0.95) → il TRANCHE →
            //     court-circuit (économie, déjà validated de toute façon).
            //   - Cache FAIBLE (tier6 = 0.90 < 0.95) → il ne peut PAS trancher seul : on le
            //     CONSERVE (`cachedRaw`) puis on lance quand même les sources parallèles pour
            //     DÉTECTER la convergence. Le tier caché reste dans la fusion → le score ne peut
            //     jamais RÉGRESSER si les fetch parallèles échouent transitoirement (monotone).
            if (combineTierScores([tier]) >= SCORE_THRESHOLDS.auto_publish) {
                return {
                    tiers_matched: [tier],
                    canonical_name: cacheResult.name === "Unknown" ? null : cacheResult.name,
                    canonical_brand: cacheResult.brand,
                    canonical_category: cacheResult.category,
                    canonical_photo_url: cacheResult.photo_url,
                    raw_results: [{ tier, result: cacheResult }],
                };
            }
            cachedRaw = { tier, result: cacheResult };
        }
    }

    // 2. Cache miss OU cache faible (tier6) → lancer 4 sources en parallèle (Promise.allSettled :
    //    aucune ne peut faire planter les autres). Le tier caché faible est semé EN TÊTE de la
    //    fusion (garantie de non-régression du score si le parallèle rate).
    const settled = await Promise.allSettled([
        fetchFromEanSearch(ean),
        fetchFromUpcDatabase(ean),
        fetchFromOpenBeautyFacts(ean),
        fetchFromOpenProductsFacts(ean),
    ]);

    const raw_results: Array<{ tier: Tier; result: EanResult }> = cachedRaw ? [cachedRaw] : [];
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

    // Champs canoniques FUSIONNÉS (source unique de vérité pour le retour ET le write-back
    // ci-dessous). `pickCanonical*` écarte le placeholder "Unknown" et prend le plus riche
    // champ par champ across toutes les sources matchées (cache faible inclus).
    const canonicalName = pickCanonicalName(raw_results);
    const canonicalBrand = pickCanonicalField(raw_results, "brand");
    const canonicalCategory = pickCanonicalField(raw_results, "category");
    const canonicalPhoto = pickCanonicalField(raw_results, "photo_url");

    // Write-back UPGRADE (revue SF-hunter HIGH) : on n'est ici via le chemin cache-faible
    // (`cachedRaw` posé) que parce que le cache mono-source était trop faible pour trancher.
    // Si le parallèle a découvert un tier FORT (tier2 ≥ auto_publish) que le cache ignorait,
    // on RÉ-ÉCRIT dans `ean_lookups` → le prochain lookup (ce produit ré-essayé OU un autre
    // produit/marchand au MÊME EAN) court-circuite fort au lieu de re-brûler les 4 sources +
    // les rate-limiters à chaque passage. Sans ce write-back, la convergence n'était JAMAIS
    // persistée = fuite de coût en boucle. Monotone SUR LE SCORE (jamais un downgrade de tier)
    // ET SUR LES CHAMPS : on persiste les valeurs FUSIONNÉES (jamais la source brute) sous la
    // SOURCE FORTE découverte → le write-back ne peut jamais dégrader le nom/la marque déjà
    // connus (ex. tier2 matché mais `name:"Unknown"` n'écrase PAS un vrai nom cache — revue
    // SF-hunter #2). `name` jamais null (colonne NOT NULL) → sentinelle "Unknown" (re-mappée
    // en null à la relecture). `cacheResult` = MÊME chemin d'écriture que la cascade séquentielle.
    // Best-effort : une écriture ratée ne doit pas perdre le score déjà correct → captureError.
    if (cachedRaw) {
        const upgrade = raw_results.find(
            (r) => r !== cachedRaw && combineTierScores([r.tier]) >= SCORE_THRESHOLDS.auto_publish,
        );
        if (upgrade) {
            const upgraded: EanResult = {
                name: canonicalName ?? "Unknown",
                brand: canonicalBrand,
                category: canonicalCategory,
                photo_url: canonicalPhoto,
                source: upgrade.result.source,
            };
            try {
                await cacheResult(supabase, ean, upgraded);
            } catch (err) {
                captureError(err, { module: "multi-source", phase: "cache-upgrade-writeback", ean });
            }
        }
    }

    return {
        tiers_matched: dedupedTiers,
        canonical_name: canonicalName,
        canonical_brand: canonicalBrand,
        canonical_category: canonicalCategory,
        canonical_photo_url: canonicalPhoto,
        raw_results,
    };
}
