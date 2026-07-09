import { describe, it, expect } from "vitest";
import { parseStockFile } from "@/lib/ingest/parse-stock";
import { detectColumns } from "@/lib/parser/spreadsheet";

/**
 * P1-3 (Opération Pilote) — le wedge email-in FR prouvé sur des exports RÉALISTES
 * Clictill / Fastmag, champ par champ.
 *
 * Sources des formats (documentées, pas devinées) :
 *  - Fastmag (docs EDI officielles fastmag.fr, « Importations Standards ») : fichiers
 *    TEXTE avec TABULATION comme séparateur, extension .txt, décimal « . », champ
 *    « Gencod » (le terme FR historique pour l'EAN), « Codemag » (code article interne),
 *    colonnes PA (prix d'achat) / PV (prix de vente), stock + stock resa. Profil
 *    prêt-à-porter : Coloris / Taille par ligne.
 *  - Clictill (back-office « état du stock », export CSV, wiki.clictill.com) : CSV `;`
 *    FR, colonnes du domaine Clictill (Référence, Code barre, Désignation, Marque,
 *    Sous-famille, Prix TTC, Stock…), encodage legacy Windows-1252 fréquent.
 *
 * LIMITE HONNÊTE : fixtures SYNTHÉTISÉES depuis le vocabulaire documenté des deux
 * éditeurs — pas des fichiers capturés chez un marchand. La validation sur un export
 * réel reste à faire au premier pilote (runbook §dépannage).
 *
 * Pièges réels que ces tests verrouillent :
 *  1. « Gencod » (sans e final — l'orthographe DOCUMENTÉE Fastmag) doit mapper l'EAN ;
 *  2. séparateur TABULATION (.txt Fastmag) doit être détecté comme le `;` ;
 *  3. « PV » = prix de VENTE capté ; « PA » (prix d'achat) JAMAIS capté comme prix ;
 *  4. « Stock » = quantité, mais JAMAIS « Stock mini » / « Stock resa » /
 *     « Valeur stock » (seuil d'alerte / réservé / valorisation €) — capter l'un
 *     d'eux = stock FAUX publié, la pire violation north-star ;
 *  5. « Codemag » = référence marchand (SKU).
 */

// Export POS FR legacy = Windows-1252 (é=0xE9…), byte-identique Latin-1 sur ce jeu.
const cp1252 = (s: string) => Buffer.from(s, "latin1");

describe("parseStockFile — export Fastmag Boutique réaliste (.txt TAB, Gencod, PA/PV)", () => {
    const TXT = [
        "Gencod\tCodemag\tDésignation\tColoris\tTaille\tPA\tPV\tStock\tStock resa",
        "3600541255432\tTSH001\tT-shirt col rond coton bio\tMarine\tM\t12.50\t29.90\t4\t1",
        "3600541255449\tTSH001\tT-shirt col rond coton bio\tMarine\tL\t12.50\t29.90\t0\t0",
        "\tJEA204\tJean slim stretch délavé\tBrut\t40\t25.00\t79.00\t2\t0",
    ].join("\r\n");

    const { items, coverage } = parseStockFile(cp1252(TXT));

    it("PREUVE : sortie inspectable, 3 lignes, séparateur TAB détecté", () => {
        // eslint-disable-next-line no-console
        console.log("FASTMAG TXT PARSED:\n" + JSON.stringify({ items, coverage }, null, 2));
        expect(items).toHaveLength(3);
    });

    it("« Gencod » (orthographe documentée Fastmag) mappe bien l'EAN", () => {
        expect(items[0].ean).toBe("3600541255432");
        expect(coverage.identifier).toBe(true);
    });

    it("« Codemag » mappe la référence marchand (SKU) — la ligne sans gencod garde une identité", () => {
        expect(items[0].sku).toBe("TSH001");
        expect(items[2].ean).toBeNull();
        expect(items[2].sku).toBe("JEA204");
    });

    it("« PV » (prix de vente) est capté ; « PA » (prix d'achat) ne l'est JAMAIS", () => {
        // Si PA était capté, unit_price serait 12.50 → prix d'achat PUBLIÉ = faux prix.
        expect(items[0].unit_price).toBe(29.9);
        expect(items[2].unit_price).toBe(79);
        expect(coverage.price).toBe(true);
    });

    it("« Stock » = quantité réelle ; « Stock resa » (réservé) n'écrase jamais la quantité", () => {
        expect(items[0].quantity).toBe(4); // PAS 1 (resa), PAS le défaut 1
        expect(items[1].quantity).toBe(0); // rupture conservée
        expect(items[2].quantity).toBe(2);
        expect(coverage.quantity).toBe(true);
    });

    it("Taille par colonne dédiée + nom accentué décodé (CP1252)", () => {
        expect(items[0].size).toBe("M");
        expect(items[2].size).toBe("40");
        expect(items[2].name).toBe("Jean slim stretch délavé");
    });
});

