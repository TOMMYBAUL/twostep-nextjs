export type ParsedInvoiceItem = {
    name: string;
    ean: string | null;
    sku: string | null;
    brand: string | null;
    quantity: number;
    unit_price: number | null;
    /** Taille issue d'une COLONNE dédiée du fichier (fiable), si présente. null sinon. */
    size?: string | null;
};

export type ParsedInvoice = {
    supplier_name: string | null;
    invoice_date: string | null;
    items: ParsedInvoiceItem[];
};

export interface IInvoiceParser {
    name: string;
    parse(pdfBuffer: Buffer): Promise<ParsedInvoice>;
}
