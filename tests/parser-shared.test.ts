import { describe, it, expect } from "vitest";
import { parseJsonResponse } from "@/lib/parser/shared";

describe("parseJsonResponse — robustesse réponse LLM", () => {
    it("parse un JSON nominal (markdown fence + champs)", () => {
        const raw = '```json\n{"supplier_name":"ACME","items":[{"name":"Sac","ean":"3017620422003","quantity":2,"unit_price":19.9}]}\n```';
        const out = parseJsonResponse(raw);
        expect(out.supplier_name).toBe("ACME");
        expect(out.items).toHaveLength(1);
        expect(out.items[0].quantity).toBe(2);
        expect(out.items[0].unit_price).toBe(19.9);
    });

    it("réponse vide → erreur explicite (pas une SyntaxError opaque)", () => {
        expect(() => parseJsonResponse("")).toThrow(/no JSON object/i);
        expect(() => parseJsonResponse("   ")).toThrow(/no JSON object/i);
        expect(() => parseJsonResponse("Désolé, je ne peux pas.")).toThrow(/no JSON object/i);
    });

    it("JSON malformé → erreur explicite 'malformed'", () => {
        expect(() => parseJsonResponse('{"items":[{"name":}]}')).toThrow(/malformed JSON/i);
    });

    it("quantité 0 explicite est honorée (n'est PAS transformée en 1)", () => {
        const out = parseJsonResponse('{"items":[{"name":"Rupture","quantity":0}]}');
        expect(out.items[0].quantity).toBe(0);
    });

    it("quantité absente/illisible → défaut 1 (sémantique présence)", () => {
        expect(parseJsonResponse('{"items":[{"name":"X"}]}').items[0].quantity).toBe(1);
        expect(parseJsonResponse('{"items":[{"name":"X","quantity":"oops"}]}').items[0].quantity).toBe(1);
    });

    it("prix illisible → null (et pas NaN)", () => {
        const out = parseJsonResponse('{"items":[{"name":"X","unit_price":"abc"}]}');
        expect(out.items[0].unit_price).toBeNull();
    });

    it("prix 0 explicite préservé", () => {
        expect(parseJsonResponse('{"items":[{"name":"Offert","unit_price":0}]}').items[0].unit_price).toBe(0);
    });

    it("items absent → liste vide (pas de crash)", () => {
        expect(parseJsonResponse('{"supplier_name":"X"}').items).toEqual([]);
    });
});
