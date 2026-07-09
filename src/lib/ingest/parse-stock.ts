import * as XLSX from "xlsx";
import { parseSpreadsheetBuffer, detectColumns } from "@/lib/parser/spreadsheet";
import { parsePrice } from "@/lib/parser/parse-price";
import type { ParsedInvoiceItem } from "@/lib/parser/types";

/**
 * Décode un buffer CSV/texte en chaîne JS en DÉTECTANT l'encodage, puis strip BOM.
 *
 * Pourquoi c'est critique (north-star « ne rien perdre silencieusement ») : les POS
 * legacy FR (Clictill, Fastmag) et Excel-FR exportent massivement en **Windows-1252 /
 * Latin-1**, pas en UTF-8. Un `buffer.toString("utf-8")` naïf transforme alors
 * « Quantité » → « Quantit� » (mojibake) → `detectColumns` ne reconnaît plus la
 * colonne → **les quantités sont perdues en silence** (chaque ligne retombe sur qty=1
 * « présence »). Bug prouvé empiriquement (octet 0xE9 = é CP1252).
 *
 * Stratégie (standard pour le CSV FR) :
 *  - BOM UTF-16 (Excel « Texte Unicode ») → décode utf-16le/be ;
 *  - sinon UTF-8 STRICT (`fatal`) : s'il décode, c'est de l'UTF-8 (avec/sans BOM) ;
 *  - sinon (séquence UTF-8 invalide) → repli Windows-1252 (legacy FR).
 */
function decodeCsvBuffer(buffer: Buffer): string {
    const stripBom = (s: string) => s.replace(/^﻿/, "");
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
        return stripBom(new TextDecoder("utf-16le").decode(buffer));
    }
    if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
        return stripBom(new TextDecoder("utf-16be").decode(buffer));
    }
    try {
        return stripBom(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
    } catch {
        // UTF-8 invalide → quasi certainement un export legacy Windows-1252 / Latin-1.
        return stripBom(new TextDecoder("windows-1252").decode(buffer));
    }
}

/**
 * Lit les lignes d'un fichier stock.
 * - XLSX (binaire, signature ZIP "PK") → parseur partagé (encodage géré par XLSX).
 * - CSV (texte) → décodage avec DÉTECTION d'encodage (UTF-8/UTF-16/Windows-1252,
 *   strip BOM) AVANT parsing, sinon les en-têtes accentués FR (« Quantité ») d'un
 *   export Latin-1 sont mojibakés et les colonnes perdues. Gère le délimiteur `;` FR.
 */
function readRows(buffer: Buffer): string[][] {
    const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b; // "PK" → XLSX
    if (isZip) return parseSpreadsheetBuffer(buffer);

    const text = decodeCsvBuffer(buffer);
    const read = (fs?: string): string[][] => {
        const wb = XLSX.read(text, fs ? { type: "string", FS: fs } : { type: "string" });
        const sheetName = wb.SheetNames[0];
        if (!sheetName) return [];
        return XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
            header: 1,
            defval: "",
            rawNumbers: false,
        });
    };
    let rows = read();
    // CSV `;` non détecté → tout en une colonne → re-parse en forçant le séparateur.
    if (rows.length > 1 && rows[0].length === 1 && String(rows[0][0]).includes(";")) {
        rows = read(";");
    }
    return rows;
}

/**
 * Couverture des colonnes critiques par la détection d'en-têtes.
 *
 * Pourquoi c'est un livrable du north-star (« ne rien perdre silencieusement ») :
 * quand une colonne critique n'est PAS reconnue, le parseur retombe sur un défaut
 * MUET (qté → 1 « présence »). Un marchand dont le fichier portait bien des
 * quantités, mais sous un en-tête non reconnu, verrait alors « 1 de chaque » SANS
 * AUCUN signal. La couverture transforme ce défaut muet en SIGNAL : le triage /
 * l'ingestion la relaie (statut honnête + Sentry + wizard), jamais un silence.
 */
