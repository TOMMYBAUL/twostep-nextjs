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

        if (mapping.name === null && matchesAny(h, NAME_HEADERS)) {
            mapping.name = i;
        } else if (mapping.ean === null && matchesAny(h, EAN_HEADERS)) {
            mapping.ean = i;
        } else if (mapping.sku === null && matchesAny(h, SKU_HEADERS)) {
            mapping.sku = i;
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
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error("Spreadsheet contains no sheets");

    const sheet = workbook.Sheets[sheetName];
    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
        rawNumbers: false,
    });

    return rows;
}

export const spreadsheetParser: IInvoiceParser = {
    name: "spreadsheet",

    async parse(fileBuffer: Buffer): Promise<ParsedInvoice> {
        const rows = parseSpreadsheetBuffer(fileBuffer);

        if (rows.length < 2) {
            throw new Error("Spreadsheet has fewer than 2 rows (need header + data)");
        }

        // Try to auto-detect columns from header row
        const headers = rows[0].map(String);
        const mapping = detectColumns(headers);

        // If we found at least the product name column, extract structured data directly
        if (mapping.name !== null) {
            console.log("[spreadsheet-parser] Headers detected, extracting structured data directly");
            const items = extractStructured(rows, mapping);

            if (items.length === 0) {
                throw new Error("No items extracted from spreadsheet despite matching headers");
            }

            return {
                supplier_name: null, // Not available from spreadsheet structure alone
                invoice_date: null,
                items,
            };
        }

        // Headers not recognized: convert to text and fall through to AI parsers
        console.log("[spreadsheet-parser] Headers not recognized, falling through to AI parsers");
        const textContent = sheetToText(rows);

        if (!textContent.trim()) {
            throw new Error("Spreadsheet contains no extractable text");
        }

        // Create a fake "PDF buffer" that the AI parsers can work with via text extraction
        // We bypass pdf-parse by calling the prompt/response functions directly
        const { extractInvoicePrompt, parseOllamaResponse } = await import("./ollama");

        // Try Ollama first
        const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
        try {
            const prompt = extractInvoicePrompt(textContent);
            const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "mistral",
                    prompt,
                    stream: false,
                    options: { temperature: 0.1, num_predict: 2048 },
                }),
            });

            if (response.ok) {
                const data = await response.json();
                return parseOllamaResponse(data.response);
            }
        } catch (err) {
            console.warn("[spreadsheet-parser] Ollama fallback failed:", err);
        }

        // Try Claude as last resort
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) throw new Error("No AI parser available for unrecognized spreadsheet headers");

        const prompt = extractInvoicePrompt(textContent);
        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 2048,
                messages: [
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
            }),
        });

        if (!response.ok) {
            throw new Error(`Claude API error: ${response.status}`);
        }

        const data = await response.json();
        const text = data.content[0]?.text ?? "";
        return parseOllamaResponse(text);
    },
};
