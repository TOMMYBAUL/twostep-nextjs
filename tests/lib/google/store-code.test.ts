import { describe, expect, it } from "vitest";

import { defaultStoreCode, resolveStoreCode } from "@/lib/google/store-code";

const MERCHANT_ID = "11111111-2222-3333-4444-555555555555";

describe("defaultStoreCode", () => {
    it("génère le format canonique twostep-{id8}", () => {
        expect(defaultStoreCode(MERCHANT_ID)).toBe("twostep-11111111");
    });

    it("est déterministe (mêmes entrées → même sortie)", () => {
        expect(defaultStoreCode(MERCHANT_ID)).toBe(defaultStoreCode(MERCHANT_ID));
    });

    it("matche EXACTEMENT la formule du callback OAuth (anti-divergence Voie A/B)", () => {
        // Le callback persiste `twostep-${merchantId.slice(0, 8)}` ; ce test verrouille
        // que le générateur partagé reste identique pour ne pas re-diverger.
        expect(defaultStoreCode(MERCHANT_ID)).toBe(`twostep-${MERCHANT_ID.slice(0, 8)}`);
    });
});

describe("resolveStoreCode", () => {
    it("privilégie la valeur persistée (connexion Content API)", () => {
        expect(resolveStoreCode(MERCHANT_ID, "twostep-11111111")).toBe("twostep-11111111");
    });

    it("retombe sur le défaut déterministe si pas de connexion", () => {
        expect(resolveStoreCode(MERCHANT_ID, null)).toBe("twostep-11111111");
        expect(resolveStoreCode(MERCHANT_ID, undefined)).toBe("twostep-11111111");
    });

    it("retombe sur le défaut si la valeur persistée est vide / blanche", () => {
        expect(resolveStoreCode(MERCHANT_ID, "")).toBe("twostep-11111111");
        expect(resolveStoreCode(MERCHANT_ID, "   ")).toBe("twostep-11111111");
    });

    it("trim la valeur persistée", () => {
        expect(resolveStoreCode(MERCHANT_ID, "  custom-store  ")).toBe("custom-store");
    });

    it("ne dérive JAMAIS du slug (le slug n'est plus jamais passé ici)", () => {
        // resolveStoreCode ne reçoit que (merchantId, connectionStoreCode) — aucune
        // entrée slug possible. Une connexion custom (futur Business Profile) prime.
        expect(resolveStoreCode(MERCHANT_ID, "GBP-location-9876")).toBe("GBP-location-9876");
    });
});
