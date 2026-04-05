import type { ParsedInvoice } from "./types";
import { claudeParser } from "./claude-fallback";
import { geminiParser } from "./gemini-fallback";
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
            throw new Error("Spreadsheet parsing failed. Invoice cannot be processed.");
        }
    }

    // PDF path: Claude API (primary) → Gemini Flash (fallback)
    try {
        return await claudeParser.parse(fileBuffer);
    } catch (claudeError) {
        console.warn("Claude parser failed:", claudeError instanceof Error ? claudeError.message : claudeError);
    }

    // Fallback to Gemini Flash
    try {
        return await geminiParser.parse(fileBuffer);
    } catch (geminiError) {
        console.error("Gemini fallback also failed:", geminiError instanceof Error ? geminiError.message : geminiError);
        throw new Error(
            "Invoice parsing failed: both Claude and Gemini APIs returned errors. Check ANTHROPIC_API_KEY and GEMINI_API_KEY."
        );
    }
}

export type { IInvoiceParser, ParsedInvoice } from "./types";
