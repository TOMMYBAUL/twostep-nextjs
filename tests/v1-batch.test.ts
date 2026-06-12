import { describe, it, expect } from "vitest";
import { downgradeForReports } from "@/lib/stock/reports";
import { parseCiiXml } from "@/lib/parser/einvoice-cii";
import { encode128B, code128ModuleCount, renderCode128Svg, generateInternalSku } from "@/lib/barcode/code128";

describe("#9 downgradeForReports — signalements consommateur", () => {
    it("1-2 signalements → dégrade à 'probable'", () => {
        expect(downgradeForReports("available", 1)).toBe("probable");
        expect(downgradeForReports("available", 2)).toBe("probable");
    });
    it("3+ signalements → 'épuisé' (on croit les clients)", () => {
        expect(downgradeForReports("available", 3)).toBe("out");
    });
    it("0 signalement → état inchangé", () => {
        expect(downgradeForReports("available", 0)).toBe("available");
    });
    it("déjà épuisé reste épuisé", () => {
        expect(downgradeForReports("out", 0)).toBe("out");
    });
});

describe("#4 parseCiiXml — Factur-X / EN 16931 (BT-157)", () => {
    const cii = `
    <rsm:CrossIndustryInvoice xmlns:ram="urn:ram" xmlns:rsm="urn:rsm">
      <rsm:SupplyChainTradeTransaction>
        <ram:IncludedSupplyChainTradeLineItem>
          <ram:SpecifiedTradeProduct>
            <ram:GlobalID schemeID="0160">3017620422003</ram:GlobalID>
            <ram:Name>Nutella Pâte à tartiner 750g</ram:Name>
          </ram:SpecifiedTradeProduct>
          <ram:SpecifiedLineTradeAgreement>
            <ram:NetPriceProductTradePrice><ram:ChargeAmount>3.50</ram:ChargeAmount></ram:NetPriceProductTradePrice>
          </ram:SpecifiedLineTradeAgreement>
          <ram:SpecifiedLineTradeDelivery>
            <ram:BilledQuantity unitCode="C62">12</ram:BilledQuantity>
          </ram:SpecifiedLineTradeDelivery>
        </ram:IncludedSupplyChainTradeLineItem>
        <ram:IncludedSupplyChainTradeLineItem>
          <ram:SpecifiedTradeProduct>
            <ram:Name>Article sans EAN</ram:Name>
          </ram:SpecifiedTradeProduct>
          <ram:SpecifiedLineTradeDelivery>
            <ram:BilledQuantity unitCode="C62">3</ram:BilledQuantity>
          </ram:SpecifiedLineTradeDelivery>
        </ram:IncludedSupplyChainTradeLineItem>
      </rsm:SupplyChainTradeTransaction>
    </rsm:CrossIndustryInvoice>`;

    it("extrait EAN (BT-157), nom, quantité, prix par ligne", () => {
        const items = parseCiiXml(cii);
        expect(items).toHaveLength(2);
        expect(items[0].ean).toBe("3017620422003");
        expect(items[0].name).toContain("Nutella");
        expect(items[0].quantity).toBe(12);
        expect(items[0].unit_price).toBe(3.5);
        // 2e ligne : pas d'EAN, gardée via le nom
        expect(items[1].ean).toBeNull();
        expect(items[1].quantity).toBe(3);
    });

    it("XML vide → liste vide", () => {
        expect(parseCiiXml("")).toEqual([]);
    });
});

describe("#3 Code128 — encodeur + SVG", () => {
    // Vecteurs calculés à la main (indépendants de l'implémentation) :
    it("'A' → [Start B=104, 33, checksum=34, Stop=106]", () => {
        // 104 + 1*33 = 137 ; 137 mod 103 = 34
        expect(encode128B("A")).toEqual([104, 33, 34, 106]);
    });
    it("'AB' → checksum 102", () => {
        // 104 + 1*33 + 2*34 = 205 ; 205 mod 103 = 102
        expect(encode128B("AB")).toEqual([104, 33, 34, 102, 106]);
    });
    it("rejette un caractère hors Code128B", () => {
        expect(() => encode128B("é")).toThrow();
    });
    it("SVG valide + nombre de modules cohérent", () => {
        const svg = renderCode128Svg("TS-AB23");
        expect(svg.startsWith("<svg")).toBe(true);
        expect(svg).toContain("<rect");
        expect(code128ModuleCount("TS-AB23")).toBeGreaterThan(0);
    });
    it("SKU interne : format TS-XXXXXXXX, sans caractères ambigus", () => {
        const sku = generateInternalSku();
        expect(sku).toMatch(/^TS-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    });
});
