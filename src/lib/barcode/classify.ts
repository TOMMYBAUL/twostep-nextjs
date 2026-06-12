import { isValidGtinChecksum, normalizeEan } from "@/lib/ean/validate";

/**
 * Classification d'un code scanné, pour orienter le workflow de réception.
 *
 *  - gtin13     : code-barres consommateur (EAN-13/UPC-A) → identité produit.
 *  - gtin14_case: code de CARTON (ITF-14) → représente un colis de N unités.
 *                 La conversion ITF-14 → GTIN-13 contenu n'est PAS un simple calcul
 *                 (dépend de la hiérarchie d'emballage de la marque) ; on demande
 *                 donc au marchand la quantité du colis (+N) plutôt que de deviner.
 *  - sku        : code interne (Code128 alphanumérique, ou notre TS-XXXX).
 *  - invalid    : vide.
 */
export type ScannedCodeKind = "gtin13" | "gtin14_case" | "sku" | "invalid";

export type ScannedCode = {
    kind: ScannedCodeKind;
    /** Valeur normalisée (chiffres pour les GTIN, brute pour SKU). */
    value: string;
};

export function classifyScannedCode(raw: string | null | undefined): ScannedCode {
    if (!raw || !raw.trim()) return { kind: "invalid", value: "" };
    const trimmed = raw.trim();
    const digits = normalizeEan(trimmed);

    // Code purement numérique de longueur GTIN avec checksum valide.
    if (digits === trimmed.replace(/[\s-]/g, "") && (digits.length === 8 || digits.length === 12 || digits.length === 13 || digits.length === 14)) {
        if (isValidGtinChecksum(digits)) {
            if (digits.length === 14) return { kind: "gtin14_case", value: digits };
            return { kind: "gtin13", value: digits };
        }
    }

    // Sinon : code interne / SKU (Code128 alphanumérique).
    return { kind: "sku", value: trimmed };
}
