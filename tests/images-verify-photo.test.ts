/**
 * D5 (partiel) — Gate de match image : honnêteté de `verifyPhotoWithAI`.
 *
 * North-star « zéro faux positif visuel » : une image sourcée (Serper/Google Images)
 * ne doit être publiée que si elle MATCHE le produit. Le bug corrigé (2026-06-23) :
 * la vérif IA fail-openait en `return true` sur toute erreur (HTTP !ok, timeout, throw)
 * → une image potentiellement FAUSSE acceptée sans preuve (même classe que `verifySIRET`
 * fail-open). Désormais, verification ON + erreur → false (candidat écarté, visible Sentry).
 * Cas clé absente (verification OFF, cas prod) → true MAIS observable (décision escaladée).
 *
 * Chaque assertion échouerait sur l'ancien code (qui retournait true sur erreur).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyPhotoWithAI } from "@/lib/images/serper";

const captureMock = vi.fn();
vi.mock("@/lib/error", () => ({ captureError: (...args: unknown[]) => captureMock(...args) }));

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;
const originalFetch = globalThis.fetch;

function mockFetch(impl: () => Promise<unknown> | never) {
    globalThis.fetch = vi.fn(impl as never) as never;
}

beforeEach(() => {
    captureMock.mockClear();
});

afterEach(() => {
    globalThis.fetch = originalFetch;
    if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
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

    it("clé ABSENTE (verification OFF, cas prod) → true (compat) MAIS observable UNE seule fois", async () => {
        delete process.env.ANTHROPIC_API_KEY;
        mockFetch(async () => {
            throw new Error("should not be called when no key");
        });

        const first = await verifyPhotoWithAI("https://img/a.jpg", "Sézane Gaspard", "Sézane");
        const second = await verifyPhotoWithAI("https://img/b.jpg", "Sézane Gaspard", "Sézane");

        expect(first).toBe(true);
        expect(second).toBe(true);
        // Le mode dégradé « images publiées sans vérif » est signalé une fois, pas en boucle.
        expect(captureMock).toHaveBeenCalledTimes(1);
        // La vérif n'a jamais appelé fetch sans clé.
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });
});
