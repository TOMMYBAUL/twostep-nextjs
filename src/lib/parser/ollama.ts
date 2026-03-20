import type { IInvoiceParser, ParsedInvoice } from "./types";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

export function extractInvoicePrompt(pdfText: string): string {
    return `Tu es un assistant qui extrait les données d'une facture fournisseur.

Extrais les informations suivantes du texte de facture ci-dessous et retourne UNIQUEMENT du JSON valide (pas de texte avant ou après) :

{
  "supplier_name": "nom du fournisseur",
  "invoice_date": "YYYY-MM-DD ou null",
  "items": [
    {
      "name": "nom du produit",
      "ean": "code EAN/code-barres à 13 chiffres ou null",
      "quantity": nombre_entier,
      "unit_price": prix_unitaire_HT_decimal_ou_null
    }
  ]
}

Règles :
- EAN = code à 13 chiffres commençant souvent par 3 (France). Si absent, mettre null.
- quantity = nombre d'unités commandées (entier)
- unit_price = prix unitaire HT (pas TTC). Si pas trouvé, mettre null.
- Si une ligne est un frais de port ou un service (pas un produit physique), l'ignorer.

Texte de la facture :
---
${pdfText}
---

JSON :`;
}

export function parseOllamaResponse(raw: string): ParsedInvoice {
    let jsonStr = raw.trim();

    // Remove markdown code fences
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
    }

    // Try to find JSON object boundaries
    const firstBrace = jsonStr.indexOf("{");
    const lastBrace = jsonStr.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) {
        jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
    }

    const parsed = JSON.parse(jsonStr);

    return {
        supplier_name: parsed.supplier_name ?? null,
        invoice_date: parsed.invoice_date ?? null,
        items: (parsed.items ?? []).map((item: Record<string, unknown>) => ({
            name: String(item.name ?? ""),
            ean: item.ean ? String(item.ean) : null,
            quantity: Number(item.quantity) || 1,
            unit_price: item.unit_price != null ? Number(item.unit_price) : null,
        })),
    };
}

export const ollamaParser: IInvoiceParser = {
    name: "ollama",

    async parse(pdfBuffer: Buffer): Promise<ParsedInvoice> {
        // Step 1: Extract text from PDF using pdf-parse
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
        const pdfData = await pdfParse(pdfBuffer);
        const pdfText = pdfData.text;

        if (!pdfText.trim()) {
            throw new Error("PDF contains no extractable text");
        }

        // Step 2: Send extracted text to Ollama Mistral 7B
        const prompt = extractInvoicePrompt(pdfText);

        const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "mistral",
                prompt,
                stream: false,
                options: {
                    temperature: 0.1,
                    num_predict: 2048,
                },
            }),
        });

        if (!response.ok) {
            throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return parseOllamaResponse(data.response);
    },
};
