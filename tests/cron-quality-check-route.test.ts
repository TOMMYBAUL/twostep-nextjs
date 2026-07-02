import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * COUVERTURE Rang 3 / SCALE — route handler du cron `quality-check`, l'ALARME de complétude.
 *
 * Pourquoi ce cron compte (north-star §1 « ne rien perdre silencieusement ») : c'est le watchdog
 * qui détecte stock figé / prix aberrant / flux d'ingestion arrêté / caisse déconnectée. Une
 * alarme qui échoue EN SILENCE ou qui n'inspecte qu'une PARTIE du catalogue = la garantie entière
 * est nulle. Trouvé via un signal réel : l'alerte `ingest_silent` fraîche en prod (2026-06-30) a
 * mené à cette route, restée hors du sweep SCALE (ingest + 4 sorties Google).
 *
 * Bugs réels corrigés ici (même classe que tout le thème SCALE) :
 *  1. **Lecture produit `.limit(50000)` plafonnée par `max-rows` PostgREST (1000 sur ce projet)**
 *     → à l'échelle pilote (Deerskin = milliers de SKU) le watchdog ne contrôlait QUE les 1000
 *     premiers produits par id → stock figé/prix aberrant AU-DELÀ jamais alerté. Fix : `fetchAllRows`
 *     (pagination KEYSET). Preuve : catalogue 1500 → `products_checked===1500` (2 pages), pas 1000.
 *  2. **Dédup `alreadyOpen` plafonnée à 1000** : avec >1000 alertes ouvertes (catalogue périmé de
 *     milliers de lignes), le set était PARTIEL → un produit déjà alerté hors des 1000 premiers
 *     repassait dans `toInsert` → l'INSERT violait `uq_quality_alerts_open` → tout le batch rejeté
 *     (erreur avalée) → ZÉRO alerte ce run. Fix : dédup paginée + fail-loud. Preuve : 1200 alertes
 *     ouvertes → le produit déjà-ouvert au-delà du 1000ᵉ n'est PAS ré-inséré.
 *  3. **Lectures des watchdogs qui avalaient `error`** (silentCreds, deadConns, dédup) → alarme
 *     AVEUGLE sur un blip DB. Fix : captureError + `degraded`, jamais d'insert à l'aveugle, jamais
 *     un faux `ok:true`.
 *
 * Faux client Supabase fidèle à PostgREST en KEYSET : `.limit(n)` plafonné à 1000, `.gt("id",cur)`
 * = borne basse par VALEUR. Les helpers `fetchAllRows`/`chunk` + les détecteurs purs `isStockStale`
 * /`isPriceAberrant` tournent POUR DE VRAI (non mockés) → test non vacant.
 */

const MAX_ROWS = 1000;
type Row = Record<string, unknown>;

const h = {
    products: [] as Row[], // triés par id
    openAlerts: [] as Row[], // quality_alerts status=open (id, product_id, type), triés par id
    ingestCreds: [] as Row[], // ingest_credentials silencieux
    ingestOpen: [] as Row[], // alertes ingest_silent ouvertes (merchant_id)
    posConns: [] as Row[], // pos_connections mortes
    posOpen: [] as Row[], // alertes pos_disconnected ouvertes (merchant_id)
    inserts: [] as { table: string; rows: Row[] }[],
    productsPageCursors: [] as Array<string | null>,
    openAlertsPageCursors: [] as Array<string | null>,
    errors: {} as Record<string, { message: string } | null>,
    // Injecte l'anomalie SDK « data=null SANS error » par lecture logique (products,
    // openAlerts, ingestCreds, posConns, openIngest, openPos) → doit être fail-loud/visible.
    nullReads: {} as Record<string, boolean>,
};

function keyset(rows: Row[], cursor: string | null, limitN: number | null): Row[] {
    let out = rows;
    if (cursor != null) out = out.filter((r) => (r.id as string) > cursor);
    const cap = Math.min(limitN ?? MAX_ROWS, MAX_ROWS);
    return out.length > cap ? out.slice(0, cap) : out;
}

