import * as XLSX from "xlsx";
import type { IInvoiceParser, ParsedInvoice, ParsedInvoiceItem } from "./types";

// Column header variants (case-insensitive matching)
const NAME_HEADERS = [
    "designation", "désignation", "article", "produit", "description",
    "libelle", "libellé", "product", "item", "nom", "intitule", "intitulé",
];

const EAN_HEADERS = [
    "ean", "code-barres", "barcode", "gtin", "code ean", "code barre", "ean13",
];

const SKU_HEADERS = [
    "reference", "référence", "ref", "réf", "sku", "code article",
    "art.", "code produit", "ref fournisseur", "ref article",
];

const QUANTITY_HEADERS = [
    "quantite", "quantité", "qte", "qté", "qty", "quantity", "nb", "nombre",
];

const UNIT_PRICE_HEADERS = [
    "prix", "pu", "prix unitaire", "unit price", "p.u.", "puht",
    "pu ht", "prix ht", "prix unit", "price", "tarif",
];

type ColumnMapping = {
    name: number | null;
    ean: number | null;
    sku: number | null;
    quantity: number | null;
    unit_price: number | null;
};

function normalizeHeader(header: string): string {
    return header
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // strip accents
        .replace(/[^a-z0-9 .-]/g, "") // keep alphanumeric, spaces, dots, dashes
        .trim();
}

function matchesAny(header: string, candidates: string[]): boolean {
    const normalized = normalizeHeader(header);
    return candidates.some((c) => {
        const normalizedCandidate = normalizeHeader(c);
        return normalized === normalizedCandidate || normalized.includes(normalizedCandidate);
    });
}

function detectColumns(headers: string[]): ColumnMapping {
    const mapping: ColumnMapping = { name: null, ean: null, sku: null, quantity: null, unit_price: null };

    for (let i = 0; i < headers.length; i++) {
        const h = headers[i];
        if (!h) continue;

        // Check SKU before name — "Réf. article" contains both "ref" (SKU) and "article" (name)
        if (mapping.sku === null && matchesAny(h, SKU_HEADERS)) {
            mapping.sku = i;
        } else if (mapping.name === null && matchesAny(h, NAME_HEADERS)) {
            mapping.name = i;
        } else if (mapping.ean === null && matchesAny(h, EAN_HEADERS)) {
            mapping.ean = i;
        } else if (mapping.quantity === null && matchesAny(h, QUANTITY_HEADERS)) {
            mapping.quantity = i;
        } else if (mapping.unit_price === null && matchesAny(h, UNIT_PRICE_HEADERS)) {
            mapping.unit_price = i;
        }
    }

    return mapping;
}

function extractStructured(rows: string[][], mapping: ColumnMapping): ParsedInvoiceItem[] {
    const items: ParsedInvoiceItem[] = [];

    // Skip header row (index 0), iterate data rows
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const name = mapping.name !== null ? String(row[mapping.name] ?? "").trim() : "";
        if (!name) continue; // skip empty rows

        const ean = mapping.ean !== null ? String(row[mapping.ean] ?? "").trim() || null : null;
        const sku = mapping.sku !== null ? String(row[mapping.sku] ?? "").trim() || null : null;
        const quantity = mapping.quantity !== null ? Number(row[mapping.quantity]) || 1 : 1;
        const rawPrice = mapping.unit_price !== null ? row[mapping.unit_price] : null;
        const unit_price = rawPrice != null && rawPrice !== "" ? Number(String(rawPrice).replace(",", ".")) || null : null;

        items.push({ name, ean, sku, quantity, unit_price });
    }

    return items;
}

function sheetToText(rows: string[][]): string {
    return rows
        .map((row) => row.join(" | "))
        .join("\n");
}

export function parseSpreadsheetBuffer(fileBuffer: Buffer): string[][] {
    // Try default parsing first
    let workbook = XLSX.read(fileBuffer, { type: "buffer" });
    let sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error("Spreadsheet contains no sheets");

    let sheet = workbook.Sheets[sheetName];
    let rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
        rawNumbers: false,
    });

    // If CSV was parsed as single column (semicolon separator not detected),
    // re-parse with FS option to force semicolon delimiter
    if (rows.length > 1 && rows[0].length === 1 && String(rows[0][0]).includes(";")) {
        workbook = XLSX.read(fileBuffer, { type: "buffer", FS: ";" });
        sheetName = workbook.SheetNames[0];
        if (sheetName) {
            sheet = workbook.Sheets[sheetName];
            rows = XLSX.utils.sheet_to_json(sheet, {
                header: 1,
                defval: "",
                rawNumbers: false,
            });
        }
    }

    return rows;
}

export const spreadsheetParser: IInvoiceParser = {
    name: "spreadsheet",

    async parse(fileBuffer: Buffer): Promise<ParsedInvoice> {
        const rows = parseSpreadsheetBuffer(fileBuffer);

        if (rows.length < 2) {
            throw new Error("Spreadsheet has fewer than 2 rows (need header + data)");
        }

        // Scan the first 30 rows to find the header row (real invoices have
        // supplier info, addresses, etc. above the product table)
        let headerRowIndex = -1;
        let mapping: ColumnMapping = { name: null, ean: null, sku: null, quantity: null, unit_price: null };

        const scanLimit = Math.min(rows.length, 30);
        for (let r = 0; r < scanLimit; r++) {
            const candidate = rows[r].map(String);
            const candidateMapping = detectColumns(candidate);
            // Need at least name + one of (ean, quantity, price) to consider it a header
            if (candidateMapping.name !== null &&
                (candidateMapping.ean !== null || candidateMapping.quantity !== null || candidateMapping.unit_price !== null)) {
                headerRowIndex = r;
                mapping = candidateMapping;
                break;
            }
        }

        if (headerRowIndex >= 0) {
            // Extract data rows starting AFTER the header
            const dataRows = rows.slice(headerRowIndex); // includes header at [0]
            const items = extractStructured(dataRows, mapping);

            if (items.length === 0) {
                throw new Error("No items extracted from spreadsheet despite matching headers");
            }

            return {
                supplier_name: null,
                invoice_date: null,
                items,
            };
        }

        // Headers not recognized: convert to text and fall through to AI parsers
        // Headers not recognized — fall through to AI parsers
        const textContent = sheetToText(rows);

        if (!textContent.trim()) {
            throw new Error("Spreadsheet contains no extractable text");
        }

        // Headers not recognized — use AI to parse the text content
        const { extractInvoicePrompt, parseJsonResponse } = await import("./shared");

        // Try Claude first
        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        if (anthropicKey) {
            try {
                const prompt = extractInvoicePrompt(textContent);
                const response = await fetch("https://api.anthropic.com/v1/messages", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-api-key": anthropicKey,
                        "anthropic-version": "2023-06-01",
                    },
                    body: JSON.stringify({
                        model: "claude-haiku-4-5-20251001",
                        max_tokens: 2048,
                        messages: [{ role: "user", content: prompt }],
                    }),
                });

                if (response.ok) {
                    const data = await response.json();
                    const text = data.content[0]?.text ?? "";
                    return parseJsonResponse(text);
                }
            } catch (err) {
                console.warn("[spreadsheet-parser] Claude fallback failed:", err);
            }
        }

        // Try Gemini as last resort
        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) throw new Error("No AI parser available for unrecognized spreadsheet headers. Set ANTHROPIC_API_KEY or GEMINI_API_KEY.");

        const prompt = extractInvoicePrompt(textContent);
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
                }),
            },
        );

        if (!response.ok) {
            throw new Error(`Gemini API error: ${response.status}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        return parseJsonResponse(text);
    },
};
