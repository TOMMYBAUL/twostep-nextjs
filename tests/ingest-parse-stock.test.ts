import { describe, it, expect } from "vitest";
import { parseStockFile } from "@/lib/ingest/parse-stock";
import { validEanOrNull } from "@/lib/ean/validate";

describe("parseStockFile — contrat NearSt {code-barres, quantité, prix}", () => {
    it("ingère un fichier SANS colonne nom (le titre viendra de l'enrichissement)", () => {
        const csv = "code-barres;quantité;prix\n3017620422003;5;3.50\n4006381333931;0;12\n";
        const { items } = parseStockFile(Buffer.from(csv, "utf-8"));

        expect(items).toHaveLength(2);
        expect(items[0].ean).toBe("3017620422003");
        expect(items[0].quantity).toBe(5);
        expect(items[0].unit_price).toBe(3.5);
        expect(items[0].name).toBe("EAN 3017620422003"); // placeholder, remplacé par canonical_name
        expect(items[1].quantity).toBe(0); // rupture explicite préservée (0, pas défaut 1)
    });

    it("gère le délimiteur virgule + colonnes nommées en anglais", () => {
        const csv = "barcode,quantity,price,title\n3017620422003,3,9.90,Nutella 750g\n";
        const { items } = parseStockFile(Buffer.from(csv, "utf-8"));
        expect(items).toHaveLength(1);
        expect(items[0].name).toBe("Nutella 750g");
        expect(items[0].quantity).toBe(3);
    });

    it("ignore une ligne sans aucune identité (ni nom, ni EAN, ni SKU)", () => {
        const csv = "code-barres;quantité;prix\n;;\n3017620422003;2;5\n";
        const { items } = parseStockFile(Buffer.from(csv, "utf-8"));
        expect(items).toHaveLength(1);
    });
});

describe("validEanOrNull — GTIN vs SKU interne", () => {
    it("accepte un EAN-13/UPC valide et rejette un code interne", () => {
        expect(validEanOrNull("3017620422003")).toBe("3017620422003");
        expect(validEanOrNull("  4006381333931 ")).toBe("4006381333931");
        expect(validEanOrNull("TSHIRT-NOIR-42")).toBeNull(); // SKU interne -> pas une identité GTIN
        expect(validEanOrNull("3017620422004")).toBeNull(); // checksum faux
    });
});
