import crypto from "crypto";

/**
 * Génération d'étiquettes code-barres Code128 pour les produits SANS EAN
 * fabricant (créateurs). Le marchand crée le produit → on génère un SKU interne
 * → on l'encode en Code128 (imprimable) → il le colle → ce code devient
 * l'identifiant de synchro (scan à la réception et à la vente).
 *
 * Code Set B (ASCII 32-126) : couvre les SKU alphanumériques (MAJ, chiffres, tiret).
 */

// Table canonique Code128 : valeur (0-106) → largeurs de modules (bar,space,…).
// Index 103=Start A, 104=Start B, 105=Start C, 106=Stop.
const PATTERNS = [
    "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
    "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
    "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
    "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
    "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
    "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
    "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
    "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
    "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
    "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
    "114131","311141","411131","211412","211214","211232","2331112",
];

const START_B = 104;
const STOP = 106;
const CODE128B_MIN = 32;
const CODE128B_MAX = 126;

/**
 * Encode une chaîne (ASCII 32-126) en suite de valeurs Code128B :
 * [Start B, …valeurs data, checksum, Stop].
 * Checksum = (StartValue + Σ position*valeur) mod 103, position 1-indexée.
 */
export function encode128B(data: string): number[] {
    const values: number[] = [START_B];
    let sum = START_B;
    let pos = 1;
    for (const ch of data) {
        const code = ch.charCodeAt(0);
        if (code < CODE128B_MIN || code > CODE128B_MAX) {
            throw new Error(`Caractère hors Code128B: "${ch}" (${code})`);
        }
        const value = code - 32;
        values.push(value);
        sum += pos * value;
        pos++;
    }
    values.push(sum % 103); // checksum
    values.push(STOP);
    return values;
}

/** Concatène les patterns de largeurs pour une suite de valeurs. */
function valuesToWidths(values: number[]): string {
    return values.map((v) => PATTERNS[v]).join("");
}

/**
 * Rend un SVG Code128 scannable pour `data`.
 * @param moduleWidth largeur d'un module en px (défaut 2).
 * @param height hauteur des barres en px (défaut 60).
 */
export function renderCode128Svg(data: string, moduleWidth = 2, height = 60): string {
    const widths = valuesToWidths(encode128B(data));
    const quiet = 10 * moduleWidth; // zone de silence ≥ 10 modules de chaque côté
    let x = quiet;
    const bars: string[] = [];
    let isBar = true; // commence par une barre
    for (const w of widths) {
        const mw = Number(w) * moduleWidth;
        if (isBar) {
            bars.push(`<rect x="${x}" y="0" width="${mw}" height="${height}" fill="#000"/>`);
        }
        x += mw;
        isBar = !isBar;
    }
    const totalWidth = x + quiet;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" viewBox="0 0 ${totalWidth} ${height}"><rect width="${totalWidth}" height="${height}" fill="#fff"/>${bars.join("")}</svg>`;
}

/** Nombre total de modules d'un code (utile pour tests/layout). */
export function code128ModuleCount(data: string): number {
    return valuesToWidths(encode128B(data))
        .split("")
        .reduce((n, d) => n + Number(d), 0);
}

const SKU_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans I,O,0,1 (ambiguïté visuelle)

/**
 * Génère un SKU interne Two-Step pour un produit sans EAN.
 * Format: `TS-XXXXXXXX` (8 caractères non ambigus). Sûr pour Code128B.
 */
export function generateInternalSku(): string {
    const bytes = crypto.randomBytes(8);
    let s = "";
    for (let i = 0; i < 8; i++) s += SKU_ALPHABET[bytes[i] % SKU_ALPHABET.length];
    return `TS-${s}`;
}
