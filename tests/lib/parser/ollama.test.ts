import { describe, expect, it } from "vitest";
import { extractInvoicePrompt, parseOllamaResponse } from "@/lib/parser/ollama";

describe("Ollama parser", () => {
    it("builds correct prompt for invoice extraction", () => {
        const prompt = extractInvoicePrompt("fake pdf text content");
        expect(prompt).toContain("facture");
        expect(prompt).toContain("JSON");
        expect(prompt).toContain("fake pdf text content");
    });

    it("parses valid JSON response", () => {
        const raw = JSON.stringify({
            supplier_name: "Fournisseur SAS",
            invoice_date: "2026-03-15",
            items: [
                { name: "Produit A", ean: "3760001234567", quantity: 10, unit_price: 5.99 },
                { name: "Produit B", ean: null, quantity: 3, unit_price: 12.50 },
            ],
        });
        const result = parseOllamaResponse(raw);
        expect(result.supplier_name).toBe("Fournisseur SAS");
        expect(result.items).toHaveLength(2);
        expect(result.items[0].ean).toBe("3760001234567");
    });

    it("handles malformed JSON gracefully", () => {
        expect(() => parseOllamaResponse("not json at all")).toThrow();
    });

    it("handles JSON with extra text around it", () => {
        const raw = 'Voici le résultat:\n```json\n{"supplier_name":"Test","invoice_date":null,"items":[]}\n```';
        const result = parseOllamaResponse(raw);
        expect(result.supplier_name).toBe("Test");
    });
});
