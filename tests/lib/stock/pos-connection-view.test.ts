import { describe, expect, it } from "vitest";
import { derivePosConnectionView, type PosConnectionRow } from "@/lib/stock/pos-connection-view";

const conn = (over: Partial<PosConnectionRow> = {}): PosConnectionRow => ({
    provider: "square",
    last_sync_at: "2026-06-26T08:00:00.000Z",
    last_sync_status: "ok",
    last_sync_error: null,
    expires_at: null,
    ...over,
});

const base = {
    merchantFailed: false,
    hasMerchant: true,
    connectionFailed: false,
    connection: null as PosConnectionRow | null,
    productsCountFailed: false,
    productsCount: 0 as number | null,
};

describe("derivePosConnectionView — honnêteté du chargement (north-star, écran connexion POS)", () => {
    it("RÉGRESSION : lecture marchand en échec → error, JAMAIS un redirect /devenir-marchand", () => {
        // Le bug d'origine : `const { data: merchant } = ...maybeSingle()` (error JETÉ) → un blip
        // DB → merchant=null indistinct de « pas de marchand » → redirect("/devenir-marchand") →
        // un marchand DÉJÀ onboardé est éjecté sur un hoquet DB = pire faux négatif.
        expect(
            derivePosConnectionView({ ...base, merchantFailed: true, hasMerchant: false }),
        ).toEqual({ kind: "error" });
    });

    it("lecture marchand en échec prime même si une ligne marchand a quand même été lue", () => {
        expect(
            derivePosConnectionView({ ...base, merchantFailed: true, hasMerchant: true }),
        ).toEqual({ kind: "error" });
    });

    it("marchand réellement absent (lecture OK, 0 ligne) → no-merchant (redirect légitime)", () => {
        expect(
            derivePosConnectionView({ ...base, merchantFailed: false, hasMerchant: false }),
        ).toEqual({ kind: "no-merchant" });
    });

    it("RÉGRESSION : lecture connexion en échec → error, JAMAIS « Aucune caisse connectée »", () => {
        // Bug classe E1 : `const { data: connection } = ...` (error JETÉ) → connection=null →
        // hasConnection=false → « Aucune caisse connectée » à un marchand connecté → re-connexion.
        expect(
            derivePosConnectionView({ ...base, connectionFailed: true, connection: null }),
        ).toEqual({ kind: "error" });
    });

    it("connexion échouée prime sur tout état ready, même si une ligne a été lue", () => {
        expect(
            derivePosConnectionView({ ...base, connectionFailed: true, connection: conn() }),
        ).toEqual({ kind: "error" });
    });

    it("chargé OK + caisse connectée → ready hasConnection=true + connection + count", () => {
        const connection = conn({ provider: "lightspeed" });
        expect(
            derivePosConnectionView({ ...base, connection, productsCount: 42 }),
        ).toEqual({ kind: "ready", hasConnection: true, connection, productsCount: 42 });
    });

    it("chargé OK + aucune caisse (lecture réussie, 0 ligne) → ready hasConnection=false", () => {
        expect(
            derivePosConnectionView({ ...base, connection: null, productsCount: 0 }),
        ).toEqual({ kind: "ready", hasConnection: false, connection: null, productsCount: 0 });
    });

    it("count produits en échec → productsCount=null (« — »), JAMAIS un faux 0 ; reste ready", () => {
        // La lecture connexion a réussi (caisse connectée) mais le count a échoué : non bloquant.
        // On rend l'inconnu (null → « — »), pas « 0 produits suivis » qui ferait croire à un stock vide.
        const connection = conn();
        expect(
            derivePosConnectionView({
                ...base,
                connection,
                productsCountFailed: true,
                productsCount: null,
            }),
        ).toEqual({ kind: "ready", hasConnection: true, connection, productsCount: null });
    });

    it("priorité : échec marchand > absence marchand > échec connexion (ordre d'aiguillage)", () => {
        // Un échec marchand masque tout le reste (y compris un éventuel échec connexion).
        expect(
            derivePosConnectionView({
                ...base,
                merchantFailed: true,
                hasMerchant: false,
                connectionFailed: true,
            }),
        ).toEqual({ kind: "error" });
    });
});
