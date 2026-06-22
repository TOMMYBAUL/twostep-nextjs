import { describe, it, expect, vi } from "vitest";
import { parseStockFile } from "@/lib/ingest/parse-stock";
import { triageStockItems } from "@/lib/ingest/triage";
import { ingestStockSnapshot } from "@/lib/ingest/snapshot";
import type { ParsedInvoiceItem } from "@/lib/parser/types";

// groupVariantsByEAN (post-pass POS) n'est pas l'objet du test : on l'inerte pour
// pouvoir exercer le chemin NON-dryRun de l'alerte de couverture sans DB réelle.
vi.mock("@/lib/pos/sync-engine", () => ({ groupVariantsByEAN: vi.fn() }));
// captureError espionné pour PROUVER que la colonne quantité manquante émet un signal.
vi.mock("@/lib/error", () => ({ captureError: vi.fn() }));
import { captureError } from "@/lib/error";

/**
 * VALIDATION MAILLON 2 du workflow cœur — TRIAGE / IDENTITÉ sur un export RÉEL.
 *
 * Méthode qualité (priorities §1bis) : pas « le test unitaire passe », mais le
 * maillon exécuté de bout en bout sur une vraie entrée sale (parse → triage),
 * sortie inspectée champ par champ. On prouve les 4 facettes listées au backlog :
 *  - EAN canonicalisé + checksum GTIN validé (EAN-13 / EAN-8) ;
 *  - UPC-12 → EAN-13 (préfixe 0, cohérence cross-canal avec le POS) ;
 *  - fallback SKU (EAN au checksum faux + référence interne + PLU court) ;
 *  - rejet des lignes nom-seul / code inexploitable, listées et motivées.
 *
 * + l'INVARIANT NORTH-STAR posé à ce maillon : une colonne quantité non reconnue
 *   ne défaut-mute JAMAIS en silence (qty=1 partout) → elle est SIGNALÉE.
 */

// Export FR réaliste : `;`, en-têtes accentués, codes répartis entre Code-barres
// ET Référence (les caisses FR mettent l'EAN dans l'une ou l'autre).
const REAL_CSV = [
    "Code-barres;Désignation;Référence;Quantité;Prix",
    "3017620422003;Nutella 750g;;6;4,50", //            EAN-13 valide        → gtin
    "036000291452;Coca canette;;24;0,80", //            UPC-12 valide        → gtin (0036000291452)
    ";Lego brique;4006381333931;3;12,00", //            GTIN dans Référence  → gtin promu
    "96385074;Stylo bille;;50;1,20", //                 EAN-8 valide         → gtin
    "3017620422004;Produit typo EAN;;2;9,90", //        EAN checksum FAUX    → sku (faute de frappe)
    ";T-shirt logo;TS-0042;7;15,00", //                 référence interne    → sku
    ";Banane vrac;4011;10;0,30", //                     PLU court            → sku
    ";Bougie lavande;;1;6,00", //                       nom seul             → REJET no_identifier
    ";Truc bizarre;ab;1;1,00", //                       code trop court      → REJET invalid_identifier
].join("\n");

