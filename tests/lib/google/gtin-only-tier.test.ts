import { describe, expect, it } from "vitest";

import {
    gtinOnlyTierEnabled,
    isFeedEligible,
    type FeedEligibleRow,
} from "@/lib/google/feed-eligibility";
import { filterEligibleProducts, transformProductToGoogle } from "@/lib/google/feed";
import { buildLfpXml, filterFeedEligible, type LfpProductRow } from "@/lib/google/lfp-xml";

/**
 * D2 — Tier « GTIN-only → Google enrichit » (FLAG `GOOGLE_GTIN_ONLY_TIER`, OFF par défaut).
 *
 * Invariant prouvé : flag OFF = comportement actuel (image obligatoire) ; flag ON = un produit
 * GTIN+prix SANS image devient éligible, émis SANS image_link (Google matche par GTIN). La
 * relaxation ne touche QUE l'image — un produit sans GTIN ou sans prix reste exclu. Et les deux
 * canaux (Voie A `feed.ts` + Voie B `lfp-xml.ts`) émettent le MÊME ensemble dans les deux états.
 */
describe("D2 — gtinOnlyTierEnabled (lecture du flag)", () => {
    it("OFF par défaut (env vide)", () => {
        expect(gtinOnlyTierEnabled({})).toBe(false);
    });
    it("ON pour '1' et 'true'", () => {
        expect(gtinOnlyTierEnabled({ GOOGLE_GTIN_ONLY_TIER: "1" })).toBe(true);
        expect(gtinOnlyTierEnabled({ GOOGLE_GTIN_ONLY_TIER: "true" })).toBe(true);
    });
    it("OFF pour toute autre valeur ('0', 'false', 'yes')", () => {
        expect(gtinOnlyTierEnabled({ GOOGLE_GTIN_ONLY_TIER: "0" })).toBe(false);
        expect(gtinOnlyTierEnabled({ GOOGLE_GTIN_ONLY_TIER: "false" })).toBe(false);
        expect(gtinOnlyTierEnabled({ GOOGLE_GTIN_ONLY_TIER: "yes" })).toBe(false);
    });
});

describe("D2 — isFeedEligible (relaxation image)", () => {
    const gtinPriceNoImage: FeedEligibleRow = {
        ean: "0194956623215",
        price: 129.99,
        photo_url: null,
        photo_processed_url: null,
    };

    it("flag OFF (défaut) : GTIN+prix SANS image = INÉLIGIBLE (image requise)", () => {
        expect(isFeedEligible(gtinPriceNoImage)).toBe(false);
        expect(isFeedEligible(gtinPriceNoImage, { allowMissingImage: false })).toBe(false);
    });

    it("flag ON : GTIN+prix SANS image = ÉLIGIBLE (Google enrichit par GTIN)", () => {
        expect(isFeedEligible(gtinPriceNoImage, { allowMissingImage: true })).toBe(true);
    });

    it("flag ON ne relaxe QUE l'image : sans GTIN ou sans prix reste INÉLIGIBLE", () => {
        expect(isFeedEligible({ ...gtinPriceNoImage, ean: null }, { allowMissingImage: true })).toBe(false);
        expect(isFeedEligible({ ...gtinPriceNoImage, ean: "1234" }, { allowMissingImage: true })).toBe(false);
        expect(isFeedEligible({ ...gtinPriceNoImage, price: 0 }, { allowMissingImage: true })).toBe(false);
        expect(isFeedEligible({ ...gtinPriceNoImage, price: null }, { allowMissingImage: true })).toBe(false);
    });

    it("flag ON, produit AVEC image = inchangé (toujours éligible)", () => {
        const withImage = { ...gtinPriceNoImage, photo_url: "https://x/y.jpg" };
        expect(isFeedEligible(withImage, { allowMissingImage: true })).toBe(true);
    });

    it("une image chaîne VIDE ('') = pas une image (flag OFF → inéligible, pas de balise vide)", () => {
        const emptyPhoto = { ...gtinPriceNoImage, photo_url: "", photo_processed_url: "" };
        expect(isFeedEligible(emptyPhoto)).toBe(false);
        // En tier ON, ce produit rejoint le GTIN-only (image absente) plutôt que d'émettre du vide.
        expect(isFeedEligible(emptyPhoto, { allowMissingImage: true })).toBe(true);
    });
});

