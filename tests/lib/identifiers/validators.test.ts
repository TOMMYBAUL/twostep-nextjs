import { describe, it, expect } from "vitest";
import {
    canonicalizeEan,
    detectIdentifierType,
    isValidCip13,
    isValidEan13,
    isValidEan8,
    isValidGtin14,
    isValidIsbn13,
    isValidUpc12,
    normalizeIdentifier,
    upc12ToEan13,
} from "@/lib/identifiers/validators";

describe("normalizeIdentifier", () => {
    it("strips spaces, dashes, apostrophes, letters", () => {
        expect(normalizeIdentifier("805 0597 33846 0")).toBe("8050597338460");
        expect(normalizeIdentifier("978-2-07-061275-8")).toBe("9782070612758");
        expect(normalizeIdentifier("'5449000000996")).toBe("5449000000996");
        expect(normalizeIdentifier("123ABC456789X")).toBe("123456789");
    });
    it("returns empty string for non-string input", () => {
        expect(normalizeIdentifier(null)).toBe("");
        expect(normalizeIdentifier(undefined)).toBe("");
        expect(normalizeIdentifier(123)).toBe("");
    });
});

describe("isValidEan13 (checksum GS1)", () => {
    it("accepts known-valid EAN-13", () => {
        expect(isValidEan13("5449000000996")).toBe(true); // Coca-Cola 33cl
        expect(isValidEan13("3017620422003")).toBe(true); // Nutella 400g
        expect(isValidEan13("9782070612758")).toBe(true); // Camus L'Étranger (Folio)
    });
    it("rejects EAN-13 with bad checksum", () => {
        expect(isValidEan13("5449000000997")).toBe(false);
        expect(isValidEan13("3017620422004")).toBe(false);
    });
    it("rejects wrong length", () => {
        expect(isValidEan13("12345")).toBe(false);
        expect(isValidEan13("12345678901234")).toBe(false);
    });
    it("rejects non-digits", () => {
        expect(isValidEan13("12345678ABCDE")).toBe(false);
    });
});

describe("isValidEan8", () => {
    it("accepts known-valid EAN-8", () => {
        expect(isValidEan8("96385074")).toBe(true);
    });
    it("rejects bad checksum", () => {
        expect(isValidEan8("96385075")).toBe(false);
    });
});

describe("isValidUpc12", () => {
    it("accepts known-valid UPC-12", () => {
        // 036000291452 = Reynolds Wrap (UPC-A US classique avec checksum valide)
        expect(isValidUpc12("036000291452")).toBe(true);
    });
    it("rejects bad checksum UPC-12", () => {
        expect(isValidUpc12("036000291453")).toBe(false);
    });
});

describe("isValidGtin14 (checksum GS1 sur 14 chiffres)", () => {
    it("accepte un GTIN-14 à indicateur 0 (EAN-13 zéro-préfixé — checksum invariant)", () => {
        // 5449000000996 (Coca) zéro-préfixé → 05449000000996, même chiffre de contrôle.
        expect(isValidGtin14("05449000000996")).toBe(true);
        // UPC-12 doublement zéro-préfixé.
        expect(isValidGtin14("00036000291452")).toBe(true);
    });
    it("accepte un GTIN-14 à indicateur 1 (unité logistique, checksum réel GS1)", () => {
        // 10614141000415 = exemple GS1 GTIN-14 indicateur 1 (carton), checksum valide.
        expect(isValidGtin14("10614141000415")).toBe(true);
    });
    it("rejette un checksum faux et une mauvaise longueur", () => {
        expect(isValidGtin14("05449000000997")).toBe(false);
        expect(isValidGtin14("5449000000996")).toBe(false); // 13 chiffres
    });
});

describe("isValidIsbn13", () => {
    it("accepts ISBN-13 with valid GS1 checksum + prefix 978/979", () => {
        expect(isValidIsbn13("9782070612758")).toBe(true);
        expect(isValidIsbn13("9791036301919")).toBe(true);
    });
    it("rejects EAN-13 valides mais sans préfixe ISBN", () => {
        expect(isValidIsbn13("5449000000996")).toBe(false);
    });
});

describe("isValidCip13", () => {
    it("accepts CIP-13 with valid GS1 checksum + prefix 340", () => {
        // 3400933264963 = Doliprane 1000 mg comprimés (CIP-13 réel, checksum OK)
        expect(isValidCip13("3400933264963")).toBe(true);
    });
    it("rejects ean13 sans préfixe 340", () => {
        expect(isValidCip13("5449000000996")).toBe(false);
    });
});

describe("upc12ToEan13", () => {
    it("converts valid UPC-12 to EAN-13 with leading 0", () => {
        expect(upc12ToEan13("036000291452")).toBe("0036000291452");
    });
    it("returns null for invalid UPC-12", () => {
        expect(upc12ToEan13("036000291453")).toBeNull();
    });
    it("normalizes input before conversion", () => {
        expect(upc12ToEan13("036-000-291-452")).toBe("0036000291452");
    });
});

