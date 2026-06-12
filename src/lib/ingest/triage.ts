import type { ParsedInvoiceItem } from "@/lib/parser/types";
import { validEanOrNull } from "@/lib/ean/validate";

/**
 * Triage d'identité des lignes d'un fichier stock — LE point d'application de la
 * règle « zéro identité devinée » (alignée sur le contrat NearSt) :
 *
 *   - GTIN (EAN-8/UPC/EAN-13/GTIN-14, checksum valide) → identité FORTE :
 *     enrichissement automatique par les bases mondiales, publiable si score ≥ 0,95.
 *   - SKU (code interne alphanumérique, y compris un "EAN" au checksum faux =
 *     probable faute de frappe) → identité FAIBLE : le stock est suivi, mais le
 *     produit reste masqué tant que sa fiche n'est pas complétée/validée.
 *   - Ni l'un ni l'autre (nom seul, ligne vide, code inexploitable) → REJETÉ.
 *     Un nom n'est PAS une identité : deux produits différents peuvent porter le
 *     même libellé, et un libellé ne se résout dans aucune base avec certitude.
 *
 * Chaque rejet est compté et échantillonné pour que le wizard d'import puisse
 * dire au marchand CE QUI a été ignoré et POURQUOI — jamais de perte silencieuse.
 */

export type IdentityKind = "gtin" | "sku";

export type TriagedItem = ParsedInvoiceItem & {
    identity: IdentityKind;
};

export type RejectReason = "no_identifier" | "invalid_identifier";

export type RejectedLine = {
    /** Libellé de la ligne (aide le marchand à la retrouver dans son fichier). */
    name: string | null;
    /** Code brut refusé, le cas échéant. */
    code: string | null;
    reason: RejectReason;
};

export type TriageReport = {
    accepted: TriagedItem[];
    /** Lignes à identité forte (GTIN valide) — enrichissables automatiquement. */
    gtin_lines: number;
    /** Lignes à identité faible (SKU) — stock suivi, fiche à compléter. */
    sku_lines: number;
    /** Nombre total de lignes rejetées (sans identité exploitable). */
    rejected_lines: number;
    /** Échantillon des rejets (max 50) pour l'affichage wizard. */
    rejected_samples: RejectedLine[];
};

const MAX_REJECTED_SAMPLES = 50;

/**
 * Un SKU exploitable : 3 à 32 caractères, commence par un alphanumérique,
 * caractères usuels des références internes. (NearSt impose 6-32 ; on descend à 3
 * car les codes courts type PLU — "4011" — sont courants dans les caisses FR, et
 * chez nous le SKU est scoppé au marchand, pas exposé à Google.)
 */
const SKU_RE = /^[A-Za-z0-9][A-Za-z0-9 ._/#+-]{2,31}$/;

export function isExploitableSku(raw: string | null | undefined): boolean {
    if (!raw) return false;
    return SKU_RE.test(raw.trim());
}

/** Le nom est-il un placeholder généré par le parseur (pas un vrai libellé) ? */
export function isPlaceholderName(name: string | null | undefined): boolean {
    if (!name) return true;
    return /^(EAN|REF)\s/i.test(name.trim());
}

export function triageStockItems(items: ParsedInvoiceItem[]): TriageReport {
    const accepted: TriagedItem[] = [];
    const rejectedSamples: RejectedLine[] = [];
    let gtinLines = 0;
    let skuLines = 0;
    let rejectedLines = 0;

    for (const item of items) {
        // Identité forte : GTIN à checksum valide, dans la colonne code-barres
        // OU dans la colonne référence (certaines caisses y mettent l'EAN).
        const gtin = validEanOrNull(item.ean) ?? validEanOrNull(item.sku);
        if (gtin) {
            // Si le GTIN venait de la colonne SKU, on ne duplique pas la valeur.
            const sku = item.sku && validEanOrNull(item.sku) === gtin ? null : item.sku;
            accepted.push({ ...item, ean: gtin, sku, identity: "gtin" });
            gtinLines++;
            continue;
        }

        // Identité faible : code interne. Un "EAN" au checksum faux est
        // probablement une faute de frappe → on le suit comme code interne,
        // sans jamais l'envoyer aux lookups GTIN.
        const skuCandidate = item.sku?.trim() || item.ean?.trim() || null;
        if (skuCandidate && isExploitableSku(skuCandidate)) {
            accepted.push({ ...item, ean: null, sku: skuCandidate, identity: "sku" });
            skuLines++;
            continue;
        }

        // Rejet : aucune identité exploitable. Le nom seul ne suffit pas.
        rejectedLines++;
        if (rejectedSamples.length < MAX_REJECTED_SAMPLES) {
            rejectedSamples.push({
                name: isPlaceholderName(item.name) ? null : item.name,
                code: skuCandidate,
                reason: skuCandidate ? "invalid_identifier" : "no_identifier",
            });
        }
    }

    return {
        accepted,
        gtin_lines: gtinLines,
        sku_lines: skuLines,
        rejected_lines: rejectedLines,
        rejected_samples: rejectedSamples,
    };
}