describe("MAILLON 2 — triage d'identité sur un export FR réel (parse → triage)", () => {
    const parsed = parseStockFile(Buffer.from(REAL_CSV, "utf-8"));
    const report = triageStockItems(parsed.items);

    it("PREUVE : rapport de triage complet inspectable", () => {
        // eslint-disable-next-line no-console
        console.log("COVERAGE:\n" + JSON.stringify(parsed.coverage, null, 2));
        // eslint-disable-next-line no-console
        console.log(
            "TRIAGE:\n" +
                JSON.stringify(
                    {
                        gtin_lines: report.gtin_lines,
                        sku_lines: report.sku_lines,
                        rejected_lines: report.rejected_lines,
                        rejected_samples: report.rejected_samples,
                        accepted: report.accepted.map((a) => ({ name: a.name, ean: a.ean, sku: a.sku, identity: a.identity })),
                    },
                    null,
                    2,
                ),
        );
        expect(parsed.items).toHaveLength(9);
    });

    it("compteurs corrects, rien de silencieux : 4 GTIN + 3 SKU + 2 rejets = 9", () => {
        expect(report.gtin_lines).toBe(4);
        expect(report.sku_lines).toBe(3);
        expect(report.rejected_lines).toBe(2);
        expect(report.accepted).toHaveLength(7);
        // Invariant : accepté + rejeté = total parsé (aucune ligne ne s'évapore).
        expect(report.accepted.length + report.rejected_lines).toBe(parsed.items.length);
    });

    it("EAN-13 à checksum valide → identité forte, code conservé", () => {
        const nutella = report.accepted.find((a) => a.name === "Nutella 750g");
        expect(nutella).toMatchObject({ identity: "gtin", ean: "3017620422003" });
    });

    it("UPC-12 valide → canonicalisé EAN-13 préfixe 0 (cohérence cross-canal POS)", () => {
        const coca = report.accepted.find((a) => a.name === "Coca canette");
        expect(coca).toMatchObject({ identity: "gtin", ean: "0036000291452" });
    });

    it("GTIN rangé dans la colonne Référence → promu identité forte, SKU non dupliqué", () => {
        const lego = report.accepted.find((a) => a.name === "Lego brique");
        expect(lego).toMatchObject({ identity: "gtin", ean: "4006381333931", sku: null });
    });

    it("EAN-8 valide → identité forte (checksum 8 chiffres honoré)", () => {
        const stylo = report.accepted.find((a) => a.name === "Stylo bille");
        expect(stylo).toMatchObject({ identity: "gtin", ean: "96385074" });
    });

    it("EAN au checksum FAUX → suivi en SKU, JAMAIS envoyé aux lookups GTIN (ean=null)", () => {
        const typo = report.accepted.find((a) => a.name === "Produit typo EAN");
        expect(typo).toMatchObject({ identity: "sku", ean: null, sku: "3017620422004" });
    });

    it("référence interne + PLU court → identités faibles acceptées", () => {
        expect(report.accepted.find((a) => a.name === "T-shirt logo")).toMatchObject({ identity: "sku", sku: "TS-0042" });
        expect(report.accepted.find((a) => a.name === "Banane vrac")).toMatchObject({ identity: "sku", sku: "4011" });
    });

    it("rejets LISTÉS et MOTIVÉS (le marchand sait ce qui a été ignoré et pourquoi)", () => {
        const byReason = Object.fromEntries(report.rejected_samples.map((r) => [r.reason, r]));
        expect(byReason["no_identifier"]).toEqual({ name: "Bougie lavande", code: null, reason: "no_identifier" });
        expect(byReason["invalid_identifier"]).toEqual({ name: "Truc bizarre", code: "ab", reason: "invalid_identifier" });
    });
});

describe("MAILLON 2 — couverture de colonnes : parse expose quel critique est reconnu", () => {
    it("colonnes critiques reconnues → coverage tout true", () => {
        const { coverage } = parseStockFile(Buffer.from(REAL_CSV, "utf-8"));
        expect(coverage).toEqual({ quantity: true, identifier: true, price: true });
    });

    it("en-tête quantité NON reconnu → coverage.quantity=false ET chaque qty retombe à 1 (présence)", () => {
        // « Dispo » n'est pas un en-tête quantité connu → la colonne est perdue.
        const csv = ["Code-barres;Désignation;Dispo;Prix", "3017620422003;Nutella;42;4,50", "036000291452;Coca;7;0,80"].join("\n");
        const { items, coverage } = parseStockFile(Buffer.from(csv, "utf-8"));
        expect(coverage.quantity).toBe(false);
        expect(coverage.identifier).toBe(true);
        // Le défaut muet : 42 et 7 sont PERDUS, tout est à 1.
        expect(items.map((i) => i.quantity)).toEqual([1, 1]);
    });
});

// ── Faux client admin minimal (réutilise le patron de ingest-snapshot.test.ts) ──
type QueryResult = { data: unknown; error: { message: string } | null };
function makeAdmin(results: { products?: QueryResult; stock?: QueryResult } = {}) {
    function builder(table: string) {
        const b: Record<string, unknown> = {};
        const passthrough = () => b;
        for (const m of ["select", "eq", "gt", "or", "insert", "update", "upsert", "in"]) b[m] = passthrough;
        b.then = (resolve: (v: QueryResult) => unknown, reject: (e: unknown) => unknown) => {
            let res: QueryResult = { data: [], error: null };
            if (table === "products") res = results.products ?? { data: [], error: null };
            else if (table === "stock") res = results.stock ?? { data: [], error: null };
            return Promise.resolve(res).then(resolve, reject);
        };
        return b;
    }
    return { from: (t: string) => builder(t) } as never;
}

