import { describe, it, expect } from "vitest";
import { invoiceStatusForParse } from "@/lib/parser/invoice-status";

describe("invoiceStatusForParse — anti dérive silencieuse facture", () => {
    it("≥1 item extrait → 'parsed'", () => {
        expect(invoiceStatusForParse(1)).toBe("parsed");
        expect(invoiceStatusForParse(50)).toBe("parsed");
    });

    it("0 item extrait → 'failed' (le marchand voit 'refusée', pas un faux succès)", () => {
        expect(invoiceStatusForParse(0)).toBe("failed");
    });
});
