import { describe, expect, it } from "vitest";
import { deriveStockListView } from "@/lib/stock/stock-list-view";

describe("deriveStockListView — honnêteté du chargement (north-star, écran Mon stock)", () => {
    it("loading → loading (squelettes, jamais l'EmptyState prématuré)", () => {
        expect(deriveStockListView({ loading: true, loadFailed: false, filteredCount: 0, hasSearch: false })).toEqual({
            kind: "loading",
        });
    });

    it("loading prime sur loadFailed (refetch en cours après une erreur)", () => {
        // `useProducts` remet error=null au début du fetch ; pendant loading on montre les squelettes.
        expect(deriveStockListView({ loading: true, loadFailed: true, filteredCount: 0, hasSearch: false })).toEqual({
            kind: "loading",
        });
    });

    it("RÉGRESSION : load échoué + 0 produit → error, JAMAIS un faux « catalogue vide »", () => {
        // Le bug d'origine : la page ignorait `error` → un 500 sur GET /api/products affichait
        // « Aucun produit encore — Ajoutez votre premier produit » = faux cul-de-sac → re-import en panique.
        expect(deriveStockListView({ loading: false, loadFailed: true, filteredCount: 0, hasSearch: false })).toEqual({
            kind: "error",
        });
    });

    it("load échoué prime même si une recherche est active", () => {
        expect(deriveStockListView({ loading: false, loadFailed: true, filteredCount: 0, hasSearch: true })).toEqual({
            kind: "error",
        });
    });

    it("chargé OK + produits → list", () => {
        expect(deriveStockListView({ loading: false, loadFailed: false, filteredCount: 12, hasSearch: false })).toEqual({
            kind: "list",
        });
    });

    it("chargé OK + 0 produit + recherche vide → empty (orienter vers l'import)", () => {
        expect(deriveStockListView({ loading: false, loadFailed: false, filteredCount: 0, hasSearch: false })).toEqual({
            kind: "empty",
        });
    });

    it("chargé OK + 0 résultat + recherche active → no-results (≠ empty : porte de sortie = effacer)", () => {
        expect(deriveStockListView({ loading: false, loadFailed: false, filteredCount: 0, hasSearch: true })).toEqual({
            kind: "no-results",
        });
    });

    it("chargé OK + produits + recherche active → list (les résultats priment)", () => {
        expect(deriveStockListView({ loading: false, loadFailed: false, filteredCount: 3, hasSearch: true })).toEqual({
            kind: "list",
        });
    });
});