describe("detectIdentifierType", () => {
    it("detects ean13", () => {
        expect(detectIdentifierType("5449000000996")).toBe("ean13");
    });
    it("detects isbn13", () => {
        expect(detectIdentifierType("9782070612758")).toBe("isbn13");
    });
    it("detects cip13", () => {
        expect(detectIdentifierType("3400933264963")).toBe("cip13");
    });
    it("detects upc12", () => {
        expect(detectIdentifierType("036000291452")).toBe("upc12");
    });
    it("detects ean8", () => {
        expect(detectIdentifierType("96385074")).toBe("ean8");
    });
    it("returns 'invalid' for bad checksum", () => {
        expect(detectIdentifierType("5449000000997")).toBe("invalid");
    });
    it("returns 'invalid' for letters in code", () => {
        expect(detectIdentifierType("123ABC456789X")).toBe("invalid");
    });
    it("strips spaces and detects valid forms", () => {
        // 8056597144056 = Ray-Ban Wayfarer Classic — CSV avec espaces
        expect(detectIdentifierType("8056597 144056")).toBe("ean13");
    });
    it("returns 'invalid' if normalized digits give bad checksum", () => {
        // EAN-13 13 chiffres mais checksum cassé délibéré (réel 5449000000996, ici +1 sur dernier)
        expect(detectIdentifierType("5449000000997")).toBe("invalid");
        // 14 chiffres → trop long pour ean13, pas un format reconnu
        expect(detectIdentifierType("12345678901234")).toBe("invalid");
    });
    it("returns 'invalid' for empty/null input", () => {
        expect(detectIdentifierType("")).toBe("invalid");
        expect(detectIdentifierType(null)).toBe("invalid");
        expect(detectIdentifierType(undefined)).toBe("invalid");
    });
    it("GTIN-14 indicateur 0 → ramené à son type EAN-13 interne (même unité conso)", () => {
        expect(detectIdentifierType("05449000000996")).toBe("ean13");
        // GTIN-14 indicateur 0 dont l'interne porte un préfixe ISBN/CIP → type sectoriel.
        expect(detectIdentifierType("09782070612758")).toBe("isbn13");
        expect(detectIdentifierType("03400933264963")).toBe("cip13");
    });
    it("GTIN-14 indicateur 1-9 (unité logistique distincte) → 'invalid' comme identité conso", () => {
        expect(detectIdentifierType("10614141000415")).toBe("invalid");
    });
    it("GTIN-14 à checksum faux → 'invalid'", () => {
        expect(detectIdentifierType("05449000000997")).toBe("invalid");
    });
});

describe("canonicalizeEan", () => {
    it("returns the EAN-13 unchanged when valid", () => {
        expect(canonicalizeEan("5449000000996")).toBe("5449000000996");
    });
    it("converts UPC-12 to EAN-13 with leading 0", () => {
        expect(canonicalizeEan("036000291452")).toBe("0036000291452");
    });
    it("preserves EAN-8 (8 chiffres) tel quel", () => {
        expect(canonicalizeEan("96385074")).toBe("96385074");
    });
    it("returns null for letters", () => {
        expect(canonicalizeEan("123ABC456789X")).toBeNull();
    });
    it("returns null for spaces+invalid checksum", () => {
        // espaces strippés → 13 chiffres MAIS checksum délibérément faux
        expect(canonicalizeEan("544 9000 0009 97")).toBeNull(); // 5449000000997 = checksum cassé
    });
    it("returns null for null/undefined/empty", () => {
        expect(canonicalizeEan(null)).toBeNull();
        expect(canonicalizeEan(undefined)).toBeNull();
        expect(canonicalizeEan("")).toBeNull();
    });
    it("normalizes apostrophe Excel + valid EAN", () => {
        expect(canonicalizeEan("'5449000000996")).toBe("5449000000996");
    });

    // ── P0-8 : GTIN-14 indicateur 0 ≡ EAN-13 (ferme le doublon e-invoice vs POS) ──
    it("GTIN-14 indicateur 0 → EAN-13 interne (retire le zéro logistique)", () => {
        expect(canonicalizeEan("05449000000996")).toBe("5449000000996");
    });
    it("MÊME forme canonique qu'un EAN-13 nu (cross-canal : e-invoice GTIN-14 == fichier EAN-13)", () => {
        expect(canonicalizeEan("05449000000996")).toBe(canonicalizeEan("5449000000996"));
    });
    it("MÊME forme canonique que le chemin POS UPC-12 (e-invoice GTIN-14-de-UPC == caisse UPC)", () => {
        // 00036000291452 = UPC-12 (036000291452) en GTIN-14 → doit matcher le POS.
        expect(canonicalizeEan("00036000291452")).toBe(canonicalizeEan("036000291452"));
        expect(canonicalizeEan("00036000291452")).toBe("0036000291452");
    });
    it("préserve l'identité ISBN/CIP interne d'un GTIN-14 indicateur 0", () => {
        expect(canonicalizeEan("09782070612758")).toBe("9782070612758");
        expect(canonicalizeEan("03400933264963")).toBe("3400933264963");
    });
    it("GTIN-14 indicateur 1-9 (unité logistique) → null (jamais fusionné à tort à l'unité conso)", () => {
        expect(canonicalizeEan("10614141000415")).toBeNull();
    });
    it("GTIN-14 à checksum faux → null", () => {
        expect(canonicalizeEan("05449000000997")).toBeNull();
    });
});
