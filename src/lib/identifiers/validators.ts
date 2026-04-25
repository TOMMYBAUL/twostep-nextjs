/**
 * Validators pour identifiants produits — socle cascade Tier 1.
 *
 * Cf. brain Two-Step `06-Tech/Socle-identification-cascade.md` :
 * "Checksum GTIN obligatoire à l'entrée — pas de propagation d'EAN invalide"
 *
 * Algorithmes publics :
 * - EAN-13/UPC-A : checksum mod 10 avec poids alterné (1, 3)
 * - EAN-8 : idem mais 8 chiffres
 * - ISBN-13 : sous-cas EAN-13 avec préfixes 978/979
 * - CIP-13 : sous-cas EAN-13 avec préfixe 340 (médicaments FR, décret 2021-1931)
 */

export type IdentifierType =
    | "ean13"
    | "ean8"
    | "upc12"
    | "isbn13"
    | "cip13"
    | "invalid";

const DIGITS_ONLY = /^\d+$/;
const ISBN13_PREFIX = /^97[89]/;
const CIP13_PREFIX = /^340/;

/**
 * Strip tous les caractères non-chiffres (espaces, tirets, apostrophes Excel,
 * caractères invisibles). Retourne string vide si aucun chiffre exploitable.
 */
export function normalizeIdentifier(input: unknown): string {
    if (typeof input !== "string") return "";
    return input.replace(/\D/g, "");
}

/**
 * Calcule le checksum GTIN selon la spec GS1 (mod 10, poids alterné 1/3 en
 * partant de la droite avant le checksum).
 *
 * Marche pour EAN-13, UPC-A (12 chiffres = EAN-13 préfixé 0), EAN-8.
 * Le `digits` doit être l'identifiant COMPLET (avec checksum). On retourne
 * true si le checksum embarqué = celui calculé sur les n-1 premiers chiffres.
 */
function isValidGtinChecksum(digits: string): boolean {
    if (!DIGITS_ONLY.test(digits)) return false;
    if (digits.length < 8) return false;
    const len = digits.length;
    const checkDigit = Number.parseInt(digits[len - 1], 10);

    let sum = 0;
    for (let i = 0; i < len - 1; i++) {
        const d = Number.parseInt(digits[i], 10);
        // Position depuis la droite (avant checksum) = (len-2-i)
        // Pondération alternée : impair (depuis droite) = 3, pair = 1
        const positionFromRight = len - 2 - i;
        const weight = positionFromRight % 2 === 0 ? 3 : 1;
        sum += d * weight;
    }
    const computed = (10 - (sum % 10)) % 10;
    return computed === checkDigit;
}

export function isValidEan13(input: string): boolean {
    return input.length === 13 && isValidGtinChecksum(input);
}

export function isValidEan8(input: string): boolean {
    return input.length === 8 && isValidGtinChecksum(input);
}

/**
 * UPC-A est un EAN-13 préfixé par '0'. Un code UPC-12 valide doit donc, une
 * fois préfixé '0', avoir un checksum EAN-13 correct. (En pratique le check
 * sur 12 chiffres seuls donne le même résultat à cause du 0 en tête poids 1.)
 */
export function isValidUpc12(input: string): boolean {
    return input.length === 12 && isValidGtinChecksum(input);
}

export function isValidIsbn13(input: string): boolean {
    return isValidEan13(input) && ISBN13_PREFIX.test(input);
}

export function isValidCip13(input: string): boolean {
    return isValidEan13(input) && CIP13_PREFIX.test(input);
}

/**
 * Convertit un UPC-12 valide en EAN-13 (préfixe '0').
 * Retourne null si invalide.
 */
export function upc12ToEan13(input: string): string | null {
    const normalized = normalizeIdentifier(input);
    if (!isValidUpc12(normalized)) return null;
    return "0" + normalized;
}

/**
 * Détection automatique du type d'identifiant après normalisation.
 * Renvoie "invalid" pour tout ce qui ne passe pas un checksum correct
 * (ex : "123ABC456789X" → "" → invalid ; "805 0597 33846 0" → "8050597338460"
 * = 13 chiffres MAIS checksum invalide → invalid).
 *
 * NB : "ean13" inclut les codes qui ne sont ni ISBN ni CIP (ex retail générique).
 */
export function detectIdentifierType(input: unknown): IdentifierType {
    const normalized = normalizeIdentifier(input);
    if (!normalized) return "invalid";

    if (normalized.length === 13 && isValidEan13(normalized)) {
        if (ISBN13_PREFIX.test(normalized)) return "isbn13";
        if (CIP13_PREFIX.test(normalized)) return "cip13";
        return "ean13";
    }
    if (normalized.length === 12 && isValidUpc12(normalized)) return "upc12";
    if (normalized.length === 8 && isValidEan8(normalized)) return "ean8";
    return "invalid";
}

/**
 * Pipeline complet d'entrée : normalize + validate + retourne la forme
 * canonique EAN-13 (UPC-12 → EAN-13 préfixé '0', EAN-8 conservé tel quel,
 * invalide → null).
 *
 * À utiliser SYSTÉMATIQUEMENT sur tout EAN reçu d'un POS / CSV / scan
 * avant de le stocker en DB ou de l'envoyer en lookup.
 */
export function canonicalizeEan(input: unknown): string | null {
    const normalized = normalizeIdentifier(input);
    if (!normalized) return null;
    const type = detectIdentifierType(normalized);
    switch (type) {
        case "ean13":
        case "isbn13":
        case "cip13":
            return normalized;
        case "upc12":
            return "0" + normalized;
        case "ean8":
            return normalized;
        case "invalid":
        default:
            return null;
    }
}
