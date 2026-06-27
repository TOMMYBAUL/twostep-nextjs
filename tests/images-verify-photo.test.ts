/**
 * D5 (partiel) — Gate de match image : honnêteté de `verifyPhotoWithAI`.
 *
 * North-star « zéro faux positif visuel » : une image sourcée (Serper/Google Images)
 * ne doit être publiée que si elle MATCHE le produit. Le bug corrigé (2026-06-23) :
 * la vérif IA fail-openait en `return true` sur toute erreur (HTTP !ok, timeout, throw)
 * → une image potentiellement FAUSSE acceptée sans preuve (même classe que `verifySIRET`
 * fail-open). Désormais, verification ON + erreur → false (candidat écarté, visible Sentry).
 *
 * DURCI 2026-06-27 (maillon 9 — test réel : 6/7 photos fausses publiées) : le cas
 * clé absente (verification OFF, cas prod) retournait `true` → la vérif « ne bloquait
 * RIEN ». Désormais OFF par défaut → `false` (image écartée : « ne pas pouvoir vérifier »
 * ≠ « vérifié OK », leçon SIRET). Le legacy « publier sans vérif » est gardé derrière le
 * flag escaladé `PUBLISH_UNVERIFIED_IMAGES=1` (jamais le défaut).
 *
 * Chaque assertion échouerait sur l'ancien code (qui retournait true sur erreur / sans clé).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyPhotoWithAI } from "@/lib/images/serper";

const captureMock = vi.fn();
vi.mock("@/lib/error", () => ({ captureError: (...args: unknown[]) => captureMock(...args) }));

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;
const ORIGINAL_PUBLISH_UNVERIFIED = process.env.PUBLISH_UNVERIFIED_IMAGES;
const originalFetch = globalThis.fetch;

function mockFetch(impl: () => Promise<unknown> | never) {
    globalThis.fetch = vi.fn(impl as never) as never;
}

beforeEach(() => {
    captureMock.mockClear();
    // Défaut sûr (flag absent) sauf override explicite par un test.
    delete process.env.PUBLISH_UNVERIFIED_IMAGES;
});

afterEach(() => {
    globalThis.fetch = originalFetch;
    if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
    if (ORIGINAL_PUBLISH_UNVERIFIED === undefined) delete process.env.PUBLISH_UNVERIFIED_IMAGES;
    else process.env.PUBLISH_UNVERIFIED_IMAGES = ORIGINAL_PUBLISH_UNVERIFIED;
});

describe("verifyPhotoWithAI — fail-open corrigé (north-star zéro faux positif visuel)", () => {
    it("clé présente + réponse « oui » → match accepté, aucune erreur signalée", async () => {
        process.env.ANTHROPIC_API_KEY = "sk-test";
        mockFetch(async () => ({ ok: true, json: async () => ({ content: [{ text: "Oui" }] }) }));

        const result = await verifyPhotoWithAI("https://img/ok.jpg", "Nike Air Max 90", "Nike");

        expect(result).toBe(true);
        expect(captureMock).not.toHaveBeenCalled();
    });

    it("clé présente + réponse « non » → match refusé (no-match légitime, PAS une erreur)", async () => {
        process.env.ANTHROPIC_API_KEY = "sk-test";
        mockFetch(async () => ({ ok: true, json: async () => ({ content: [{ text: "non" }] }) }));

        const result = await verifyPhotoWithAI("https://img/wrong.jpg", "Nike Air Max 90", "Nike");

        expect(result).toBe(false);
        // Un vrai no-match ne doit PAS polluer Sentry (ce n'est pas une défaillance).
        expect(captureMock).not.toHaveBeenCalled();
    });

    it("🔴→🟢 clé présente + HTTP !ok → false (candidat écarté), JAMAIS true à l'aveugle + captureError", async () => {
        process.env.ANTHROPIC_API_KEY = "sk-test";
        mockFetch(async () => ({ ok: false, status: 529, json: async () => ({}) }));

        const result = await verifyPhotoWithAI("https://img/x.jpg", "Veja V-10", "Veja");

        expect(result).toBe(false); // ancien code: true (fail-open) → publiait une image non vérifiée
        expect(captureMock).toHaveBeenCalledTimes(1);
    });

    it("🔴→🟢 clé présente + fetch throw (réseau/timeout) → false + captureError (visible)", async () => {
        process.env.ANTHROPIC_API_KEY = "sk-test";
        mockFetch(async () => {
            throw new Error("network down");
        });

        const result = await verifyPhotoWithAI("https://img/x.jpg", "APC Petit Standard", "APC");

        expect(result).toBe(false); // ancien code: catch → return true
        expect(captureMock).toHaveBeenCalledTimes(1);
    });

    it("🔴→🟢 clé ABSENTE (verification OFF, cas prod) → false PAR DÉFAUT (image écartée, jamais publiée sans vérif) + observable UNE fois", async () => {
        delete process.env.ANTHROPIC_API_KEY;
        delete process.env.PUBLISH_UNVERIFIED_IMAGES; // défaut sûr
        mockFetch(async () => {
            throw new Error("should not be called when no key");
        });

        const first = await verifyPhotoWithAI("https://img/a.jpg", "Sézane Gaspard", "Sézane");
        const second = await verifyPhotoWithAI("https://img/b.jpg", "Sézane Gaspard", "Sézane");

        // Ancien code (jusqu'au 27/06) : true → publiait l'image sans vérif (6/7 fausses au test réel).
        expect(first).toBe(false);
        expect(second).toBe(false);
        // Le mode dégradé « images bloquées faute de vérif » est signalé une fois, pas en boucle.
        expect(captureMock).toHaveBeenCalledTimes(1);
        // La vérif n'a jamais appelé fetch sans clé.
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("clé ABSENTE + PUBLISH_UNVERIFIED_IMAGES=1 (option C escaladée) → true (compat) MAIS observable UNE fois", async () => {
        delete process.env.ANTHROPIC_API_KEY;
        process.env.PUBLISH_UNVERIFIED_IMAGES = "1";
        mockFetch(async () => {
            throw new Error("should not be called when no key");
        });

        const result = await verifyPhotoWithAI("https://img/a.jpg", "Sézane Gaspard", "Sézane");

        expect(result).toBe(true); // compat explicite derrière le flag
        // (Le signalement « dégradé » est garanti UNE fois par PROCESS — déjà couvert par le
        // test défaut-OFF ci-dessus ; le guard module-level est consommé, on ne le re-teste pas.)
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    // Barre de preuve 2026-06-27 (Thomas) : un FIXTURE de paires (nom produit, image
    // manifestement fausse) que la vérif DOIT rejeter. Se teste SANS yeux en mockant la
    // réponse Haiku (« non ») — verrouille que le verdict « non » écarte TOUJOURS l'image,
    // pour chacune des paires réellement observées au test du 27/06.
    it("🔒 clé présente — chaque paire (produit, image fausse) du test réel 27/06 où Haiku répond « non » est REJETÉE", async () => {
        process.env.ANTHROPIC_API_KEY = "sk-test";
        // (produit attendu, ce que l'image fausse montrait réellement) — cf workflow-ingestion-enrichment.md
        const wrongPairs: Array<{ product: string; brand: string; saw: string }> = [
            { product: "Pantalon de travail", brand: "Carhartt", saw: "colle Loctite" },
            { product: "Casque audio", brand: "Bose", saw: "barbecue Moulinex" },
            { product: "Lunettes de soleil", brand: "Ray-Ban", saw: "scanner Zebra" },
            { product: "Chaussures", brand: "Nike", saw: "prise électrique" },
            { product: "Boîte de briques", brand: "LEGO", saw: "figurine Funko" },
            { product: "Jouet éducatif", brand: "VTech", saw: "boîte LEGO" },
        ];

        for (const { product, brand } of wrongPairs) {
            captureMock.mockClear();
            // Un vrai Haiku répondrait « non » sur ces paires : on mocke ce verdict.
            mockFetch(async () => ({ ok: true, json: async () => ({ content: [{ text: "non" }] }) }));

            const result = await verifyPhotoWithAI("https://img/wrong.jpg", product, brand);

            expect(result).toBe(false); // image écartée
            // Un no-match légitime n'est pas une défaillance → pas de bruit Sentry.
            expect(captureMock).not.toHaveBeenCalled();
        }
    });

    it("🔒 réponse Haiku vide/malformée → false (fail-closed, jamais publié à l'aveugle)", async () => {
        process.env.ANTHROPIC_API_KEY = "sk-test";
        mockFetch(async () => ({ ok: true, json: async () => ({ content: [] }) }));

        const result = await verifyPhotoWithAI("https://img/x.jpg", "Bose QuietComfort", "Bose");

        // answer = "" → !startsWith("oui") → écarté (pas de fail-open sur réponse vide).
        expect(result).toBe(false);
    });
});