function makeClient() {
    function builder(table: string) {
        const st = {
            selectCols: "" as string,
            eq: {} as Record<string, unknown>,
            cursor: null as string | null,
            limitN: null as number | null,
        };

        function resolve(): { data: Row[] | null; error: { message: string } | null } {
            if (table === "products") {
                if (h.errors.products) return { data: null, error: h.errors.products };
                if (h.nullReads.products) return { data: null, error: null };
                h.productsPageCursors.push(st.cursor);
                return { data: keyset(h.products, st.cursor, st.limitN), error: null };
            }
            if (table === "quality_alerts") {
                const isDedup = st.selectCols.includes("type") && st.selectCols.includes("product_id");
                if (isDedup) {
                    if (h.errors.openAlerts) return { data: null, error: h.errors.openAlerts };
                    if (h.nullReads.openAlerts) return { data: null, error: null };
                    h.openAlertsPageCursors.push(st.cursor);
                    return { data: keyset(h.openAlerts, st.cursor, st.limitN), error: null };
                }
                if (st.eq.type === "ingest_silent") {
                    if (h.errors.ingestOpen) return { data: null, error: h.errors.ingestOpen };
                    if (h.nullReads.openIngest) return { data: null, error: null };
                    return { data: h.ingestOpen, error: null };
                }
                if (st.eq.type === "pos_disconnected") {
                    if (h.errors.posOpen) return { data: null, error: h.errors.posOpen };
                    if (h.nullReads.openPos) return { data: null, error: null };
                    return { data: h.posOpen, error: null };
                }
                return { data: [], error: null };
            }
            if (table === "ingest_credentials") {
                if (h.errors.ingestCreds) return { data: null, error: h.errors.ingestCreds };
                if (h.nullReads.ingestCreds) return { data: null, error: null };
                return { data: h.ingestCreds, error: null };
            }
            if (table === "pos_connections") {
                if (h.errors.posConns) return { data: null, error: h.errors.posConns };
                if (h.nullReads.posConns) return { data: null, error: null };
                return { data: h.posConns, error: null };
            }
            return { data: [], error: null };
        }

        const b: Record<string, unknown> = {};
        b.select = (cols?: string) => {
            st.selectCols = cols ?? "";
            return b;
        };
        b.eq = (col: string, val: unknown) => {
            st.eq[col] = val;
            return b;
        };
        b.is = () => b;
        b.not = () => b;
        b.lt = () => b;
        b.order = () => b;
        b.gt = (col: string, val: unknown) => {
            if (col === "id") st.cursor = val as string;
            return b;
        };
        b.limit = (n: number) => {
            st.limitN = n;
            return b;
        };
        b.insert = (rows: Row | Row[]) => {
            if (h.errors.insert) return Promise.resolve({ data: null, error: h.errors.insert });
            h.inserts.push({ table, rows: Array.isArray(rows) ? rows : [rows] });
            return Promise.resolve({ data: null, error: null });
        };
        b.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
            Promise.resolve(resolve()).then(ok, err);
        return b;
    }
    return { from: (table: string) => builder(table) } as never;
}

const mockAdmin = { current: null as ReturnType<typeof makeClient> | null };
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mockAdmin.current }));
vi.mock("@/lib/error", () => ({ captureError: vi.fn() }));
import { captureError } from "@/lib/error";
const mockCapture = vi.mocked(captureError);

function authedReq() {
    return {
        headers: { get: (k: string) => (k === "authorization" ? "Bearer test-secret" : null) },
    } as never;
}

/** Produit stock figé (quantité > 0 + updated_at très ancien) ; prix VALIDE + catégorie null →
 *  seul `stock_stale` déclenche (isPriceAberrant(prix>0, bounds=null)=false → pas de double alerte). */
function staleProduct(i: number): Row {
    return {
        id: `p${String(i).padStart(5, "0")}`,
        merchant_id: "m-1",
        category: null,
        price: 10,
        stock: [{ quantity: 5, updated_at: "2020-01-01T00:00:00.000Z" }],
    };
}

