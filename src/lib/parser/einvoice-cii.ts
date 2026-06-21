import type { ParsedInvoiceItem } from "./types";
import { validEanOrNull } from "@/lib/ean/validate";

/**
 * Parseur de facture électronique au format CII (Cross-Industry Invoice),
 * cœur de Factur-X / EN 16931 — obligatoire en réception dès sept. 2026.
 *
 * Extrait, par ligne, l'identifiant article standard BT-157 (GlobalID schemeID
 * "0160" = GTIN GS1) → EAN propre SANS scan ni LLM quand le fournisseur l'a
 * rempli. Plus le nom, la quantité (BT-129) et le prix net (BT-146).
 *
 * Parseur ciblé volontairement léger (pas de dépendance XML) : on découpe par
 * bloc de ligne puis on extrait les champs CII connus. À durcir avec un vrai
 * parseur XML si des cas tordus apparaissent.
 *
 * NB : l'extraction du XML EMBARQUÉ dans le PDF/A-3 Factur-X (pièce jointe
 * `factur-x.xml`) est une étape amont distincte (nécessite un extracteur PDF) —
 * cette fonction prend le XML CII déjà extrait, ou un XML CII autonome.
 */

/**
 * Décode les entités XML d'un texte extrait par regex. Indispensable : en XML
 * valide, `&` est OBLIGATOIREMENT échappé (`&amp;`), donc tout nom de marque/
 * fournisseur avec une esperluette (Dolce & Gabbana, H&M, Abercrombie & Fitch)
 * arrive sous forme `Dolce &amp; Gabbana`. Sans décodage, le nom est stocké
 * pollué → casse l'affichage ET le matching cross-source.
 * Ordre : numériques d'abord, puis nommées, `&amp;` EN DERNIER (sinon
 * `&amp;lt;` se décoderait par erreur en `<` au lieu de `&lt;`).
 */
function decodeXmlEntities(text: string): string {
    return text
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&");
}

function firstMatch(block: string, re: RegExp): string | null {
    const m = block.match(re);
    return m ? decodeXmlEntities(m[1].trim()) : null;
}

/** Découpe le XML en blocs de ligne (IncludedSupplyChainTradeLineItem). */
function splitLineItems(xml: string): string[] {
    const blocks: string[] = [];
    const re = /<ram:IncludedSupplyChainTradeLineItem\b[^>]*>([\s\S]*?)<\/ram:IncludedSupplyChainTradeLineItem>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) blocks.push(m[1]);
    return blocks;
}

export function parseCiiXml(xml: string): ParsedInvoiceItem[] {
    if (!xml || typeof xml !== "string") return [];
    const items: ParsedInvoiceItem[] = [];

    for (const block of splitLineItems(xml)) {
        const name = firstMatch(block, /<ram:Name>([\s\S]*?)<\/ram:Name>/);

        // BT-157 : GlobalID (schemeID 0160 = GTIN). On accepte aussi un GlobalID
        // sans schemeID s'il passe le checksum GTIN.
        let ean: string | null = null;
        const gid =
            firstMatch(block, /<ram:GlobalID\s+schemeID="0160"\s*>([\s\S]*?)<\/ram:GlobalID>/i) ??
            firstMatch(block, /<ram:GlobalID[^>]*>([\s\S]*?)<\/ram:GlobalID>/i);
        if (gid) ean = validEanOrNull(gid);

        const qtyRaw = firstMatch(block, /<ram:BilledQuantity[^>]*>([\s\S]*?)<\/ram:BilledQuantity>/);
        const quantity = qtyRaw != null ? Math.max(0, Math.trunc(Number(qtyRaw))) || 0 : 0;

        // Prix net unitaire : ChargeAmount sous NetPriceProductTradePrice.
        const priceRaw = firstMatch(
            block,
            /<ram:NetPriceProductTradePrice>[\s\S]*?<ram:ChargeAmount[^>]*>([\s\S]*?)<\/ram:ChargeAmount>/,
        );
        // Prix : on préserve 0 (article attesté gratuit ≠ prix inconnu). `Number("")`
        // donne 0, d'où la garde sur la chaîne vide ; `|| null` aurait perdu un 0 légitime.
        const priceNum = priceRaw != null && priceRaw !== "" ? Number(priceRaw) : NaN;
        const unit_price = Number.isFinite(priceNum) ? priceNum : null;

        // Identité requise : nom ou EAN.
        if (!name && !ean) continue;
        items.push({
            name: name ?? (ean ? `EAN ${ean}` : ""),
            ean,
            sku: null,
            brand: null,
            quantity,
            unit_price,
        });
    }

    return items;
}
