/**
 * P0-9 (2026-07-04) — Catégorisation IA : chunking + cassure de la boucle de retry.
 *
 * Fuite corrigée : le lot de sélection (limit 200) partait en UN appel IA avec
 * max_tokens 4096 → réponse JSON tronquée dès ~50 produits → parse en échec →
 * `failed` SANS poser `ai_categorized_at` → les MÊMES produits repartaient au cron
 * enrich-products (toutes les 5 min) → tokens re-brûlés en boucle infinie pour tout
 * marchand > ~50 produits.
 *
 * Verrous prouvés ici :
 *  1. needAI est CHUNKÉ par AI_CATEGORIZE_BATCH_SIZE (30) → N appels bornés, réponse
 *     qui tient dans max_tokens ; la catégorisation légitime est intégralement appliquée ;
 *  2. échec de PARSING → le lot est MARQUÉ (ai_categorized_at + confidence 0, AUCUNE
 *     catégorie écrite = zéro faux positif) → plus de re-brûlage au run suivant ;
 *  3. provider INDISPONIBLE (aucun token consommé) → PAS de marquage : le retry du
 *     prochain run est gratuit et la catégorisation n'est pas perdue sur un blip.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureErrorMock = vi.fn();
vi.mock("@/lib/error", () => ({ captureError: (...args: unknown[]) => captureErrorMock(...args) }));
vi.mock("@/lib/enrichment/cache-taxonomy", () => ({
    getCachedTaxonomy: vi.fn(async () => null),
    cacheTaxonomy: vi.fn(async () => undefined),
}));

type Query = {
    table: string;
    op: string;
    payload?: unknown;
    calls: Array<[string, unknown[]]>;
    single: boolean;
};
type Responder = (q: Query) => { data?: unknown; error?: unknown } | undefined;

const state: { respond: Responder; queries: Query[] } = {
    respond: () => ({ data: null, error: null }),
    queries: [],
};

function makeBuilder(q: Query) {
    const b: any = new Proxy(
        {},
        {
            get(_t, prop: string) {
                if (prop === "then") {
                    const p = Promise.resolve(state.respond(q) ?? { data: null, error: null });
                    return p.then.bind(p);
                }
                if (prop === "single" || prop === "maybeSingle") {
                    return () => {
                        q.single = true;
                        return Promise.resolve(state.respond(q) ?? { data: null, error: null });
                    };
                }
                return (...args: unknown[]) => {
                    if (prop === "update" || prop === "upsert" || prop === "insert") {
                        q.op = prop;
                        q.payload = args[0];
                    }
                    q.calls.push([prop, args]);
                    return b;
                };
            },
        },
    );
    return b;
}

vi.mock("@/lib/supabase/admin", () => ({
    createAdminClient: () => ({
        from(table: string) {
            const q: Query = { table, op: "select", calls: [], single: false };
            state.queries.push(q);
            return makeBuilder(q);
        },
        rpc(name: string, params?: unknown) {
            const q: Query = { table: `rpc:${name}`, op: "rpc", payload: params, calls: [], single: false };
            state.queries.push(q);
            return Promise.resolve(state.respond(q) ?? { data: null, error: null });
        },
    }),
}));

import { categorizeMerchantProducts, AI_CATEGORIZE_BATCH_SIZE } from "@/lib/ai/categorize";

const TREE = [{ id: "cat-mode", slug: "mode", label: "Mode", parent_slug: null }];

function makeProducts(n: number) {
    return Array.from({ length: n }, (_, i) => ({
        id: `prod-${String(i).padStart(3, "0")}`,
        name: `Produit ${i}`,
        price: 10,
        ean: null, // pas d'EAN → pas de cache taxonomie → chemin IA direct
        canonical_name: null,
    }));
}

/** Extrait les ids produits du prompt envoyé au provider (lignes `id|...`). */
function idsInPrompt(prompt: string): string[] {
    return [...prompt.matchAll(/^(prod-\d+)\|/gm)].map((m) => m[1]);
}

/** Répond comme Groq : écho un élément catégorisé par produit du prompt. */
function groqEcho(confidence = 95) {
    return vi.fn(async (_url: unknown, init?: { body?: string }) => {
        const body = JSON.parse(init?.body ?? "{}");
        const prompt: string = body.messages?.[0]?.content ?? "";
        const items = idsInPrompt(prompt).map((id) => ({
            id,
            category_slug: "mode",
            subcategory_slug: null,
            secondary_categories: [],
            brand: null,
            color: null,
            gender: null,
            tags: [],
            confidence,
        }));
        return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(items) } }] }) };
    });
}

const originalFetch = globalThis.fetch;
const ORIG = {
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
};

function setupRespond(products: ReturnType<typeof makeProducts>) {
    state.respond = (q) => {
        if (q.table === "rpc:get_categories_tree") return { data: TREE, error: null };
        if (q.table === "products" && q.op === "select") {
            // 1er select = sélection (filtre ai_categorized_at IS NULL) ; 2e = catCounts.
            const isSelection = q.calls.some(([m, args]) => m === "is" && args[0] === "ai_categorized_at");
            return isSelection ? { data: products, error: null } : { data: [], error: null };
        }
        return { data: null, error: null };
    };
}

