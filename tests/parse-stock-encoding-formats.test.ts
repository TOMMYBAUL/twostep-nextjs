import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseStockFile } from "@/lib/ingest/parse-stock";

/**
 * VALIDATION MAILLON 1 (suite) — les 3 facettes RESTANTES du parseur snapshot,
 * chacune sur une entrée RÉELLE et SALE, sortie inspectée champ par champ :
 *   A. Encodage Windows-1252 / Latin-1 (export POS legacy FR : Clictill, Fastmag,
 *      Excel-FR) — sans détection d'encodage, « Quantité » mojibake et la colonne
 *      est PERDUE EN SILENCE (qté → 1 « présence »). C'est le bug north-star n°1.
 *   B. Chemin XLSX binaire (cellules numériques natives, pas du texte).
 *   C. En-têtes inhabituels mais réels (auto-détection `detectColumns`).
 *
 * Complète `parse-stock-realworld.test.ts` (CSV UTF-8 sale).
 */

// Encode une chaîne JS en Windows-1252 pour les accents FR du jeu Latin-1 (é=0xE9,
// è=0xE8, à=0xE0, ç=0xE7…), byte-identiques entre Latin-1 et CP1252. Buffer "latin1"
// écrit charCode<256 tel quel — exactement ce que produit un export POS FR legacy.
const cp1252 = (s: string) => Buffer.from(s, "latin1");

describe("parseStockFile — A. encodage Windows-1252 / Latin-1 (maillon 1)", () => {
    // Header + données accentués, séparateur `;` FR, le tout en CP1252 (pas UTF-8).
    const CSV_FR = [
        "Code-barres;Désignation;Quantité;Prix;Marque",
        "3661112488556;Crème dépilatoire;12;19,90;Lâncome",
        "3661112488563;Bûche pâtissière;0;29,90;Délice",
    ].join("\n");

    const { items } = parseStockFile(cp1252(CSV_FR));

    it("PREUVE : sortie inspectable", () => {
        // eslint-disable-next-line no-console
        console.log("CP1252 PARSED:\n" + JSON.stringify(items, null, 2));
        expect(items).toHaveLength(2);
    });

    it("la colonne Quantité (accentuée) EST détectée → qté réelle, pas le défaut 1", () => {
        // Sans la détection d'encodage, l'en-tête « Quantit� » échouait à matcher →
        // quantity retombait silencieusement sur 1 (et 0 sur le défaut). On exige la vraie valeur.
        expect(items[0].quantity).toBe(12);
        expect(items[1].quantity).toBe(0); // rupture conservée, PAS écrasée par le défaut 1
    });

    it("les noms accentués sont décodés proprement (zéro mojibake sur la fiche)", () => {
        expect(items[0].name).toBe("Crème dépilatoire");
        expect(items[1].name).toBe("Bûche pâtissière");
    });

    it("la marque accentuée et l'EAN sont corrects", () => {
        expect(items[0].brand).toBe("Lâncome");
        expect(items[0].ean).toBe("3661112488556");
        expect(items[0].unit_price).toBe(19.9);
    });

    it("preuve négative : sans détection, l'UTF-8 naïf aurait cassé l'en-tête", () => {
        // Documente le mode d'échec qu'on prévient : décodé en UTF-8, l'octet 0xE9
        // produit le caractère de remplacement → la colonne n'est plus reconnue.
        expect(cp1252("Quantité").toString("utf-8")).toContain("�");
    });
});

describe("parseStockFile — B. chemin XLSX binaire (maillon 1)", () => {
    // Construit un VRAI classeur xlsx binaire (signature ZIP « PK »), cellules
    // numériques natives pour qté/prix (pas des chaînes) — le cas réel d'un export Excel.
    function buildXlsx(aoa: (string | number)[][]): Buffer {
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Stock");
        return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    }

    const buffer = buildXlsx([
        ["Code-barres", "Désignation", "Quantité", "Prix", "Taille"],
        ["3661112488556", "Crème hydratante", 12, 19.9, "50ml"],
        ["3661112488563", "Sérum visage", 0, 29.9, "30ml"],
    ]);

    it("le buffer est bien un XLSX binaire (signature ZIP PK)", () => {
        expect(buffer[0]).toBe(0x50); // P
        expect(buffer[1]).toBe(0x4b); // K
    });

    const { items } = parseStockFile(buffer);

    it("PREUVE : sortie inspectable", () => {
        // eslint-disable-next-line no-console
        console.log("XLSX PARSED:\n" + JSON.stringify(items, null, 2));
        expect(items).toHaveLength(2);
    });

    it("cellules numériques natives (qté/prix) correctement lues", () => {
        expect(items[0]).toEqual({
            name: "Crème hydratante", ean: "3661112488556", sku: null, brand: null,
            quantity: 12, unit_price: 19.9, size: "50ml",
        });
        // qté 0 native (rupture) conservée, jamais transformée en 1
        expect(items[1].quantity).toBe(0);
    });
});

describe("parseStockFile — C. en-têtes inhabituels mais réels (maillon 1)", () => {
    // Variantes d'en-têtes qu'on rencontre vraiment (Gencode, Libellé, Qté, PU HT,
    // Pointure, Fabricant) — chacune doit être auto-détectée vers la bonne colonne.
    const CSV = [
        "Gencode;Libellé;Qté;PU HT;Pointure;Fabricant",
        "3661112488556;Basket running;3;89,00;42;Nike",
    ].join("\n");

    const { items } = parseStockFile(Buffer.from(CSV, "utf-8"));

    it("PREUVE : sortie inspectable", () => {
        // eslint-disable-next-line no-console
        console.log("UNUSUAL HEADERS PARSED:\n" + JSON.stringify(items, null, 2));
        expect(items).toHaveLength(1);
    });

    it("toutes les colonnes inhabituelles sont mappées correctement", () => {
        expect(items[0]).toEqual({
            name: "Basket running",
            ean: "3661112488556", // « Gencode »
            sku: null,
            brand: "Nike", // « Fabricant »
            quantity: 3, // « Qté »
            unit_price: 89, // « PU HT »
            size: "42", // « Pointure »
        });
    });
});
