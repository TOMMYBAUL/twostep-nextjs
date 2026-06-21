import { describe, it, expect } from "vitest";
import { parsePrice } from "@/lib/parser/parse-price";

describe("parsePrice — robuste FR/EN + séparateurs de milliers", () => {
    it("décimal simple FR/EN", () => {
        expect(parsePrice("1234,56")).toBe(1234.56);
        expect(parsePrice("1234.56")).toBe(1234.56);
        expect(parsePrice("12,5")).toBe(12.5);
        expect(parsePrice("12")).toBe(12);
    });

    it("LE CAS qui cassait : espace de milliers + virgule décimale + devise", () => {
        expect(parsePrice("1 234,56 €")).toBe(1234.56);
        expect(parsePrice("1 234,56")).toBe(1234.56); // espace insécable
        expect(parsePrice("€12,50")).toBe(12.5);
    });

    it("deux séparateurs → le plus à droite est le décimal", () => {
        expect(parsePrice("1.234,56")).toBe(1234.56); // FR : point=milliers
        expect(parsePrice("1,234.56")).toBe(1234.56); // EN : virgule=milliers
        expect(parsePrice("1.234.567,89")).toBe(1234567.89);
    });

    it("un seul séparateur, 3 chiffres ou multiples → milliers", () => {
        expect(parsePrice("1,234")).toBe(1234);
        expect(parsePrice("1.234")).toBe(1234);
        expect(parsePrice("1,000,000")).toBe(1000000);
        expect(parsePrice("1.234.567")).toBe(1234567);
    });

    it("valeurs non finançables → null", () => {
        expect(parsePrice("")).toBeNull();
        expect(parsePrice(null)).toBeNull();
        expect(parsePrice(undefined)).toBeNull();
        expect(parsePrice("abc")).toBeNull();
        expect(parsePrice("   ")).toBeNull();
    });

    it("nombres natifs", () => {
        expect(parsePrice(19.99)).toBe(19.99);
        expect(parsePrice(0)).toBe(0); // bornage >0 laissé au caller
    });
});