export type ColumnCoverage = {
    /** Une colonne quantité a-t-elle été reconnue ? Si non → CHAQUE ligne = qty 1. */
    quantity: boolean;
    /** Au moins une colonne d'identité (code-barres OU référence) reconnue ? */
    identifier: boolean;
    /** Une colonne prix reconnue ? */
    price: boolean;
};

/**
 * Parseur dédié au SNAPSHOT de stock (contrat NearSt) — distinct du parseur de
 * factures.
 *
 * Différence cruciale : le parseur de factures EXIGE un nom de produit et rejette
 * les lignes sans nom. Or le contrat NearSt minimal est `{code-barres, quantité,
 * prix}` SANS nom (le titre vient de l'enrichissement par GTIN). Ici on garde
 * donc toute ligne portant une IDENTITÉ : EAN, SKU ou nom. Sans nom, on
 * synthétise un placeholder (`EAN xxxx`) que la cascade remplacera par le
 * `canonical_name`.
 *
 * Réutilise la détection de colonnes FR/EN et le parsing tableur (gère le
 * délimiteur `;` français) du parseur partagé. Retourne aussi la `coverage` des
 * colonnes critiques pour que l'ingestion puisse SIGNALER une colonne manquante
 * (quantité notamment) au lieu de défaut-muter en silence.
 */
export function parseStockFile(buffer: Buffer): { items: ParsedInvoiceItem[]; coverage: ColumnCoverage } {
    const rows = readRows(buffer);
    if (rows.length < 2) return { items: [], coverage: { quantity: false, identifier: false, price: false } };

    const headers = rows[0].map((h) => String(h ?? ""));
    const mapping = detectColumns(headers, "stock");
    const coverage: ColumnCoverage = {
        quantity: mapping.quantity !== null,
        identifier: mapping.ean !== null || mapping.sku !== null,
        price: mapping.unit_price !== null,
    };

    const items: ParsedInvoiceItem[] = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const name = mapping.name !== null ? String(row[mapping.name] ?? "").trim() : "";
        const ean = mapping.ean !== null ? String(row[mapping.ean] ?? "").trim() || null : null;
        const sku = mapping.sku !== null ? String(row[mapping.sku] ?? "").trim() || null : null;
        const brand = mapping.brand !== null ? String(row[mapping.brand] ?? "").trim() || null : null;
        // Taille depuis une colonne dédiée (fiable). Limitée à 16 chars (une taille
        // "XXL" / "42.5" / "T.U." est courte ; au-delà c'est une autre donnée).
        const sizeRaw = mapping.size !== null ? String(row[mapping.size] ?? "").trim() : "";
        const size = sizeRaw && sizeRaw.length <= 16 && sizeRaw.toLowerCase() !== "default title" ? sizeRaw : null;

        // Identité requise : EAN, SKU ou nom. Sinon ligne vide -> skip.
        if (!name && !ean && !sku) continue;

        // Quantité : si la colonne existe on l'utilise (0 compris = rupture) ;
        // si elle est absente, on retombe sur 1 ("présence" — mode dégradé).
        // Plafond 9999 : au-delà c'est une erreur d'export (colonne décalée,
        // code-barres dans la colonne quantité...), pas un stock de boutique.
        let quantity = 1;
        if (mapping.quantity !== null) {
            const q = Number(String(row[mapping.quantity] ?? "").replace(",", "."));
            quantity = Number.isFinite(q) ? Math.min(Math.max(0, Math.trunc(q)), 9999) : 0;
        }

        const rawPrice = mapping.unit_price !== null ? row[mapping.unit_price] : null;
        const parsedPrice = parsePrice(rawPrice);
        // Prix exploitable = strictement positif et plausible ; sinon null
        // (un prix négatif ou aberrant ne doit jamais atteindre la fiche).
        const unit_price = parsedPrice != null && parsedPrice > 0 && parsedPrice < 100_000
            ? parsedPrice
            : null;

        const displayName = name || (ean ? `EAN ${ean}` : `REF ${sku}`);
        items.push({ name: displayName, ean, sku, brand, quantity, unit_price, size });
    }

    return { items, coverage };
}
