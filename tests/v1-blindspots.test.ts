import { describe, it, expect } from "vitest";
import { classifyScannedCode } from "@/lib/barcode/classify";
import { merchantDisplayState, shouldShowOnMap } from "@/lib/onboarding/cold-start";

describe("#11 classifyScannedCode — ITF-14 / GTIN / SKU", () => {
    it("EAN-13 valide → gtin13", () => {
        expect(classifyScannedCode("3017620422003")).toEqual({ kind: "gtin13", value: "3017620422003" });
    });
    it("ITF-14 (carton) valide → gtin14_case (demande quantité colis)", () => {
        // 13017620422000 : GTIN-14 avec checksum valide
        const c = classifyScannedCode("13017620422000");
        expect(c.kind).toBe("gtin14_case");
    });
    it("code alphanumérique interne → sku", () => {
        expect(classifyScannedCode("TS-AB23CDEF")).toEqual({ kind: "sku", value: "TS-AB23CDEF" });
    });
    it("EAN au checksum invalide → traité comme sku (pas une identité GTIN)", () => {
        expect(classifyScannedCode("3017620422004").kind).toBe("sku");
    });
    it("vide → invalid", () => {
        expect(classifyScannedCode("").kind).toBe("invalid");
    });
});

describe("#11 cold-start — état d'affichage marchand", () => {
    it("≥3 produits visibles → ready + visible sur la carte", () => {
        expect(merchantDisplayState(5, 10)).toBe("ready");
        expect(shouldShowOnMap(5)).toBe(true);
    });
    it("a des produits mais <3 visibles → onboarding + masqué de la carte", () => {
        expect(merchantDisplayState(1, 8)).toBe("onboarding");
        expect(shouldShowOnMap(1)).toBe(false);
    });
    it("aucun produit → empty", () => {
        expect(merchantDisplayState(0, 0)).toBe("empty");
    });
});
