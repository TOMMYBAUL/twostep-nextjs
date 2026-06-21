import { describe, it, expect } from "vitest";
import { parseStockFile } from "@/lib/ingest/parse-stock";

/**
 * VALIDATION MAILLON 1 du workflow cœur — le parseur de snapshot stock face à un
 * export RÉEL et SALE (pas un fichier de labo). Preuve, pas « ça compile » :
 * en-têtes FR accentués + séparateur `;`, qté 0/décimale, nom manquant (contrat
 * NearSt minimal), prix `1 199,00 €`, code-barres égaré dans la colonne quantité,
 * « Default Title », prix négatif. On inspecte CHAQUE champ de CHAQUE ligne.
 */

// CSV FR réaliste : séparateur `;`, en-têtes accentués, lignes piégeuses.
const MESSY_CSV = [
    "Code-barres;Désignation;Quantité;Prix TTC;Taille",
    "3661112488556;Crème hydratante;12;19,90 €;50ml",        // nominal
    "3661112488563;Sérum visage;0;29,90;30ml",                // rupture (qty 0 conservée)
    "3661112488570;;5;12,50;",                                 // nom manquant -> placeholder EAN
    "3661112488587;Gel douche;3,0;9,90;",                      // qté décimale -> 3
    "3661112488594;Coffret prestige;2;1 199,00 €;",           // prix milliers + €
    ";Produit sans code ni sku;4;5,00;",                       // identité = nom seul (gardé ici, rejeté au triage)
    "3661112488600;Article cassé;3661112488600;10,00;",        // code-barres dans la colonne qté -> plafond 9999
    "3661112488617;T-shirt logo;7;15,00;Default Title",        // size "Default Title" -> null
    "3661112488624;Prix négatif;1;-5,00;",                     // prix négatif -> unit_price null
    "   ;   ;   ;   ;   ",                                      // ligne vide -> skippée
].join("\n");

describe("parseStockFile — robustesse export FR réel (maillon 1)", () => {
    const { items } = parseStockFile(Buffer.from(MESSY_CSV, "utf-8"));

    it("PREUVE : sortie complète inspectable", () => {
        // Trace lisible dans le rapport de test (evidence, pas juste un vert).
        // eslint-disable-next-line no-console
        console.log("PARSED ITEMS:\n" + JSON.stringify(items, null, 2));
        expect(Array.isArray(items)).toBe(true);
    });

    it("ne garde QUE les lignes à identité (9 lignes data, 1 vide skippée → 9 items)", () => {
        expect(items).toHaveLength(9);
    });

    it("ligne nominale : tous les champs corrects", () => {
        expect(items[0]).toEqual({
            name: "Crème hydratante", ean: "3661112488556", sku: null, brand: null,
            quantity: 12, unit_price: 19.9, size: "50ml",
        });
    });

    it("rupture : qté 0 CONSERVÉE (jamais transformée en 1)", () => {
        expect(items[1].quantity).toBe(0);
    });

    it("nom manquant : placeholder `EAN <code>` (la cascade remplacera), identité = EAN", () => {
        expect(items[2].name).toBe("EAN 3661112488570");
        expect(items[2].ean).toBe("3661112488570");
        expect(items[2].quantity).toBe(5);
    });

    it("qté décimale `3,0` → 3 (tronquée, virgule gérée)", () => {
        expect(items[3].quantity).toBe(3);
    });

    it("prix `1 199,00 €` → 1199 (espaces milliers + € + virgule)", () => {
        expect(items[4].unit_price).toBe(1199);
    });

    it("nom seul (sans EAN/SKU) : gardé au parse (le rejet d'identité est au triage)", () => {
        expect(items[5].name).toBe("Produit sans code ni sku");
        expect(items[5].ean).toBeNull();
        expect(items[5].sku).toBeNull();
    });

    it("code-barres égaré dans la colonne quantité → plafonné à 9999 (anti-aberration)", () => {
        expect(items[6].quantity).toBe(9999);
    });

    it("size « Default Title » → null (bruit Shopify)", () => {
        expect(items[7].size).toBeNull();
    });

    it("prix négatif → unit_price null (jamais sur la fiche)", () => {
        expect(items[8].unit_price).toBeNull();
    });
});
