import { describe, it, expect } from "vitest";
import { parseCategorizationResponse } from "@/lib/ai/categorize";

describe("parseCategorizationResponse", () => {
    it("parse un tableau JSON nu", () => {
        const out = parseCategorizationResponse(
            '[{"id":"1","category_slug":"mode","subcategory_slug":null,"brand":null,"color":null,"gender":null,"tags":[],"confidence":95}]',
        );
        expect(out).toHaveLength(1);
        expect(out[0].category_slug).toBe("mode");
    });

    it("tolère les fences ```json", () => {
        const out = parseCategorizationResponse('```json\n[{"id":"2","category_slug":"sport","subcategory_slug":null,"brand":null,"color":null,"gender":null,"tags":[],"confidence":80}]\n```');
        expect(out).toHaveLength(1);
        expect(out[0].id).toBe("2");
    });

    it("accepte un tableau vide (réponse IA légitime : rien à catégoriser)", () => {
        expect(parseCategorizationResponse("[]")).toEqual([]);
    });

    it("LÈVE sur réponse non-JSON (au lieu de l'ancien return [] silencieux qui re-brûlait des tokens à chaque run)", () => {
        expect(() => parseCategorizationResponse("désolé, je ne peux pas")).toThrow(/non-JSON/);
        expect(() => parseCategorizationResponse("")).toThrow(/non-JSON/);
    });

    it("LÈVE sur JSON valide mais non-tableau (sinon le for...of du caller crashait en TypeError non catchée)", () => {
        expect(() => parseCategorizationResponse('{"error":"rate limited"}')).toThrow(/non-tableau/);
        expect(() => parseCategorizationResponse("42")).toThrow(/non-tableau/);
        expect(() => parseCategorizationResponse("null")).toThrow(/non-tableau/);
    });
});
