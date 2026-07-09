import { describe, expect, it } from "vitest";
import { canonicalizeBrand, extractKnownBrand, resolveBrand, KNOWN_BRANDS } from "@/lib/ean/brand";

describe("extractKnownBrand", () => {
    // ── The real-world regression (maillon 9 test of 2026-06-27): brand was null 7/7. ──
    // These are realistic authoritative resolved names (what EAN-Search / OBF return) for the
    // 7 scanned barcodes. EAN-Search returns brand=null, so before this fix all 7 stayed null.
    // This is the "preuve sans yeux": a fixture that locks the brand recovery without needing
    // to look at a screen.
    it.each([
        ["Carhartt WIP Master Pant Black", "Carhartt"],
        ["Bose QuietComfort 45 Wireless Headphones Black", "Bose"],
        ["Ray-Ban RB2140 Original Wayfarer 901", "Ray-Ban"],
        ["Nike Air Force 1 '07 Men's White", "Nike"],
        ["LEGO Technic 42115 Lamborghini Sián", "Lego"],
        ["VTech Baby Walker 2-in-1", "VTech"],
        ["Coca-Cola Original Taste 33cl", "Coca-Cola"],
    ])("recovers the brand from %j → %s", (resolvedName, expected) => {
        expect(extractKnownBrand(resolvedName)).toBe(expected);
    });

    it("matches case-insensitively and through diacritics/hyphens", () => {
        expect(extractKnownBrand("CHAUSSURES NIKE AIR MAX")).toBe("Nike");
        expect(extractKnownBrand("lunettes ray ban wayfarer")).toBe("Ray-Ban");
        expect(extractKnownBrand("Crème L'Oréal Paris Revitalift")).toBe("L'Oréal");
        expect(extractKnownBrand("Soin Avene Cicalfate")).toBe("Avène");
    });

    it("matches a brand that appears mid-name, not only as the leading token", () => {
        expect(extractKnownBrand("Casque audio sans fil Bose noir")).toBe("Bose");
        expect(extractKnownBrand("Sac à dos Eastpak Padded")).toBe("Eastpak");
    });

    it("prefers a multi-word brand over a shorter substring brand", () => {
        // "New Balance 574" — must resolve to "New Balance", never a lone token.
        expect(extractKnownBrand("New Balance 574 Core Grey")).toBe("New Balance");
        expect(extractKnownBrand("The North Face Nuptse Jacket")).toBe("The North Face");
    });

    // ── Adversarial: the allow-list must NEVER produce a false positive (north-star). ──
    it("does NOT match a brand that is only a substring of another word", () => {
        expect(extractKnownBrand("technike workwear trousers")).toBeNull(); // not Nike
        expect(extractKnownBrand("vulgaris commune")).toBeNull(); // not LG
        expect(extractKnownBrand("appletini cocktail mix")).toBeNull(); // not Apple
        expect(extractKnownBrand("sonyclap toy")).toBeNull(); // not Sony
    });

    it("does NOT list 3-letter acronyms that collide with unrelated products (revue SF-hunter 2026-07-10)", () => {
        // « SVR » (marque pharma) matcherait en mot entier le trim d'un modèle auto —
        // exactement le faux positif que l'allow-list doit rendre impossible.
        expect(KNOWN_BRANDS).not.toContain("SVR");
        expect(extractKnownBrand("Hot Wheels Range Rover Sport SVR Miniature 1:64")).toBe("Hot Wheels");
    });

    it("returns null for an unrecognised brand (never invents)", () => {
        expect(extractKnownBrand("Marque Inconnue Pantalon Bleu")).toBeNull();
        expect(extractKnownBrand("Generic No-Name Hoodie Size M")).toBeNull();
    });

    it("returns null for empty / nullish input", () => {
        expect(extractKnownBrand(null)).toBeNull();
        expect(extractKnownBrand(undefined)).toBeNull();
        expect(extractKnownBrand("")).toBeNull();
        expect(extractKnownBrand("   ")).toBeNull();
        expect(extractKnownBrand("Unknown")).toBeNull(); // the placeholder name from sources
        expect(extractKnownBrand("123456 7890")).toBeNull(); // a bare EAN-ish string
    });
});

