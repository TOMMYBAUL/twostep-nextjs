/**
 * Open Facts image extraction (Open Beauty Facts / Open Products Facts / Open Food Facts).
 *
 * MAILLON 9 — "des photos justes" est le problème north-star n°1. Le test réel du 2026-06-27 a
 * prouvé que la recherche Serper par TEXTE renvoie 6/7 photos FAUSSES (un code à 13 chiffres
 * matché contre le texte des pages = bruit ; cf. brand (b) / LESSONS serper.ts). Une image
 * Open Facts est **GTIN-keyée** : liée au code-barres EXACT par le contributeur qui l'a scanné →
 * MÊME frontière de confiance que le nom/marque/catégorie qu'on accepte déjà de cette source.
 * Donc on l'utilise (contrairement à un résultat de recherche Serper, elle n'a PAS besoin de la
 * vérif "est-ce que l'image matche le nom" — elle EST l'image du produit par clé). Les sources
 * la jetaient (`photo_url: null, // Serper handles photos`) → en prod, avec la vérif Haiku
 * fail-closed (a) et sans clé ANTHROPIC, les produits résolus par OBF/OPF n'avaient AUCUNE image.
 *
 * PUR : extrait la meilleure URL d'image de face d'un objet `product` de l'API v2, sinon `null`.
 */
export function extractOpenFactsImage(product: unknown): string | null {
    if (!product || typeof product !== "object") return null;
    const p = product as Record<string, unknown>;

    // Précédence : image de face pleine taille → image principale → display de face sélectionnée.
    const candidates: unknown[] = [
        p.image_front_url,
        p.image_url,
        ...pickSelectedFrontDisplay(p.selected_images),
    ];

    for (const candidate of candidates) {
        const url = normalizeImageUrl(candidate);
        if (url) return url;
    }
    return null;
}

/** `selected_images.front.display.{fr|en|<première langue>}` — repli ordonné FR puis EN. */
function pickSelectedFrontDisplay(selectedImages: unknown): unknown[] {
    if (!selectedImages || typeof selectedImages !== "object") return [];
    const front = (selectedImages as Record<string, unknown>).front;
    if (!front || typeof front !== "object") return [];
    const display = (front as Record<string, unknown>).display;
    if (!display || typeof display !== "object") return [];
    const byLang = display as Record<string, unknown>;
    // FR d'abord (cible marché), puis EN, puis toute autre langue présente (sans re-lister fr/en).
    const others = Object.values(byLang).filter((v) => v !== byLang.fr && v !== byLang.en);
    return [byLang.fr, byLang.en, ...others];
}

/**
 * Une URL d'image n'est retenue que si c'est une chaîne http(s) absolue non vide.
 * On n'émet JAMAIS une chaîne vide (`""`) : Google rejette un `image_link` vide (cf. LESSONS
 * `hasImage !== ""`), et un chemin relatif n'est pas exploitable hors du contexte OBF.
 */
function normalizeImageUrl(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (!/^https?:\/\//i.test(trimmed)) return null;
    return trimmed;
}
