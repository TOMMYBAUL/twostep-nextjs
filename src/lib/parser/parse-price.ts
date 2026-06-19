/**
 * Parse un montant exporté par une caisse / un tableur, robuste aux formats FR/EN
 * et aux séparateurs de milliers — là où `Number(String(x).replace(",", "."))`
 * échouait silencieusement (ex. "1 234,56 €" → NaN → prix PERDU pour les articles
 * > 1000 €).
 *
 * Stratégie (conservatrice, pour éviter tout faux positif sur la fiche) :
 *  - retire symboles monétaires + espaces (y c. insécables U+00A0 / U+202F, couverts
 *    par `\s` en JS) ;
 *  - DEUX séparateurs présents ("." et ",") : le plus à DROITE est le décimal,
 *    l'autre = milliers (gère "1.234,56" ET "1,234.56") ;
 *  - UN seul séparateur : ≤2 décimales → décimal ("12,5" / "1234,56") ;
 *    3 décimales ou multiples occurrences → milliers ("1,234"/"1.234"→1234,
 *    "1,000,000"→1000000) — convention retail FR (un prix décimal a 2 chiffres) ;
 *  - sinon entier. Retourne null si non finançable.
 *
 * NE borne PAS la valeur (>0, <100k) : c'est au caller d'appliquer ses garde-fous.
 */
export function parsePrice(raw: unknown): number | null {
    if (raw == null) return null;
    let s = String(raw).trim();
    if (!s) return null;
    s = s.replace(/[€$£]/g, "").replace(/\s/g, "");
    if (!s) return null;

    const hasDot = s.includes(".");
    const hasComma = s.includes(",");

    if (hasDot && hasComma) {
        if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
            s = s.replace(/\./g, "").replace(",", ".");
        } else {
            s = s.replace(/,/g, "");
        }
    } else if (hasComma) {
        const parts = s.split(",");
        if (parts.length > 2 || parts[1]?.length === 3) {
            s = parts.join(""); // milliers
        } else {
            s = parts.join("."); // décimal
        }
    } else if (hasDot) {
        const parts = s.split(".");
        if (parts.length > 2 || parts[1]?.length === 3) {
            s = parts.join(""); // milliers
        }
        // sinon point décimal standard : on garde tel quel
    }

    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}
