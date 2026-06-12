import { describe, it, expect } from "vitest";
import { triageStockItems, isExploitableSku, isPlaceholderName } from "@/lib/ingest/triage";
import type { ParsedInvoiceItem } from "@/lib/parser/types";

const line = (partial: Partial<ParsedInvoiceItem>): ParsedInvoiceItem => ({
    name: "",
    ean: null,
    sku: null,
    brand: null,
    quantity: 1,
    unit_price: null,
    ...partial,
});

describe("triageStockItems — règle d'identité GTIN/SKU (jamais le nom seul)", () => {
    it("GTIN valide en colonne code-barres → identité forte", () => {
        const r = triageStockItems([line({ name: "Nutella 750g", ean: "3017620422003" })]);
        expect(r.gtin_lines).toBe(1);
        expect(r.accepted[0].identity).toBe("gtin");
        expect(r.accepted[0].ean).toBe("3017620422003");
    });

    it("GTIN valide rangé dans la colonne référence → promu identité forte", () => {
        const r = triageStockItems([line({ name: "Lego", sku: "4006381333931" })]);
        expect(r.gtin_lines).toBe(1);
        expect(r.accepted[0].ean).toBe("4006381333931");
        expect(r.accepted[0].sku).toBeNull(); // pas de duplication de la valeur
    });

    it("EAN au checksum faux (faute de frappe) → suivi comme SKU, jamais envoyé aux lookups GTIN", () => {
        const r = triageStockItems([line({ name: "Produit", ean: "3017620422004" })]);
        expect(r.gtin_lines).toBe(0);
        expect(r.sku_lines).toBe(1);
        expect(r.accepted[0].identity).toBe("sku");
        expect(r.accepted[0].ean).toBeNull();
        expect(r.accepted[0].sku).toBe("3017620422004");
    });

    it("SKU interne classique et code PLU court → identité faible acceptée", () => {
        const r = triageStockItems([
            line({ name: "T-shirt noir", sku: "TSHIRT-NOIR-42" }),
            line({ name: "Banane", sku: "4011" }),
        ]);
        expect(r.sku_lines).toBe(2);
    });

    it("nom seul → REJETÉ (un libellé n'est pas une identité)", () => {
        const r = triageStockItems([line({ name: "Bougie artisanale lavande" })]);
        expect(r.accepted).toHaveLength(0);
        expect(r.rejected_lines).toBe(1);
        expect(r.rejected_samples[0]).toEqual({
            name: "Bougie artisanale lavande",
            code: null,
            reason: "no_identifier",
        });
    });

    it("code inexploitable (trop court) → rejeté avec le code en échantillon", () => {
        const r = triageStockItems([line({ name: "Truc", sku: "ab" })]);
        expect(r.rejected_lines).toBe(1);
        expect(r.rejected_samples[0].reason).toBe("invalid_identifier");
        expect(r.rejected_samples[0].code).toBe("ab");
    });

    it("fichier mixte → comptes corrects, rien de silencieux", () => {
        const r = triageStockItems([
            line({ name: "A", ean: "3017620422003" }), // gtin
            line({ name: "B", sku: "REF-001" }),       // sku
            line({ name: "C" }),                       // rejet
        ]);
        expect(r.gtin_lines).toBe(1);
        expect(r.sku_lines).toBe(1);
        expect(r.rejected_lines).toBe(1);
        expect(r.accepted).toHaveLength(2);
    });
});

describe("isExploitableSku", () => {
    it("accepte les références usuelles", () => {
        expect(isExploitableSku("TS-0042")).toBe(true);
        expect(isExploitableSku("4011")).toBe(true);
        expect(isExploitableSku("ART 12.3/B")).toBe(true);
    });

    it("rejette trop court, trop long, premier caractère non alphanumérique", () => {
        expect(isExploitableSku("ab")).toBe(false);
        expect(isExploitableSku("X".repeat(33))).toBe(false);
        expect(isExploitableSku("-ABC123")).toBe(false);
        expect(isExploitableSku("")).toBe(false);
        expect(isExploitableSku(null)).toBe(false);
    });
});

describe("isPlaceholderName", () => {
    it("détecte les placeholders du parseur et les vides", () => {
        expect(isPlaceholderName("EAN 3017620422003")).toBe(true);
        expect(isPlaceholderName("REF TS-0042")).toBe(true);
        expect(isPlaceholderName("")).toBe(true);
        expect(isPlaceholderName(null)).toBe(true);
    });

    it("laisse passer les vrais libellés", () => {
        expect(isPlaceholderName("Nutella 750g")).toBe(false);
        expect(isPlaceholderName("Référence dorée")).toBe(false);
    });
});