async function run() {
    const { GET } = await import("@/app/api/cron/quality-check/route");
    const res = await GET(authedReq());
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

function insertedTypes(type: string): Row[] {
    return h.inserts.filter((w) => w.table === "quality_alerts").flatMap((w) => w.rows).filter((r) => r.type === type);
}

describe("cron/quality-check — l'alarme de complétude (route handler)", () => {
    beforeEach(() => {
        Object.assign(h, {
            products: [],
            openAlerts: [],
            ingestCreds: [],
            ingestOpen: [],
            posConns: [],
            posOpen: [],
            inserts: [],
            productsPageCursors: [],
            openAlertsPageCursors: [],
            errors: {},
            nullReads: {},
        });
        mockAdmin.current = makeClient();
        process.env.CRON_SECRET = "test-secret";
        vi.clearAllMocks();
    });

    it("sans bearer cron → 401 (aucune lecture DB)", async () => {
        const { GET } = await import("@/app/api/cron/quality-check/route");
        const res = await GET({ headers: { get: () => null } } as never);
        expect(res.status).toBe(401);
        expect(h.productsPageCursors).toHaveLength(0);
    });

    it("SCALE — catalogue 1500 : lit TOUT en 2 pages KEYSET, alerte les 1500 (pas 1000)", async () => {
        h.products = Array.from({ length: 1500 }, (_, i) => staleProduct(i));
        const { status, body } = await run();
        expect(status).toBe(200);
        // Pagination keyset : page 1 (curseur null) + page 2 (curseur = dernier id de la page pleine).
        expect(h.productsPageCursors).toEqual([null, "p00999"]);
        expect(body.products_checked).toBe(1500);
        expect(body.stock_stale).toBe(1500);
        // 1500 alertes neuves insérées par lots de 500 (chunk) → 3 lots, pas de troncature.
        expect(insertedTypes("stock_stale")).toHaveLength(1500);
        expect(body.new_alerts).toBe(1500);
        expect(body.ok).toBe(true);
    });

    it("SCALE — dédup PAGINÉE : un produit déjà alerté au-delà du 1000ᵉ n'est PAS ré-inséré", async () => {
        // 1500 produits stale ; 1200 déjà alertés ouverts (p00000..p01199) → set dédup complet EXIGE 2 pages.
        h.products = Array.from({ length: 1500 }, (_, i) => staleProduct(i));
        h.openAlerts = Array.from({ length: 1200 }, (_, i) => ({
            id: `a${String(i).padStart(5, "0")}`,
            product_id: `p${String(i).padStart(5, "0")}`,
            type: "stock_stale",
        }));
        const { body } = await run();
        // La dédup a bien paginé (1200 > 1000) → 2 pages.
        expect(h.openAlertsPageCursors).toEqual([null, "a00999"]);
        // Seuls les 300 vraiment nouveaux (p01200..p01499) sont insérés ; aucun doublon des 1200 ouverts.
        const inserted = insertedTypes("stock_stale");
        expect(inserted).toHaveLength(300);
        expect(inserted.every((r) => (r.product_id as string) >= "p01200")).toBe(true);
        expect(body.new_alerts).toBe(300);
        expect(body.ok).toBe(true);
    });

    it("FAIL-LOUD — lecture produit en erreur → 500 + captureError (jamais 0 produit/ok:true)", async () => {
        h.products = [staleProduct(0)];
        h.errors.products = { message: "db down" };
        const { status, body } = await run();
        expect(status).toBe(500);
        expect(String(body.error)).toContain("Quality check failed");
        expect(mockCapture).toHaveBeenCalled();
        expect(insertedTypes("stock_stale")).toHaveLength(0);
    });

    it("FAIL-VISIBLE — dédup en erreur → dégradé, PAS d'insert produit à l'aveugle (unique-violation)", async () => {
        h.products = [staleProduct(0), staleProduct(1)];
        h.errors.openAlerts = { message: "dedup read failed" };
        const { status, body } = await run();
        expect(status).toBe(200);
        expect(body.degraded).toBe(true);
        expect(body.ok).toBe(false);
        expect(body.errors).toContain("dedup-read-failed");
        // stock_stale toujours compté (scan), mais AUCUN insert produit sans dédup fiable.
        expect(body.stock_stale).toBe(2);
        expect(body.new_alerts).toBe(0);
        expect(insertedTypes("stock_stale")).toHaveLength(0);
        expect(mockCapture).toHaveBeenCalled();
    });

    it("FAIL-VISIBLE — insert produit en erreur → dégradé + compteur honnête (0), pas un faux succès", async () => {
        h.products = [staleProduct(0)];
        h.errors.insert = { message: "insert failed" };
        const { body } = await run();
        expect(body.degraded).toBe(true);
        expect(body.errors).toContain("insert-product-alerts-failed");
        expect(body.new_alerts).toBe(0);
        expect(mockCapture).toHaveBeenCalled();
    });

    it("Watchdog ingestion : marchand silencieux non encore alerté → 1 alerte ingest_silent + Sentry", async () => {
        h.ingestCreds = [{ merchant_id: "m-1", last_used_at: "2020-01-01T00:00:00.000Z" }];
        h.ingestOpen = [];
        const { body } = await run();
        expect(body.ingest_silent_new).toBe(1);
        expect(insertedTypes("ingest_silent")).toHaveLength(1);
        expect(body.ok).toBe(true);
    });

    it("Watchdog ingestion : lecture credentials en erreur → alarme AVEUGLE rendue VISIBLE (dégradé, 0 insert aveugle)", async () => {
        h.errors.ingestCreds = { message: "creds read failed" };
        const { body } = await run();
        expect(body.degraded).toBe(true);
        expect(body.errors).toContain("ingest-watchdog-read-failed");
        expect(insertedTypes("ingest_silent")).toHaveLength(0);
        expect(mockCapture).toHaveBeenCalled();
    });

    it("FAIL-VISIBLE — creds ingestion null SANS erreur → dégradé (jamais skip muet sous ok:true)", async () => {
        // Anomalie SDK : la lecture du watchdog ingestion renvoie data=null sans error. Sans la garde
        // `!silentCreds`, `else if (silentCreds && …)` sautait le bloc EN SILENCE → faux ok:true (finding revue).
        h.nullReads.ingestCreds = true;
        const { body } = await run();
        expect(body.ok).toBe(false);
        expect(body.degraded).toBe(true);
        expect(body.errors).toContain("ingest-watchdog-read-failed");
        expect(body.ingest_silent_new).toBe(0);
        expect(mockCapture).toHaveBeenCalled();
    });

    it("FAIL-VISIBLE — dédup ingestion null SANS erreur → dégradé, PAS d'insert aveugle (unique-violation)", async () => {
        // silentCreds a des marchands, mais la dédup openIngest renvoie null sans error → set vide
        // ré-insérerait un marchand déjà alerté → violation uq_quality_alerts_merchant_open. On skippe.
        h.ingestCreds = [{ merchant_id: "m-1", last_used_at: "2020-01-01T00:00:00.000Z" }];
        h.nullReads.openIngest = true;
        const { body } = await run();
        expect(body.degraded).toBe(true);
        expect(body.errors).toContain("ingest-watchdog-dedup-failed");
        expect(insertedTypes("ingest_silent")).toHaveLength(0);
    });

    it("Watchdog POS : caisse morte non alertée → 1 alerte pos_disconnected", async () => {
        h.posConns = [{ merchant_id: "m-1", provider: "square", last_sync_error: "token revoked" }];
        h.posOpen = [];
        const { body } = await run();
        expect(body.pos_disconnected_new).toBe(1);
        expect(insertedTypes("pos_disconnected")).toHaveLength(1);
    });

    it("catalogue sain (0 produit, 0 watchdog) → ok:true, 0 alerte, non dégradé", async () => {
        const { status, body } = await run();
        expect(status).toBe(200);
        expect(body.ok).toBe(true);
        expect(body.degraded).toBe(false);
        expect(body.new_alerts).toBe(0);
        expect(h.inserts).toHaveLength(0);
    });
});
