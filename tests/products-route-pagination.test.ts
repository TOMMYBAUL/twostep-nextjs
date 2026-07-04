import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * P0-3 (audit optimisation 2026-07-04) — anti-troncature `max-rows` sur `GET /api/products`,
 * l'écran « Mon stock » (E3) du marchand pilote.
 *
 * Classe LESSONS « SELECT non borné → troncature silencieuse à 1000 lignes par PostgREST,
 * SANS erreur ». Le balayage de sortie Google + l'ingest ont été paginés (KEYSET) ; cette
 * lecture-ci était restée hors du sweep. Sur un catalogue > 1000 (pilote multimarque type
 * Deerskin = des milliers de SKU) l'écran paraissait AMPUTÉ et les compteurs total/ruptures/
 * dispo étaient FAUX → le marchand croit avoir perdu du stock et ré-importe en panique.
 *
 * Preuve UNIVERSELLE (indépendante de tout filtre d'affichage) : le faux client enregistre le
 * curseur de chaque page → un catalogue de 1500 doit produire DEUX pages KEYSET (curseur `null`
 * puis le dernier id de la 1re page pleine) ET rendre 1500 produits — le code d'origine
 * (`.order("name")` sans `.range()`) serait plafonné à 1000.
 */

const CATALOG = 1500; // > max-rows (1000)
const MAX_ROWS = 1000;

const h = {
    pageCursors: [] as Array<string | null>,
    error: null as { message: string } | null, // si posé, la lecture products échoue
};

vi.mock("@/lib/error", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/slug", () => ({ resolveMerchantId: vi.fn(async () => "m-1") }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => makeClient() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => makeClient() }));

/**
 * 1500 produits visibles/non-variantes. Le NOM est en ordre INVERSE de l'id (`Produit 1499`
 * pour l'id `p00000`, …) → le tri de sortie par nom DIFFÈRE de l'ordre de pagination par id,
 * ce qui prouve que le contrat d'affichage (tri par nom) est bien rétabli côté serveur.
 */
function makeProducts(): Array<Record<string, unknown>> {
    return Array.from({ length: CATALOG }, (_, i) => ({
        id: `p${String(i).padStart(5, "0")}`, // ordre lexical = ordre .order("id")
        name: `Produit ${String(CATALOG - 1 - i).padStart(5, "0")}`,
        ean: "1234567890123",
        price: 9.99,
        visible: true,
        variant_of: null,
        stock: [{ quantity: 5 }],
    }));
}

/** Faux client Supabase minimal fidèle à PostgREST en KEYSET : `.limit(n)` plafonné à 1000. */
function makeClient() {
    const products = makeProducts();

    function builder(table: string) {
        const st = { cursor: null as string | null, limitN: null as number | null };

        const resolve = () => {
            if (table === "products") {
                if (h.error) return { data: null, error: h.error };
                h.pageCursors.push(st.cursor);
                let rows = products;
                if (st.cursor != null) rows = rows.filter((r) => (r.id as string) > st.cursor!);
                const cap = Math.min(st.limitN ?? MAX_ROWS, MAX_ROWS);
                if (rows.length > cap) rows = rows.slice(0, cap);
                return { data: rows, error: null };
            }
            return { data: null, error: null };
        };

        const b: Record<string, unknown> = {};
        b.select = () => b;
        b.eq = () => b;
        b.is = () => b;
        b.gt = (_col: string, val: unknown) => {
            st.cursor = val as string;
            return b;
        };
        b.order = () => b;
        b.limit = (n: number) => {
            st.limitN = n;
            return b;
        };
        b.then = (ok: (v: unknown) => unknown, err: (e: unknown) => unknown) =>
            Promise.resolve(resolve()).then(ok, err);
        return b;
    }

    return {
        from: (table: string) => builder(table),
        auth: { getUser: async () => ({ data: { user: { id: "u-1" } }, error: null }) },
    } as never;
}

beforeEach(() => {
    h.pageCursors = [];
    h.error = null;
});

async function callGet() {
    const { GET } = await import("@/app/api/products/route");
    const req = new Request("http://localhost/api/products?merchant_id=m-1");
    return (await GET(req)) as Response;
}

describe("GET /api/products — pagination anti-troncature (P0-3, catalogue > max-rows)", () => {
    it("lit les 1500 produits en 2 pages KEYSET et les renvoie TOUS (pas ≤ 1000)", async () => {
        const res = await callGet();
        const json = await res.json();

        expect(res.status).toBe(200);
        // 2 pages : 1re sans curseur (null), 2e bornée par le dernier id de la 1re page pleine.
        expect(h.pageCursors).toEqual([null, `p${String(MAX_ROWS - 1).padStart(5, "0")}`]);
        expect(json.products).toHaveLength(CATALOG); // sans pagination : plafonné à 1000
    });

    it("restaure l'ordre d'affichage par NOM (≠ ordre de pagination par id)", async () => {
        const res = await callGet();
        const json = await res.json();
        const names: string[] = json.products.map((p: { name: string }) => p.name);

        // Non décroissant sous le collationnement fr → le tri par nom est bien rétabli.
        const sorted = [...names].sort((a, b) => a.localeCompare(b, "fr"));
        expect(names).toEqual(sorted);
        // Et ce n'est PAS l'ordre d'id (noms en ordre inverse des id) : le 1er nom est le plus petit.
        expect(names[0]).toBe("Produit 00000");
    });

    it("échec de lecture sur une page → 500 (jamais un catalogue tronqué présenté comme complet)", async () => {
        h.error = { message: "db down" };
        const res = await callGet();
        expect(res.status).toBe(500);
    });
});