const acceptedItems: ParsedInvoiceItem[] = [
    { name: "Nutella", ean: "3017620422003", sku: null, brand: null, quantity: 1, unit_price: 4.5 },
];

describe("MAILLON 2 — l'alerte de couverture REMONTE jusqu'à l'ingestion (jamais muette)", () => {
    it("coverage.quantity=false + lignes acceptées → erreur explicite + column_coverage exposé", async () => {
        const admin = makeAdmin({ products: { data: [], error: null } });
        const r = await ingestStockSnapshot("m1", acceptedItems, admin, {
            reconcile: true,
            dryRun: true,
            coverage: { quantity: false, identifier: true, price: true },
        });
        expect(r.column_coverage).toEqual({ quantity: false, identifier: true, price: true });
        expect(r.errors.some((e) => /colonne quantité non reconnue/i.test(e))).toBe(true);
    });

    it("coverage.quantity=true → AUCUNE fausse alerte (pas de bruit quand tout va bien)", async () => {
        const admin = makeAdmin({ products: { data: [], error: null } });
        const r = await ingestStockSnapshot("m1", acceptedItems, admin, {
            reconcile: true,
            dryRun: true,
            coverage: { quantity: true, identifier: true, price: true },
        });
        expect(r.errors.some((e) => /colonne quantité/i.test(e))).toBe(false);
    });

    it("hors simulation : colonne quantité manquante → SIGNAL Sentry (captureError) émis", async () => {
        vi.mocked(captureError).mockClear();
        const admin = makeAdmin({ products: { data: [], error: null } });
        await ingestStockSnapshot("m1", acceptedItems, admin, {
            reconcile: false, // pas de réconciliation : on isole le signal de couverture
            dryRun: false,
            coverage: { quantity: false, identifier: true, price: true },
        });
        expect(captureError).toHaveBeenCalledWith(
            expect.any(Error),
            expect.objectContaining({ phase: "column-coverage-quantity", merchantId: "m1" }),
        );
    });

    it("dryRun : pas de signal Sentry (la prévisualisation wizard ne spamme pas)", async () => {
        vi.mocked(captureError).mockClear();
        const admin = makeAdmin({ products: { data: [], error: null } });
        await ingestStockSnapshot("m1", acceptedItems, admin, {
            reconcile: true,
            dryRun: true,
            coverage: { quantity: false, identifier: true, price: true },
        });
        const coverageCalls = vi.mocked(captureError).mock.calls.filter(
            (c) => (c[1] as { phase?: string } | undefined)?.phase === "column-coverage-quantity",
        );
        expect(coverageCalls).toHaveLength(0);
    });
});

describe("MAILLON 2 — création produit : un échec d'upsert stock n'est JAMAIS muet", () => {
    it("stock upsert KO sur produit créé → erreur remontée + Sentry + stock_replaced non compté", async () => {
        vi.mocked(captureError).mockClear();
        // products read [] → branche CREATE ; le stock upsert renvoie une erreur DB.
        const admin = makeAdmin({
            products: { data: [], error: null },
            stock: { data: null, error: { message: "boom-stock-create" } },
        });
        const r = await ingestStockSnapshot("m1", acceptedItems, admin, {
            reconcile: false, // isole le signal create-stock du chemin réconciliation
            dryRun: false,
        });
        expect(r.products_created).toBe(1); // le produit a bien été créé
        expect(r.stock_replaced).toBe(0); // mais le stock n'a PAS été écrit → non compté (pas de mensonge)
        expect(r.errors.some((e) => /stock \(création\)/i.test(e))).toBe(true);
        expect(captureError).toHaveBeenCalledWith(
            expect.objectContaining({ message: "boom-stock-create" }),
            expect.objectContaining({ phase: "create-stock-upsert", merchantId: "m1" }),
        );
    });
});