describe("parseStockFile — export Clictill back-office réaliste (CSV ;, Prix TTC, Stock mini/Valeur stock)", () => {
    const CSV = [
        "Référence;Code barre;Désignation;Marque;Sous-famille;Prix TTC;Stock;Stock mini;Valeur stock",
        "CT-00123;3253581768648;Crème Mains Karité 150 ml;L'Occitane;Soins du corps;12,90;7;2;90,30",
        "CT-00456;3337875696548;Lipikar Baume AP+M 400 ml;La Roche-Posay;Soins visage;22,50;0;1;0,00",
    ].join("\r\n");

    const { items, coverage } = parseStockFile(cp1252(CSV));

    it("PREUVE : sortie inspectable, 2 lignes", () => {
        // eslint-disable-next-line no-console
        console.log("CLICTILL CSV PARSED:\n" + JSON.stringify({ items, coverage }, null, 2));
        expect(items).toHaveLength(2);
    });

    it("champ par champ : identité, marque, prix TTC virgule FR, quantité Stock", () => {
        expect(items[0]).toEqual({
            name: "Crème Mains Karité 150 ml",
            ean: "3253581768648",
            sku: "CT-00123",
            brand: "L'Occitane",
            quantity: 7,
            unit_price: 12.9,
            size: null,
        });
    });

    it("« Stock mini » (seuil d'alerte) et « Valeur stock » (€) ne polluent NI la quantité NI le prix", () => {
        // quantity=2 (mini) ou 90.30 (valeur) publiés = stock faux : le test verrouille.
        expect(items[1].quantity).toBe(0); // rupture réelle, pas le mini 1
        expect(items[1].unit_price).toBe(22.5); // Prix TTC, pas la valorisation
        expect(coverage.quantity).toBe(true);
        expect(coverage.price).toBe(true);
    });
});

describe("detectColumns contexte 'stock' — garde adversariale sur la famille « stock » (ordre défavorable)", () => {
    it("les colonnes dérivées (mini/maxi/resa/valeur) placées AVANT ne volent pas la quantité", () => {
        const mapping = detectColumns([
            "Désignation", "Stock mini", "Stock maxi", "Stock resa", "Valeur stock", "Stock", "Gencod",
        ], "stock");
        expect(mapping.quantity).toBe(5); // « Stock », pas un dérivé
        expect(mapping.ean).toBe(6);
        expect(mapping.name).toBe(0);
    });

    it("fichier n'ayant QUE des dérivés (mini/sécurité/valeur) : quantité NON mappée (défaut honnête + coverage=false), jamais un faux stock", () => {
        const mapping = detectColumns(["Désignation", "Gencod", "Stock mini", "Stock sécurité", "Valeur stock"], "stock");
        expect(mapping.quantity).toBeNull();
    });

    it("« PV » est un prix ; « PA » n'en est pas un ; « Qté mini » n'est pas une quantité", () => {
        const mapping = detectColumns(["Désignation", "PA", "PV", "Qté mini", "Qté"], "stock");
        expect(mapping.unit_price).toBe(2); // PV
        expect(mapping.quantity).toBe(4); // Qté, pas « Qté mini »
    });

    it("« PV » se matche en MOT ENTIER : « PVC » (prix de vente conseillé) ne vole jamais le prix", () => {
        const mapping = detectColumns(["Désignation", "PVC", "PV", "Stock"], "stock");
        expect(mapping.unit_price).toBe(2); // PV, pas PVC
        // Et un état de stock qui n'a QUE le PVC : prix non mappé (null honnête).
        expect(detectColumns(["Désignation", "PVC", "Stock"], "stock").unit_price).toBeNull();
    });
});

describe("detectColumns contexte 'invoice' (défaut) — le vocabulaire stock ne contamine PAS les factures (revue SF-hunter HIGH)", () => {
    it("facture avec colonne « Stock » informative : la quantité LIVRÉE gagne, jamais le stock fournisseur", () => {
        const mapping = detectColumns(["Désignation", "EAN", "Stock", "Qté livrée", "Prix HT"]);
        expect(mapping.quantity).toBe(3); // « Qté livrée », PAS « Stock »
        expect(mapping.unit_price).toBe(4);
    });

    it("facture avec « PVC »/« PV conseillé » : le prix FACTURÉ gagne, jamais le prix conseillé", () => {
        const m1 = detectColumns(["Désignation", "PVC", "Prix facturé HT", "Qté"]);
        expect(m1.unit_price).toBe(2); // « Prix facturé HT », PAS « PVC »
        const m2 = detectColumns(["Désignation", "PV conseillé", "Prix facturé HT", "Qté"]);
        expect(m2.unit_price).toBe(2);
        // Facture n'ayant QUE « PV » : prix non mappé en contexte facture (le
        // fallback AI tranchera) — le candidat n'existe pas hors contexte stock.
        expect(detectColumns(["Désignation", "PV", "Qté"]).unit_price).toBeNull();
    });

    it("l'exclusion des dérivés protège AUSSI les factures : « Qté mini » (pré-existant) n'est plus happé", () => {
        const mapping = detectColumns(["Désignation", "Qté mini", "Qté livrée", "Prix HT"]);
        expect(mapping.quantity).toBe(2);
    });

    it("Gencod/Codemag (identité, sans vecteur de faux positif) restent reconnus sur les DEUX contextes", () => {
        const mapping = detectColumns(["Gencod", "Codemag", "Désignation", "Qté", "Prix HT"]);
        expect(mapping.ean).toBe(0);
        expect(mapping.sku).toBe(1);
    });
});