describe("D2 — Voie A (feed.ts) tier GTIN-only", () => {
    const base = {
        id: "p1",
        name: "Crème hydratante",
        canonical_name: "Crème hydratante 50ml",
        description: null,
        brand: "Acme",
        ean: "0194956623215",
        price: 19.99,
        photo_processed_url: null,
        photo_url: null,
        visible: true,
        stock: [{ quantity: 4 }],
    };

    it("flag OFF : produit sans image EXCLU du feed", () => {
        expect(filterEligibleProducts([base], false)).toHaveLength(0);
    });

    it("flag ON : produit sans image INCLUS, transformé SANS imageLink", () => {
        const eligible = filterEligibleProducts([base], true);
        expect(eligible).toHaveLength(1);
        const g = transformProductToGoogle(eligible[0], "store-1");
        expect(g.gtin).toBe("0194956623215");
        expect(g.price.value).toBe("19.99");
        // `imageLink` ABSENT (pas null) → JSON.stringify l'omet → Google matche par GTIN.
        expect(g.imageLink).toBeUndefined();
        expect("imageLink" in g).toBe(false);
    });

    it("flag ON : un produit AVEC image garde son imageLink", () => {
        const withImg = { ...base, id: "p2", photo_url: "https://x/y.jpg" };
        const g = transformProductToGoogle(filterEligibleProducts([withImg], true)[0], "store-1");
        expect(g.imageLink).toBe("https://x/y.jpg");
    });
});

describe("D2 — Voie B (lfp-xml.ts) tier GTIN-only", () => {
    const base: LfpProductRow = {
        id: "11111111-1111-1111-1111-111111111111",
        name: "Crème hydratante",
        canonical_name: "Crème hydratante 50ml",
        description: null,
        brand: "Acme",
        ean: "0194956623215",
        price: 19.99,
        photo_url: null,
        photo_processed_url: null,
        stock: [{ quantity: 4 }],
    };

    it("flag OFF : produit sans image EXCLU du feed", () => {
        expect(filterFeedEligible([base], false)).toHaveLength(0);
    });

    it("flag ON : produit sans image INCLUS, XML SANS balise <g:image_link> vide", () => {
        expect(filterFeedEligible([base], true)).toHaveLength(1);
        // buildLfpXml re-filtre en interne → on lui passe le flag (5e arg) sinon il ré-exclut.
        const xml = buildLfpXml({ id: "m1", name: "Boutique" }, [base], "store-1", Date.now(), true);
        expect(xml).toContain("<g:gtin>0194956623215</g:gtin>");
        // Ni balise vide, ni balise du tout — surtout PAS `<g:image_link></g:image_link>`.
        expect(xml).not.toContain("<g:image_link>");
        expect(xml).not.toContain("<g:image_link></g:image_link>");
    });

    it("flag OFF : buildLfpXml n'émet aucun item pour un produit sans image", () => {
        const xml = buildLfpXml({ id: "m1", name: "Boutique" }, [base], "store-1", Date.now(), false);
        expect(xml).not.toContain("<item>");
    });

    it("flag ON : un produit AVEC image garde sa balise image_link", () => {
        const withImg = { ...base, photo_url: "https://x/y.jpg" };
        const xml = buildLfpXml({ id: "m1", name: "Boutique" }, [withImg], "store-1", Date.now(), true);
        expect(xml).toContain("<g:image_link>https://x/y.jpg</g:image_link>");
    });
});

describe("D2 — PARITÉ Voie A/B (même ensemble dans les deux états du flag)", () => {
    // Catalogue mixte : avec image, sans image, sans GTIN, prix 0.
    const rows = [
        { id: "a", ean: "0194956623215", price: 19.99, photo_url: "https://x/a.jpg", photo_processed_url: null },
        { id: "b", ean: "0194956623215", price: 19.99, photo_url: null, photo_processed_url: null }, // sans image
        { id: "c", ean: null, price: 19.99, photo_url: null, photo_processed_url: null }, // sans GTIN
        { id: "d", ean: "0194956623215", price: 0, photo_url: "https://x/d.jpg", photo_processed_url: null }, // prix 0
    ];

    const idsA = (allow: boolean) =>
        filterEligibleProducts(
            rows.map((r) => ({
                ...r,
                name: "n",
                canonical_name: null,
                description: null,
                brand: null,
                visible: true,
                stock: [{ quantity: 1 }],
            })) as any,
            allow,
        )
            .map((p: any) => p.id)
            .sort();

    const idsB = (allow: boolean) =>
        filterFeedEligible(
            rows.map((r) => ({
                ...r,
                name: "n",
                canonical_name: null,
                description: null,
                brand: null,
                stock: [{ quantity: 1 }],
            })) as any,
            allow,
        )
            .map((p: any) => p.id)
            .sort();

    it("flag OFF : les deux canaux émettent {a} (image requise)", () => {
        expect(idsA(false)).toEqual(["a"]);
        expect(idsB(false)).toEqual(["a"]);
    });

    it("flag ON : les deux canaux émettent {a, b} (b sans image rejoint le tier), jamais c/d", () => {
        expect(idsA(true)).toEqual(["a", "b"]);
        expect(idsB(true)).toEqual(["a", "b"]);
    });
});