beforeEach(() => {
    state.queries = [];
    captureErrorMock.mockClear();
    process.env.GROQ_API_KEY = "gk-test";
    delete process.env.GEMINI_API_KEY;
});

afterEach(() => {
    globalThis.fetch = originalFetch;
    for (const [k, v] of Object.entries(ORIG)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
});

describe("categorizeMerchantProducts — chunking IA (P0-9)", () => {
    it("🔴→🟢 70 produits → 3 appels IA de ≤30 produits (jamais un lot de 200 > max_tokens), tous catégorisés", async () => {
        const products = makeProducts(70);
        setupRespond(products);
        const fetchMock = groqEcho();
        globalThis.fetch = fetchMock as never;

        const result = await categorizeMerchantProducts("merchant-1");

        // Chunking : 70 → 30 + 30 + 10.
        expect(fetchMock).toHaveBeenCalledTimes(3);
        const batchSizes = fetchMock.mock.calls.map(
            ([, init]) => idsInPrompt(JSON.parse((init as { body: string }).body).messages[0].content).length,
        );
        expect(batchSizes).toEqual([30, 30, 10]);
        expect(Math.max(...batchSizes)).toBeLessThanOrEqual(AI_CATEGORIZE_BATCH_SIZE);

        // Aucune perte de catégorisation légitime : les 70 sont appliqués.
        expect(result.categorized).toBe(70);
        expect(result.failed).toBe(0);
        const applied = state.queries.filter(
            (q) => q.table === "products" && q.op === "update" && (q.payload as Record<string, unknown>).category_id === "cat-mode",
        );
        expect(applied).toHaveLength(70);
    });

    it("🔴→🟢 échec de PARSING (réponse tronquée/non-JSON) → le lot est MARQUÉ (ai_categorized_at, confidence 0, AUCUNE catégorie) → la boucle de re-brûlage est cassée", async () => {
        const products = makeProducts(40); // 2 lots : 30 + 10
        setupRespond(products);
        globalThis.fetch = vi.fn(async () => ({
            ok: true,
            json: async () => ({ choices: [{ message: { content: "désolé, réponse coupée [{\"id\":" } }] }),
        })) as never;

        const result = await categorizeMerchantProducts("merchant-1");

        expect(result.categorized).toBe(0);
        expect(result.failed).toBe(40);

        // Chaque lot en échec de parse est marqué via UPDATE ... IN (ids du lot).
        const markUpdates = state.queries.filter(
            (q) =>
                q.table === "products" &&
                q.op === "update" &&
                (q.payload as Record<string, unknown>).ai_categorized_at !== undefined &&
                (q.payload as Record<string, unknown>).category_id === undefined,
        );
        expect(markUpdates).toHaveLength(2);
        const markedIds = markUpdates.flatMap((q) => {
            const inCall = q.calls.find(([m]) => m === "in");
            return (inCall?.[1][1] as string[]) ?? [];
        });
        expect(markedIds).toHaveLength(40);
        expect(new Set(markedIds).size).toBe(40);
        for (const q of markUpdates) {
            const payload = q.payload as Record<string, unknown>;
            expect(payload.ai_confidence).toBe(0); // « tentative, rien d'appliqué »
            expect(payload.category_id).toBeUndefined(); // zéro faux positif : pas de catégorie inventée
        }
        // Visible Sentry (l'échec n'est plus silencieux-et-rejoué).
        expect(captureErrorMock).toHaveBeenCalled();
    });

    it("provider INDISPONIBLE (HTTP !ok, 0 token consommé) → PAS de marquage : retry légitime au prochain run", async () => {
        const products = makeProducts(40);
        setupRespond(products);
        globalThis.fetch = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })) as never;

        const result = await categorizeMerchantProducts("merchant-1");

        expect(result.categorized).toBe(0);
        expect(result.failed).toBe(40);
        // Aucun update produits : ni catégorie, ni marquage — les produits restent
        // sélectionnables (ai_categorized_at IS NULL) pour le prochain run.
        const updates = state.queries.filter((q) => q.table === "products" && q.op === "update");
        expect(updates).toHaveLength(0);
    });

    it("seuil de confiance préservé : résultat < 70 → marqué SANS catégorie (anti-reboucle existant)", async () => {
        const products = makeProducts(5);
        setupRespond(products);
        globalThis.fetch = groqEcho(40) as never; // confiance 40 < seuil 70

        const result = await categorizeMerchantProducts("merchant-1");

        expect(result.low_confidence).toBe(5);
        expect(result.categorized).toBe(0);
        const updates = state.queries.filter((q) => q.table === "products" && q.op === "update");
        expect(updates).toHaveLength(5);
        for (const q of updates) {
            const payload = q.payload as Record<string, unknown>;
            expect(payload.ai_categorized_at).toBeDefined();
            expect(payload.category_id).toBeUndefined();
        }
    });
});
