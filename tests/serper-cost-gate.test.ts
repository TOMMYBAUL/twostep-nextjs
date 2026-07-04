/**
 * C2 (2026-07-04) — Court-circuit coût de searchProductImage.
 *
 * Fuite corrigée : quand `ANTHROPIC_API_KEY` est ABSENTE (état prod), la recherche
 * Serper était quand même ACHETÉE (requête images + HEAD checks), puis CHAQUE
 * candidat était écarté fail-closed par verifyPhotoWithAI → 100 % des crédits
 * Serper brûlés pour 0 image publiée. Désormais : sans clé de vérif et sans opt-in
 * `PUBLISH_UNVERIFIED_IMAGES=1`, on retourne null AVANT tout appel réseau.
 *
 * La sémantique de PUBLICATION est inchangée (le gate ne publie rien de plus ni de
 * moins que l'existant : les candidats étaient déjà tous rejetés) — seul l'ACHAT
 * disparaît.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchProductImage } from "@/lib/images/serper";

const captureMock = vi.fn();
vi.mock("@/lib/error", () => ({ captureError: (...args: unknown[]) => captureMock(...args) }));

const ORIG = {
    SERPER_API_KEY: process.env.SERPER_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    PUBLISH_UNVERIFIED_IMAGES: process.env.PUBLISH_UNVERIFIED_IMAGES,
};
const originalFetch = globalThis.fetch;

beforeEach(() => {
    captureMock.mockClear();
    process.env.SERPER_API_KEY = "serper-test";
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.PUBLISH_UNVERIFIED_IMAGES;
    // Toute requête réseau serait un ACHAT : le spy permet d'affirmer « 0 fetch ».
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ images: [] }) })) as never;
});

afterEach(() => {
    globalThis.fetch = originalFetch;
    for (const [k, v] of Object.entries(ORIG)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
});

describe("searchProductImage — gate coût quand la vérif IA est impossible", () => {
    it("🔴→🟢 clé de vérif ABSENTE + flag absent (état prod) → null AVANT tout fetch Serper (0 crédit acheté), signalé une fois", async () => {
        const first = await searchProductImage("Nike Air Max 90", "Nike");
        const second = await searchProductImage("Veja V-10", "Veja");

        expect(first).toBeNull();
        expect(second).toBeNull();
        // Ancien code : 1-3 requêtes Serper + HEAD checks par produit, tout ça pour
        // que verifyPhotoWithAI écarte chaque candidat faute de clé.
        expect(globalThis.fetch).not.toHaveBeenCalled();
        // Mode dégradé observable UNE fois par process (pas de flood Sentry).
        expect(captureMock).toHaveBeenCalledTimes(1);
    });

    it("PUBLISH_UNVERIFIED_IMAGES=1 (opt-in escaladé) → la recherche Serper reste achetée (compat legacy)", async () => {
        process.env.PUBLISH_UNVERIFIED_IMAGES = "1";

        await searchProductImage("Nike Air Max 90", "Nike");

        // Le gate ne bloque pas l'opt-in explicite : Serper est bien interrogé.
        expect(globalThis.fetch).toHaveBeenCalled();
        const firstUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(String(firstUrl)).toContain("google.serper.dev/images");
    });

    it("clé de vérif PRÉSENTE → comportement inchangé (Serper interrogé, la vérif décidera candidat par candidat)", async () => {
        process.env.ANTHROPIC_API_KEY = "sk-test";

        const result = await searchProductImage("Nike Air Max 90", "Nike");

        expect(globalThis.fetch).toHaveBeenCalled(); // recherche achetée, légitime
        expect(result).toBeNull(); // 0 image dans la réponse mockée → null propre
    });

    it("SERPER_API_KEY absente → null sans fetch (garde existante préservée)", async () => {
        delete process.env.SERPER_API_KEY;
        process.env.ANTHROPIC_API_KEY = "sk-test";

        const result = await searchProductImage("Nike Air Max 90", "Nike");

        expect(result).toBeNull();
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });
});
