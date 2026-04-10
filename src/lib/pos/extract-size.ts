const CLOTHING_REGEX = /(?:^|[\s—–\-\/,()]+|(?:taille|size|t\.)\s*)(XXXL|XXL|XXS|XL|XS|S|M|L|(?:1[0246]|[2468])A)(?:\s*$|[\s—–\-\/,()]+|$)/i;

// Matches sizes 18-62 (shoes, rings, gloves) with optional .5
// Negative lookbehind rejects quantity patterns: "Lot de", "Pack de", "x", "×"
const NUMERIC_SIZE_REGEX = /(?<!(?:lot\s+de|pack\s+de|boîte\s+de|boite\s+de|set\s+de|coffret\s+de)\s)(?<![\dxX×]\s*)(?:^|[\s—–\-\/,()]+|(?:taille|size|t\.)\s*)((?:1[89]|[2-5][0-9]|6[0-2])(?:\.5)?)(?:\s*$|[\s—–\-\/,()]+|$)/i;

// Reject quantity patterns: "Lot de N", "Pack de N", "x N", "× N"
const QUANTITY_PATTERN = /(?:lot|pack|boîte|boite|set|coffret)\s+de\s+\d+/i;

export function extractSize(name: string): string | null {
    if (!name) return null;

    // If the entire name is a quantity pattern, bail out early
    if (QUANTITY_PATTERN.test(name)) {
        // Strip quantity portion before attempting size extraction
        const stripped = name.replace(QUANTITY_PATTERN, "").trim();
        if (!stripped) return null;
        // Re-run on stripped name (e.g. "Lot de 24 — Taille M" → "— Taille M")
        return extractSizeInner(stripped);
    }

    return extractSizeInner(name);
}

function extractSizeInner(name: string): string | null {
    // Try numeric size first (more specific — avoids matching "S" in words)
    const numericMatch = name.match(NUMERIC_SIZE_REGEX);
    if (numericMatch?.[1]) {
        return numericMatch[1];
    }

    // Try clothing size
    const clothingMatch = name.match(CLOTHING_REGEX);
    if (clothingMatch?.[1]) {
        return clothingMatch[1].toUpperCase();
    }

    return null;
}

/**
 * Remove the size portion from a product name to get the "base name".
 * Used to group sibling products that differ only by size.
 */
export function stripSize(name: string): string {
    if (!name) return "";
    const size = extractSize(name);
    if (!size) return name.trim();

    const idx = name.lastIndexOf(size);
    if (idx === -1) return name.trim();

    let before = name.slice(0, idx);
    const after = name.slice(idx + size.length);
    // Also strip "taille", "size", "t." that precede the size number
    before = before.replace(/\s*(?:taille|size|t\.)\s*$/i, "");
    return (before + after).replace(/[\s\-\/,()]+/g, " ").replace(/^\s+|\s+$/g, "").replace(/\s+/g, " ");
}