describe("canonicalizeBrand — marques sources OBF/OPF brutes (vitrine réelle 2026-07-09)", () => {
    // ── Les 3 défauts RÉELS du rapport vitrine Maison Garonne (champ `brands` OBF brut). ──
    it("parse la liste à virgules OBF : le tag primaire gagne, jamais le parent en 2e position", () => {
        // Ligne réelle du rapport : Lipikar Baume AP+M → brand "La Roche-Posay, loreal"
        expect(canonicalizeBrand("La Roche-Posay, loreal")).toBe("La Roche-Posay");
    });

    it("réémet la casse canonique d'une marque allow-list (WELEDA → Weleda)", () => {
        // Ligne réelle : Weleda Déodorant roll-on → brand "WELEDA"
        expect(canonicalizeBrand("WELEDA")).toBe("Weleda");
    });

    it("canonicalise un tag primaire qui CONTIENT une marque allow-list", () => {
        // Ligne réelle : Stick lèvres → brand "L'Occitane en Provence"
        expect(canonicalizeBrand("L'Occitane en Provence")).toBe("L'Occitane");
    });

    // ── Contrat zéro-invention. ──
    it("marque inconnue : tag primaire VERBATIM, jamais inventé ni perdu", () => {
        expect(canonicalizeBrand("Byredo")).toBe("Byredo");
        expect(canonicalizeBrand("Marque Privée X, groupe Y")).toBe("Marque Privée X");
    });

    it("ne promeut JAMAIS un tag ultérieur connu par-dessus le tag primaire inconnu", () => {
        // Le 2e tag est souvent le groupe parent — l'émettre serait une fausse marque plausible.
        expect(canonicalizeBrand("Mixa, Nivea")).toBe("Mixa");
    });

    it("tags vides en tête : premier tag NON vide ; entrée vide/nullish → null", () => {
        expect(canonicalizeBrand(" , WELEDA")).toBe("Weleda");
        expect(canonicalizeBrand(null)).toBeNull();
        expect(canonicalizeBrand(undefined)).toBeNull();
        expect(canonicalizeBrand("")).toBeNull();
        expect(canonicalizeBrand(" , , ")).toBeNull();
    });
});

describe("resolveBrand precedence", () => {
    it("trusts the source brand when present (and trims it)", () => {
        expect(resolveBrand("New Balance", "Nike Air Max", "Sneaker")).toBe("New Balance");
        expect(resolveBrand("  Adidas  ", null, null)).toBe("Adidas");
    });

    it("falls back to the resolved name when the source has no brand", () => {
        expect(resolveBrand(null, "Nike Air Force 1 White", "AF1 blanc")).toBe("Nike");
        expect(resolveBrand("", "Bose QuietComfort 45", null)).toBe("Bose");
    });

    it("falls back to the merchant name when neither source nor resolved name has a brand", () => {
        // Source returned nothing and resolved the EAN to a name with no recognised brand,
        // but the merchant typed the brand themselves → recover it from the merchant name.
        expect(resolveBrand(null, "casque sans fil noir", "Casque Bose QC45")).toBe("Bose");
    });

    it("returns null when no recognised brand exists anywhere (never invents)", () => {
        expect(resolveBrand(null, "pantalon bleu taille 40", "pantalon bleu")).toBeNull();
        expect(resolveBrand(null, null, null)).toBeNull();
    });

    it("does not let a whitespace-only source brand win", () => {
        expect(resolveBrand("   ", "Nike Air Max 90", null)).toBe("Nike");
    });

    it("canonicalises the source brand instead of trusting it verbatim", () => {
        expect(resolveBrand("La Roche-Posay, loreal", null, null)).toBe("La Roche-Posay");
        expect(resolveBrand("WELEDA", null, null)).toBe("Weleda");
        // Une source « que des virgules » ne gagne pas : repli sur le nom résolu.
        expect(resolveBrand(" , ", "Nike Air Max 90", null)).toBe("Nike");
    });
});

describe("KNOWN_BRANDS allow-list integrity", () => {
    it("contains the brands from the 2026-06-27 real test fixture", () => {
        for (const b of ["Nike", "Bose", "Ray-Ban", "Carhartt", "Lego", "VTech", "Coca-Cola"]) {
            expect(KNOWN_BRANDS).toContain(b);
        }
    });

    it("contains the beauty brands proven missing by the 2026-07-09 vitrine run", () => {
        for (const b of ["L'Occitane", "Nuxe", "Klorane", "Weleda"]) {
            expect(KNOWN_BRANDS).toContain(b);
        }
        // Ligne réelle du rapport : « L'Occitane Crème Mains Karité 150 ml » → brand ∅.
        expect(extractKnownBrand("L'Occitane Crème Mains Karité 150 ml")).toBe("L'Occitane");
        expect(extractKnownBrand("Nuxe Huile Prodigieuse 100 ml")).toBe("Nuxe");
        expect(extractKnownBrand("Klorane Shampoing sec à l'avoine")).toBe("Klorane");
    });

    it("has no empty entries", () => {
        for (const b of KNOWN_BRANDS) expect(b.trim().length).toBeGreaterThan(0);
    });
});
