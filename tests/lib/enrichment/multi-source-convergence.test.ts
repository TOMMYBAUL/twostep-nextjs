/**
 * P0-10 (2026-07-06) — Convergence multi-source ressuscitée.
 *
 * Bug fermé : `ean_lookups` ne stocke qu'UNE source (celle que la cascade
 * séquentielle `lookupEan` trouve en 1er — EAN-Search en tête → tier6 = 0.90).
 * `collectAllEanSources` court-circuitait sur ce cache mono-source → un EAN aussi
 * présent dans OBF/OPF (tier2 = 0.97) restait figé à 0.90 → `pending` au lieu de
 * 0.985 → `validated`. Empiriquement observé en prod : 13/13 lignes cache = tier6.
 *
 * Verrous prouvés ici :
 *  1. cache FAIBLE (tier6, 0.90 < auto_publish) → lance QUAND MÊME les sources
 *     parallèles → convergence tier6+tier2 détectée (le cœur du fix) ;
 *  2. cache FORT (tier2, 0.97 ≥ auto_publish) → court-circuit, AUCUN fetch (économie) ;
 *  3. cache faible + parallèle vide/en échec → NON-RÉGRESSION : on garde le tier caché
 *     (le score ne peut jamais descendre sous le cache) ;
 *  4. marqueur not_found frais → empty, aucun fetch ;
 *  5. cache miss → comportement parallèle inchangé ;
 *  6. skipCache → le cache (même fort) est ignoré, parallèle lancé.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ cacheRow: null as Record<string, unknown> | null }));

const captureErrorMock = vi.fn();
vi.mock("@/lib/error", () => ({ captureError: (...a: unknown[]) => captureErrorMock(...a) }));

vi.mock("@/lib/supabase/admin", () => ({
    createAdminClient: () => ({
        from: () => {
            const b: Record<string, unknown> = {};
            b.select = () => b;
            b.eq = () => b;
            b.single = () => Promise.resolve({ data: h.cacheRow, error: null });
            return b;
        },
    }),
}));

// On garde les VRAIS isNotFoundMarker / isFreshNotFound (purs) et on mocke
// uniquement les 4 fetchers réseau.
vi.mock("@/lib/ean/lookup", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/ean/lookup")>();
    return {
        ...actual,
        fetchFromEanSearch: vi.fn(),
        fetchFromUpcDatabase: vi.fn(),
        fetchFromOpenBeautyFacts: vi.fn(),
        fetchFromOpenProductsFacts: vi.fn(),
        cacheResult: vi.fn(async () => undefined),
    };
});

import { collectAllEanSources } from "@/lib/enrichment/multi-source";
import { combineTierScores } from "@/lib/enrichment/score-cascade";
import {
    fetchFromEanSearch,
    fetchFromUpcDatabase,
    fetchFromOpenBeautyFacts,
    fetchFromOpenProductsFacts,
    cacheResult,
    EAN_NOT_FOUND_SOURCE,
    type EanResult,
} from "@/lib/ean/lookup";

const mEanSearch = vi.mocked(fetchFromEanSearch);
const mUpc = vi.mocked(fetchFromUpcDatabase);
const mObf = vi.mocked(fetchFromOpenBeautyFacts);
const mOpf = vi.mocked(fetchFromOpenProductsFacts);
const mCacheResult = vi.mocked(cacheResult);

const EAN = "5449000000996"; // 13 chiffres valides pour la regex

const eanSearchResult: EanResult = {
    name: "Nike Air Force 1",
    brand: null,
    photo_url: null,
    category: null,
    source: "ean_search",
};
const obfResult: EanResult = {
    name: "Nike Air Force 1 White Low Sneaker",
    brand: "Nike",
    photo_url: "https://img/af1.jpg",
    category: "shoes",
    source: "open_beauty_facts",
};

function weakCacheRow(): Record<string, unknown> {
    return {
        name: "Nike Air Force 1",
        brand: null,
        photo_url: null,
        photo_url_r2: null,
        category: null,
        source: "ean_search", // tier6 = 0.90
        fetched_at: new Date().toISOString(),
    };
}
function strongCacheRow(): Record<string, unknown> {
    return {
        name: "Nike Air Force 1 White",
        brand: "Nike",
        photo_url: "https://img/af1.jpg",
        photo_url_r2: null,
        category: "shoes",
        source: "open_beauty_facts", // tier2 = 0.97
        fetched_at: new Date().toISOString(),
    };
}

beforeEach(() => {
    h.cacheRow = null;
    mEanSearch.mockReset().mockResolvedValue(null);
    mUpc.mockReset().mockResolvedValue(null);
    mObf.mockReset().mockResolvedValue(null);
    mOpf.mockReset().mockResolvedValue(null);
    mCacheResult.mockReset().mockResolvedValue(undefined);
    captureErrorMock.mockReset();
});

describe("collectAllEanSources — convergence sur cache faible (P0-10)", () => {
    it("cache tier6 (0.90) + OBF présent → convergence tier6+tier2 → score validated", async () => {
        h.cacheRow = weakCacheRow();
        // Le parallèle re-trouve EAN-Search ET découvre OBF (que le cache mono-source ignorait).
        mEanSearch.mockResolvedValue(eanSearchResult);
        mObf.mockResolvedValue(obfResult);

        const res = await collectAllEanSources(EAN);

        // Le fetch parallèle A ÉTÉ lancé (c'est le cœur du fix : pas de court-circuit sur cache faible).
        expect(mObf).toHaveBeenCalledTimes(1);
        expect(res.tiers_matched).toContain("tier6_eansearch");
        expect(res.tiers_matched).toContain("tier2_obf");
        // tier caché conservé EN TÊTE (non-régression), pas dupliqué.
        expect(res.tiers_matched.filter((t) => t === "tier6_eansearch")).toHaveLength(1);
        // 0.97 (max) + 0.015 (convergence) = 0.985 ≥ auto_publish → publiable.
        expect(combineTierScores(res.tiers_matched)).toBeGreaterThan(0.95);
        // Données enrichies préférées depuis tier2 (mieux structuré).
        expect(res.canonical_brand).toBe("Nike");
        expect(res.canonical_photo_url).toBe("https://img/af1.jpg");
        // Write-back UPGRADE : le tier2 découvert est ré-écrit dans le cache → les
        // futurs appels court-circuitent fort (fin de la fuite de coût, revue SF-hunter HIGH).
        expect(mCacheResult).toHaveBeenCalledTimes(1);
        expect(mCacheResult.mock.calls[0][2]).toMatchObject({ source: "open_beauty_facts" });
    });

    it("write-back ne dégrade PAS le nom : tier2 matché mais name='Unknown' → persiste le vrai nom cache (SF-hunter #2)", async () => {
        h.cacheRow = weakCacheRow(); // name réel "Nike Air Force 1"
        // OBF matche (score 0.97) mais SANS titre → name placeholder "Unknown".
        mObf.mockResolvedValue({ ...obfResult, name: "Unknown" });

        const res = await collectAllEanSources(EAN);

        // Convergence quand même (le tier compte pour le score).
        expect(res.tiers_matched).toContain("tier2_obf");
        expect(combineTierScores(res.tiers_matched)).toBeGreaterThan(0.95);
        // Le nom fusionné reste le VRAI nom (jamais "Unknown"), et c'est LUI qu'on ré-écrit.
        expect(res.canonical_name).toBe("Nike Air Force 1");
        expect(mCacheResult).toHaveBeenCalledTimes(1);
        const written = mCacheResult.mock.calls[0][2] as { name: string; source: string };
        expect(written.name).toBe("Nike Air Force 1");
        expect(written.name).not.toBe("Unknown");
        expect(written.source).toBe("open_beauty_facts"); // source FORTE → futur court-circuit fort
    });

    it("write-back : échec d'écriture cache → score/retour PRÉSERVÉS + captureError", async () => {
        h.cacheRow = weakCacheRow();
        mObf.mockResolvedValue(obfResult);
        mCacheResult.mockRejectedValue(new Error("db down"));

        const res = await collectAllEanSources(EAN);

        // La convergence déjà calculée n'est PAS perdue à cause d'un blip d'écriture.
        expect(res.tiers_matched).toContain("tier2_obf");
        expect(combineTierScores(res.tiers_matched)).toBeGreaterThan(0.95);
        expect(captureErrorMock).toHaveBeenCalledTimes(1);
    });

    it("cache tier2 (0.97) → court-circuit : AUCUN fetch parallèle", async () => {
        h.cacheRow = strongCacheRow();

        const res = await collectAllEanSources(EAN);

        expect(mEanSearch).not.toHaveBeenCalled();
        expect(mUpc).not.toHaveBeenCalled();
        expect(mObf).not.toHaveBeenCalled();
        expect(mOpf).not.toHaveBeenCalled();
        expect(res.tiers_matched).toEqual(["tier2_obf"]);
        // Court-circuit fort = le cache est déjà bon → aucune ré-écriture.
        expect(mCacheResult).not.toHaveBeenCalled();
    });

    it("cache faible + parallèle vide → NON-RÉGRESSION : garde le tier caché", async () => {
        h.cacheRow = weakCacheRow();
        // Tous les fetchers répondent null (aucune source ne re-trouve l'EAN ce coup-ci).

        const res = await collectAllEanSources(EAN);

        expect(res.tiers_matched).toEqual(["tier6_eansearch"]);
        expect(res.canonical_name).toBe("Nike Air Force 1");
        // Le score ne descend jamais sous le cache.
        expect(combineTierScores(res.tiers_matched)).toBe(0.9);
        // Rien de plus fort trouvé → PAS de write-back (on ne réécrit pas tier6→tier6).
        expect(mCacheResult).not.toHaveBeenCalled();
    });

    it("cache faible + parallèle re-trouve tier6 SEUL → pas de write-back (monotone)", async () => {
        h.cacheRow = weakCacheRow();
        mEanSearch.mockResolvedValue(eanSearchResult); // tier6 à nouveau, pas plus fort

        const res = await collectAllEanSources(EAN);

        expect(res.tiers_matched).toEqual(["tier6_eansearch"]);
        // Aucun tier ≥ auto_publish découvert → on n'écrase pas le cache.
        expect(mCacheResult).not.toHaveBeenCalled();
    });

    it("cache faible + parallèle en ERREUR (reject) → NON-RÉGRESSION : garde le tier caché", async () => {
        h.cacheRow = weakCacheRow();
        mEanSearch.mockRejectedValue(new Error("timeout"));
        mUpc.mockRejectedValue(new Error("timeout"));
        mObf.mockRejectedValue(new Error("500"));
        mOpf.mockRejectedValue(new Error("500"));

        const res = await collectAllEanSources(EAN);

        expect(res.tiers_matched).toEqual(["tier6_eansearch"]);
        expect(combineTierScores(res.tiers_matched)).toBe(0.9);
    });

    it("marqueur not_found frais → empty, aucun fetch", async () => {
        h.cacheRow = { ean: EAN, name: "", source: EAN_NOT_FOUND_SOURCE, fetched_at: new Date().toISOString() };

        const res = await collectAllEanSources(EAN);

        expect(res.tiers_matched).toEqual([]);
        expect(mEanSearch).not.toHaveBeenCalled();
        expect(mObf).not.toHaveBeenCalled();
    });

    it("cache miss → parallèle inchangé (OBF seul → tier2)", async () => {
        h.cacheRow = null;
        mObf.mockResolvedValue(obfResult);

        const res = await collectAllEanSources(EAN);

        expect(res.tiers_matched).toEqual(["tier2_obf"]);
        expect(res.canonical_brand).toBe("Nike");
    });

    it("skipCache=true → ignore le cache FORT et lance quand même le parallèle", async () => {
        h.cacheRow = strongCacheRow();
        mObf.mockResolvedValue(obfResult);

        const res = await collectAllEanSources(EAN, true);

        expect(mObf).toHaveBeenCalledTimes(1);
        expect(res.tiers_matched).toEqual(["tier2_obf"]);
    });
});
