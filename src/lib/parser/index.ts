import type { ParsedInvoice } from "./types";
import { ollamaParser } from "./ollama";
import { claudeFallbackParser } from "./claude-fallback";
import { spreadsheetParser } from "./spreadsheet";

const SPREADSHEET_EXTENSIONS = [".xlsx", ".xls", ".csv"];

function getFileExtension(filename: string): string {
    const dot = filename.lastIndexOf(".");
    return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
}

export function isSpreadsheetFile(filename: string): boolean {
    return SPREADSHEET_EXTENSIONS.includes(getFileExtension(filename));
}

export async function parseInvoice(
    fileBuffer: Buffer,
    filename?: string
): Promise<ParsedInvoice> {
    // Route spreadsheet files to the dedicated parser
    if (filename && isSpreadsheetFile(filename)) {
        try {
            return await spreadsheetParser.parse(fileBuffer);
        } catch (spreadsheetError) {
            console.warn("Spreadsheet parsing failed:", spreadsheetError);
            // Don't fall through to PDF parsers — they can't handle spreadsheets
            throw new Error("Spreadsheet parsing failed. Invoice cannot be processed.");
        }
    }

    // PDF path: try Ollama first, then Claude fallback
    let isScannedPdf = false;

    try {
        return await ollamaParser.parse(fileBuffer);
    } catch (ollamaError) {
        const msg = ollamaError instanceof Error ? ollamaError.message : String(ollamaError);
        if (msg.startsWith("SCANNED_PDF")) {
            isScannedPdf = true;
            console.warn("Scanned/image PDF detected — Ollama cannot extract text. Falling back to Claude vision.");
        } else {
            console.warn("Ollama parsing failed, trying Claude fallback:", ollamaError);
        }
    }

    // Fallback to Claude API
    try {
        return await claudeFallbackParser.parse(fileBuffer);
    } catch (claudeError) {
        console.error("Claude fallback also failed:", claudeError);
        if (isScannedPdf) {
            throw new Error(
                "This invoice appears to be a scanned image. Please set ANTHROPIC_API_KEY for Claude vision, or ask the supplier for a text-based PDF."
            );
        }
        throw new Error("All parsers failed. Invoice cannot be processed.");
    }
}

export type { IInvoiceParser, ParsedInvoice } from "./types";
