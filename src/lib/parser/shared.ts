import type { ParsedInvoice } from "./types";

export function extractInvoicePrompt(pdfText: string): string {
    return `Tu es un assistant spécialisé dans l'extraction de données de factures fournisseurs pour le commerce de détail (mode, chaussures, cosmétique, électronique, sport).

Extrais les informations et retourne UNIQUEMENT du JSON valide :

{
  "supplier_name": "nom du fournisseur",
  "invoice_date": "YYYY-MM-DD ou null",
  "items": [
    {
      "name": "nom COMPLET du produit incluant marque, modèle, couleur et taille si présents",
      "ean": "code EAN/GTIN à 13 chiffres ou UPC à 12 chiffres, ou null",
      "sku": "référence fournisseur / code article si présent, ou null",
      "quantity": nombre_entier,
      "unit_price": prix_unitaire_HT_decimal_ou_null
    }
  ]
}

Règles CRITIQUES :
- EAN/GTIN est la donnée la PLUS importante. Cherche dans les colonnes : EAN, GTIN, Code-barres, Barcode, Code EAN, CUP, UPC. C'est un nombre à 12 ou 13 chiffres. NE CONFONDS PAS avec un numéro de facture ou un code postal.
- SKU/Référence : cherche dans les colonnes : Réf, Ref, SKU, Code article, Art., Référence. C'est le code interne du fournisseur.
- name : reconstitue le nom COMPLET du produit. Si la facture abrège (ex: "NK AF1 07 BLK 42"), développe en "Nike Air Force 1 '07 Black 42". Inclus TOUJOURS : marque + modèle + couleur + taille quand ces infos sont présentes sur la ligne ou déductibles du contexte.
- quantity = nombre d'unités (entier)
- unit_price = prix unitaire HT. Si seul le TTC est disponible, divise par 1.20 (TVA 20%).
- Ignore les lignes de frais de port, remises globales et services.

Texte de la facture :
---
${pdfText}
---

JSON :`;
}

export function parseJsonResponse(raw: string): ParsedInvoice {
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
            sku: item.sku ? String(item.sku) : null,
            quantity: Number(item.quantity) || 1,
            unit_price: item.unit_price != null ? Number(item.unit_price) : null,
        })),
    };
}
