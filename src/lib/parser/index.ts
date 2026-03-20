import type { ParsedInvoice } from "./types";
import { ollamaParser } from "./ollama";
import { claudeFallbackParser } from "./claude-fallback";

export async function parseInvoice(pdfBuffer: Buffer): Promise<ParsedInvoice> {
    // Try Ollama first
    try {
        return await ollamaParser.parse(pdfBuffer);
    } catch (ollamaError) {
        console.warn("Ollama parsing failed, trying Claude fallback:", ollamaError);
    }

    // Fallback to Claude API
    try {
        return await claudeFallbackParser.parse(pdfBuffer);
    } catch (claudeError) {
        console.error("Claude fallback also failed:", claudeError);
        throw new Error("All parsers failed. Invoice cannot be processed.");
    }
}

export type { IInvoiceParser, ParsedInvoice } from "./types";
