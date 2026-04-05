export type ParsedInvoiceItem = {
    name: string;
    ean: string | null;
    sku: string | null;
    quantity: number;
    unit_price: number | null;
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
