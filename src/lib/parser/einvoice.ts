import type { IInvoiceParser, ParsedInvoice } from "./types";

/**
 * E-invoice parser for Factur-X / UBL / CII structured formats.
 * Mandatory for all French businesses from 2027.
 * Zero AI required — XML/JSON direct parsing.
 *
 * Implementation will be added when the e-invoicing format is available.
 */
export const einvoiceParser: IInvoiceParser = {
    name: "einvoice",

    async parse(_pdfBuffer: Buffer): Promise<ParsedInvoice> {
        // TODO: Implement when Factur-X/UBL/CII format is available (2027)
        // Will parse XML embedded in PDF (Factur-X) or standalone XML (UBL/CII)
        throw new Error("E-invoice parsing not yet implemented. Available 2027.");
    },
};
