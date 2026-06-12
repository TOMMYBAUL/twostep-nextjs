import * as XLSX from "xlsx";
import { parseSpreadsheetBuffer, detectColumns } from "@/lib/parser/spreadsheet";
import type { ParsedInvoiceItem } from "@/lib/parser/types";

/**
 * Lit les lignes d'un fichier stock.
 * - XLSX (binaire, signature ZIP "PK") → parseur partagé (encodage géré par XLSX).
 * - CSV (texte) → décodage UTF-8 explicite (strip BOM) AVANT parsing, sinon les
 *   en-têtes accentués FR ("quantité") sont mal décodés (mojibake) et les colonnes
 *   ne sont plus reconnues. Gère aussi le délimiteur `;` français.
 */
function readRows(buffer: Buffer): string[][] {
    const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b; // "PK" → XLSX
    if (isZip) return parseSpreadsheetBuffer(buffer);

    const text = buffer.toString("utf-8").replace(/^﻿/, "");
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
 * délimiteur `;` français) du parseur partagé.
 */
export function parseStockFile(buffer: Buffer): { items: ParsedInvoiceItem[] } {
    const rows = readRows(buffer);
    if (rows.length < 2) return { items: [] };

    const headers = rows[0].map((h) => String(h ?? ""));
    const mapping = detectColumns(headers);

    const items: ParsedInvoiceItem[] = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const name = mapping.name !== null ? String(row[mapping.name] ?? "").trim() : "";
        const ean = mapping.ean !== null ? String(row[mapping.ean] ?? "").trim() || null : null;
        const sku = mapping.sku !== null ? String(row[mapping.sku] ?? "").trim() || null : null;
        const brand = mapping.brand !== null ? String(row[mapping.brand] ?? "").trim() || null : null;

        // Identité requise : EAN, SKU ou nom. Sinon ligne vide -> skip.
        if (!name && !ean && !sku) continue;

        // Quantité : si la colonne existe on l'utilise (0 compris = rupture) ;
        // si elle est absente, on retombe sur 1 ("présence" — mode dégradé).
        let quantity = 1;
        if (mapping.quantity !== null) {
            const q = Number(String(row[mapping.quantity] ?? "").replace(",", "."));
            quantity = Number.isFinite(q) ? Math.max(0, Math.trunc(q)) : 0;
        }

        const rawPrice = mapping.unit_price !== null ? row[mapping.unit_price] : null;
        const unit_price =
            rawPrice != null && rawPrice !== ""
                ? Number(String(rawPrice).replace(",", ".")) || null
                : null;

        const displayName = name || (ean ? `EAN ${ean}` : `REF ${sku}`);
        items.push({ name: displayName, ean, sku, brand, quantity, unit_price });
    }

    return { items };
}
