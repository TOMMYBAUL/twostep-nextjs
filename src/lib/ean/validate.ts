/**
 * Validation des identifiants GTIN (EAN-13, EAN-8, UPC-A).
 *
 * L'EAN devient la clé d'identité du pipeline d'ingestion : un EAN mal formé
 * (faute de frappe, 12 chiffres au lieu de 13) casse silencieusement tous les
 * lookups d'enrichissement. On valide donc le chiffre de contrôle AVANT de
 * traiter un EAN comme une identité fiable.
 */

/** Garde uniquement les chiffres d'une chaîne (supprime espaces, tirets, etc.). */
export function normalizeEan(raw: string): string {
    return raw.replace(/\D/g, "");
}

/**
 * Vérifie le chiffre de contrôle d'un GTIN-8/12/13/14.
 * Algorithme GS1 standard : somme pondérée (3,1,3,1…) depuis la droite,
 * le complément à la dizaine supérieure doit égaler le dernier chiffre.
 */
export function isValidGtinChecksum(digits: string): boolean {
    const len = digits.length;
    if (![8, 12, 13, 14].includes(len)) return false;

    const body = digits.slice(0, -1);
    const check = Number(digits[len - 1]);

    let sum = 0;
    // En partant de la droite du corps, le poids alterne 3,1,3,1…
    for (let i = 0; i < body.length; i++) {
        const digit = Number(body[body.length - 1 - i]);
        sum += digit * (i % 2 === 0 ? 3 : 1);
    }
    const computed = (10 - (sum % 10)) % 10;
    return computed === check;
}

/**
 * Un EAN exploitable comme identité = GTIN-8/12/13/14 avec checksum valide.
 * Retourne l'EAN normalisé (chiffres seuls) si valide, sinon null.
 */
export function validEanOrNull(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const digits = normalizeEan(raw);
    if (!isValidGtinChecksum(digits)) return null;
    return digits;
}
