import { describe, it, expect } from "vitest";
import { parseInboundAddress } from "@/lib/ingest/inbound-address";

const DOMAIN = "in.twostep.fr";

describe("parseInboundAddress — routage canal stock vs factures", () => {
    it("stock-{slug} → canal stock + slug extrait", () => {
        expect(parseInboundAddress("stock-dear-skin-abc12345@in.twostep.fr", DOMAIN)).toEqual({
            channel: "stock",
            slug: "dear-skin-abc12345",
        });
    });

    it("factures-{slug} → canal invoice", () => {
        expect(parseInboundAddress("factures-dear-skin-abc12345@in.twostep.fr", DOMAIN)).toEqual({
            channel: "invoice",
            slug: "dear-skin-abc12345",
        });
    });

    it("sans préfixe → invoice (rétro-compat de l'existant)", () => {
        expect(parseInboundAddress("dear-skin-abc12345@in.twostep.fr", DOMAIN)).toEqual({
            channel: "invoice",
            slug: "dear-skin-abc12345",
        });
    });

    it("insensible à la casse (adresse + domaine)", () => {
        expect(parseInboundAddress("STOCK-Foo@IN.TWOSTEP.FR", DOMAIN)).toEqual({
            channel: "stock",
            slug: "foo",
        });
    });

    it("ne re-strippe pas factures- après stock- (slug littéral)", () => {
        expect(parseInboundAddress("stock-factures-x@in.twostep.fr", DOMAIN)).toEqual({
            channel: "stock",
            slug: "factures-x",
        });
    });

    it("mauvais domaine → null (ne capte pas un autre domaine)", () => {
        expect(parseInboundAddress("stock-foo@evil.com", DOMAIN)).toBeNull();
    });

    it("slug vide → null (stock- seul, ou @domaine seul)", () => {
        expect(parseInboundAddress("stock-@in.twostep.fr", DOMAIN)).toBeNull();
        expect(parseInboundAddress("@in.twostep.fr", DOMAIN)).toBeNull();
    });

    it("entrée vide / non-adresse → null", () => {
        expect(parseInboundAddress("", DOMAIN)).toBeNull();
        expect(parseInboundAddress("pas-une-adresse", DOMAIN)).toBeNull();
    });
});
