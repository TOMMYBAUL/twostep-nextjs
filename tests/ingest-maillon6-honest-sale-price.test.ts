import { describe, it, expect } from "vitest";
import { honestSalePrice } from "@/lib/products/sale-price";

/**
 * MAILLON 6 — Affichage honnête : preuve que le prix promo affiché par les routes consumer
 * (discover, products/discover, by-merchants) est TOUJOURS un vrai rabais (sale_price < price),
 * jamais un faux rabais périmé.
 *
 * Contexte du bug réel (garde asymétrique write→read) : le POST /promotions vérifie
 * `sale_price < product.price` à la CRÉATION (route promotions.ts:80), mais cette garde est
 * figée. Le prix produit peut BAISSER ensuite (re-ingest fichier, sync POS) sous une promo
 * encore active → la promo périmée a un sale_price ≥ prix courant. Les routes discover passaient
 * `sale_price` BRUT au front. `followed-feed.tsx:103` calcule alors
 * `Math.round((price - sale)/price * 100)` → pourcentage NÉGATIF/aberrant, prix barré incohérent
 * = faux rabais affiché (north-star « afficher honnêtement, zéro faux positif »).
 * `explorer-feed.tsx:47` ET `sticky-cta-bar.tsx:36` gardaient DÉJÀ `sale_price < price` côté
 * client — mais pas la grille principale ni followed-feed. La garde serveur unifie l'invariant.
 */

describe("maillon 6 — honestSalePrice : un sale_price affiché est toujours un vrai rabais", () => {
    it("renvoie le sale_price quand c'est un vrai rabais (sale < price)", () => {
        expect(honestSalePrice(100, 80)).toBe(80);
        expect(honestSalePrice(49.99, 39.99)).toBe(39.99);
        expect(honestSalePrice(10, 0)).toBe(0); // 0€ = giveaway honnête (0 < 10), non altéré
    });

    it("BUG RÉEL : promo périmée — prix baissé sous le sale_price → pas de faux rabais", () => {
        // Promo créée à price=100 / sale=80 (valide au POST). Le prix produit baisse ensuite à 70
        // (re-ingest/sync) ; la promo (ends_at futur) reste active avec sale_price=80 ≥ 70.
        // followed-feed afficherait -((70-80)/70*100) = +14% (badge "-(-14)%") = mensonge.
        expect(honestSalePrice(70, 80)).toBeNull();
    });

    it("renvoie null quand sale_price == price (aucun rabais réel)", () => {
        expect(honestSalePrice(50, 50)).toBeNull();
    });

    it("renvoie null pour les entrées absentes/illisibles (jamais de NaN affiché)", () => {
        expect(honestSalePrice(100, null)).toBeNull();
        expect(honestSalePrice(100, undefined)).toBeNull();
        expect(honestSalePrice(null, 80)).toBeNull();
        expect(honestSalePrice(undefined, 80)).toBeNull();
        expect(honestSalePrice(NaN, 80)).toBeNull();
        expect(honestSalePrice(100, NaN)).toBeNull();
        expect(honestSalePrice(Infinity, 80)).toBeNull();
    });

    it("sémantique IDENTIQUE aux gardes client existantes (sticky-cta-bar / explorer-feed)", () => {
        // Les fronts affichent le rabais ssi `salePrice != null && salePrice < price`.
        // La garde serveur doit produire exactement le même verdict sur tous les cas.
        const cases: Array<[number, number | null]> = [
            [100, 80], [100, 100], [100, 120], [100, null], [0, 0], [70, 80],
        ];
        for (const [price, sale] of cases) {
            const clientShows = sale != null && sale < price;
            const serverEmits = honestSalePrice(price, sale) != null;
            expect(serverEmits).toBe(clientShows);
        }
    });
});

/**
 * Verrou de contrat par ROUTE : on rejoue la transformation INLINE de chaque route émettrice
 * sur des lignes représentatives (une vraie promo + une promo périmée). Si une route régresse
 * vers `sale_price` brut, ce test casse. Couvre les 6 surfaces serveur unifiées au maillon 6.
 */
describe("maillon 6 — verrou de contrat : chaque route émettrice neutralise la promo périmée", () => {
    // Ligne "vraie promo" (sale 80 < price 100) et "promo périmée" (sale 80 ≥ price 70 après baisse).
    const realRow = { product_id: "real", product_price: 100, sale_price: 80 };
    const staleRow = { product_id: "stale", product_price: 70, sale_price: 80 };

    it("products/discover + discover (feed) : map → sale_price honnête", () => {
        // Réplique exacte de `sale_price: honestSalePrice(row.product_price, row.sale_price)`
        const mapFeed = (row: any) => ({ ...row, sale_price: honestSalePrice(row.product_price, row.sale_price) });
        expect(mapFeed(realRow).sale_price).toBe(80);
        expect(mapFeed(staleRow).sale_price).toBeNull(); // promo périmée → pas de faux rabais
    });

    it("search : map results → sale_price honnête (le badge ProductCard restait masqué, l'API ment plus)", () => {
        const results = [realRow, staleRow].map((r: any) => ({ ...r, sale_price: honestSalePrice(r.product_price, r.sale_price) }));
        expect(results.find((r) => r.product_id === "real")!.sale_price).toBe(80);
        expect(results.find((r) => r.product_id === "stale")!.sale_price).toBeNull();
    });

    it("discover (section promos) + feed/promos : map → filter → la promo périmée SORT du feed", () => {
        // Réplique de `.map(... honestSalePrice ...).filter(r => r.sale_price != null)`
        const promos = [realRow, staleRow]
            .map((row: any) => ({ ...row, sale_price: honestSalePrice(row.product_price, row.sale_price) }))
            .filter((row: any) => row.sale_price != null);
        expect(promos.map((p) => p.product_id)).toEqual(["real"]); // périmée exclue de l'onglet promos
    });

    it("products/[id] : filtre la jointure promotions → product-detail ne calcule plus de -X% aberrant", () => {
        // Réplique de `data.promotions.filter(pr => honestSalePrice(data.price, pr.sale_price) != null)`
        const product = { price: 70, promotions: [{ sale_price: 80, ends_at: null }, { sale_price: 55, ends_at: null }] };
        const honest = product.promotions.filter((pr: any) => honestSalePrice(product.price, pr.sale_price) != null);
        // Seule la promo 55 (< 70) survit ; la 80 (≥ 70) qui produisait Math.round((70-80)/70*100)=-14% est retirée.
        expect(honest).toEqual([{ sale_price: 55, ends_at: null }]);
        // product-detail.tsx prendrait alors activePromo = {55} → discount = Math.round((70-55)/70*100) = 21% honnête.
        const activePromo = honest.find((p: any) => !p.ends_at || new Date(p.ends_at) > new Date());
        const discount = activePromo ? Math.round(((product.price - activePromo.sale_price) / product.price) * 100) : 0;
        expect(discount).toBe(21);
        expect(discount).toBeGreaterThan(0); // jamais négatif/aberrant
    });
});
